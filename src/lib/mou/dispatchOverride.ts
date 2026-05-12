/*
 * Dispatch override lifecycle (Gate 5A.5 Step 4).
 *
 * Pure transition helpers + enqueueUpdate wrappers for the
 * request -> approve / reject flow. Each transition:
 *   1. validates the current dispatchOverride.status against allowed
 *      precursors (the FSM below)
 *   2. produces the next MOU value with dispatchOverride mutated
 *   3. appends one audit entry to MOU.auditLog with action verb
 *      + before/after snapshot of dispatchOverride
 *   4. queues the result via enqueueUpdate so the cron lands it
 *      on mous.json on the next drain.
 *
 * State machine:
 *
 *   none -> requested        (any user with canRequestDispatchOverride)
 *   requested -> approved    (only the configured approver, or Admin wildcard)
 *   requested -> rejected    (same gate as approved)
 *   approved -> none         (NOT supported; rewinds require Admin JSON edit)
 *   rejected -> requested    (re-request after rejection is allowed)
 *
 * Idempotency: requesting on a MOU already in 'requested' returns the
 * existing record unchanged with outcome 'already-requested'; ditto
 * for approve / reject on already-final states. The lib never throws
 * on harmless duplicate calls; it returns a typed outcome the route
 * uses to decide the response shape.
 */

import { enqueueUpdate } from '@/lib/pendingUpdates'
import type {
  AuditEntry,
  MOU,
  MouDispatchOverride,
} from '@/lib/types'

const EMPTY_OVERRIDE: MouDispatchOverride = {
  status: 'none',
  requestedBy: null,
  requestedAt: null,
  requestReason: null,
  approvedBy: null,
  approvedAt: null,
  approvalNotes: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
}

export function readOverride(mou: MOU): MouDispatchOverride {
  return mou.dispatchOverride ?? EMPTY_OVERRIDE
}

export type RequestOutcome =
  | { ok: true; next: MOU; alreadyRequested: false }
  | { ok: true; next: MOU; alreadyRequested: true }
  | { ok: false; reason: 'invalid-state' | 'empty-reason' }

export function planRequest(args: {
  mou: MOU
  byUserId: string
  reason: string
  now: Date
}): RequestOutcome {
  const reason = args.reason.trim()
  if (reason === '') return { ok: false, reason: 'empty-reason' }
  const current = readOverride(args.mou)
  if (current.status === 'requested') {
    return { ok: true, next: args.mou, alreadyRequested: true }
  }
  if (current.status === 'approved') {
    return { ok: false, reason: 'invalid-state' }
  }
  const nextOverride: MouDispatchOverride = {
    status: 'requested',
    requestedBy: args.byUserId,
    requestedAt: args.now.toISOString(),
    requestReason: reason,
    approvedBy: null,
    approvedAt: null,
    approvalNotes: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
  }
  const audit: AuditEntry = {
    timestamp: args.now.toISOString(),
    user: args.byUserId,
    action: 'dispatch-override-requested',
    before: { dispatchOverride: current },
    after: { dispatchOverride: nextOverride },
    notes: reason,
  }
  const next: MOU = {
    ...args.mou,
    dispatchOverride: nextOverride,
    auditLog: [...args.mou.auditLog, audit],
  }
  return { ok: true, next, alreadyRequested: false }
}

export type ApproveOutcome =
  | { ok: true; next: MOU; alreadyApproved: false }
  | { ok: true; next: MOU; alreadyApproved: true }
  | { ok: false; reason: 'invalid-state' }

export function planApprove(args: {
  mou: MOU
  byUserId: string
  notes: string
  now: Date
}): ApproveOutcome {
  const current = readOverride(args.mou)
  if (current.status === 'approved') {
    return { ok: true, next: args.mou, alreadyApproved: true }
  }
  if (current.status !== 'requested') {
    return { ok: false, reason: 'invalid-state' }
  }
  const trimmedNotes = args.notes.trim()
  const nextOverride: MouDispatchOverride = {
    ...current,
    status: 'approved',
    approvedBy: args.byUserId,
    approvedAt: args.now.toISOString(),
    approvalNotes: trimmedNotes === '' ? null : trimmedNotes,
  }
  const audit: AuditEntry = {
    timestamp: args.now.toISOString(),
    user: args.byUserId,
    action: 'dispatch-override-approved',
    before: { dispatchOverride: current },
    after: { dispatchOverride: nextOverride },
    notes: trimmedNotes === '' ? undefined : trimmedNotes,
  }
  const next: MOU = {
    ...args.mou,
    dispatchOverride: nextOverride,
    auditLog: [...args.mou.auditLog, audit],
  }
  return { ok: true, next, alreadyApproved: false }
}

export type RejectOutcome =
  | { ok: true; next: MOU; alreadyRejected: false }
  | { ok: true; next: MOU; alreadyRejected: true }
  | { ok: false; reason: 'invalid-state' | 'empty-reason' }

export function planReject(args: {
  mou: MOU
  byUserId: string
  reason: string
  now: Date
}): RejectOutcome {
  const reason = args.reason.trim()
  if (reason === '') return { ok: false, reason: 'empty-reason' }
  const current = readOverride(args.mou)
  if (current.status === 'rejected') {
    return { ok: true, next: args.mou, alreadyRejected: true }
  }
  if (current.status !== 'requested') {
    return { ok: false, reason: 'invalid-state' }
  }
  const nextOverride: MouDispatchOverride = {
    ...current,
    status: 'rejected',
    rejectedBy: args.byUserId,
    rejectedAt: args.now.toISOString(),
    rejectionReason: reason,
  }
  const audit: AuditEntry = {
    timestamp: args.now.toISOString(),
    user: args.byUserId,
    action: 'dispatch-override-rejected',
    before: { dispatchOverride: current },
    after: { dispatchOverride: nextOverride },
    notes: reason,
  }
  const next: MOU = {
    ...args.mou,
    dispatchOverride: nextOverride,
    auditLog: [...args.mou.auditLog, audit],
  }
  return { ok: true, next, alreadyRejected: false }
}

// ---------------------------------------------------------------------------
// Queue writers: thin wrappers around the planners + enqueueUpdate.
// ---------------------------------------------------------------------------

export async function enqueueRequest(args: {
  mou: MOU
  byUserId: string
  reason: string
  now?: Date
}): Promise<RequestOutcome> {
  const outcome = planRequest({
    mou: args.mou,
    byUserId: args.byUserId,
    reason: args.reason,
    now: args.now ?? new Date(),
  })
  if (outcome.ok && !outcome.alreadyRequested) {
    await enqueueUpdate({
      queuedBy: args.byUserId,
      entity: 'mou',
      operation: 'update',
      payload: outcome.next as unknown as Record<string, unknown>,
    })
  }
  return outcome
}

export async function enqueueApprove(args: {
  mou: MOU
  byUserId: string
  notes: string
  now?: Date
}): Promise<ApproveOutcome> {
  const outcome = planApprove({
    mou: args.mou,
    byUserId: args.byUserId,
    notes: args.notes,
    now: args.now ?? new Date(),
  })
  if (outcome.ok && !outcome.alreadyApproved) {
    await enqueueUpdate({
      queuedBy: args.byUserId,
      entity: 'mou',
      operation: 'update',
      payload: outcome.next as unknown as Record<string, unknown>,
    })
  }
  return outcome
}

export async function enqueueReject(args: {
  mou: MOU
  byUserId: string
  reason: string
  now?: Date
}): Promise<RejectOutcome> {
  const outcome = planReject({
    mou: args.mou,
    byUserId: args.byUserId,
    reason: args.reason,
    now: args.now ?? new Date(),
  })
  if (outcome.ok && !outcome.alreadyRejected) {
    await enqueueUpdate({
      queuedBy: args.byUserId,
      entity: 'mou',
      operation: 'update',
      payload: outcome.next as unknown as Record<string, unknown>,
    })
  }
  return outcome
}
