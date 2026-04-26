/*
 * Acknowledge dispatch (Phase D4 manual-upload pattern).
 *
 * Operator clicks "Print blank form" (handled by generateDeliveryAck),
 * carries the printed form to the school, gets it stamped + signed,
 * scans/photographs it, uploads to GSL Drive (or equivalent existing
 * file storage), then pastes the resulting URL here. This lib
 * advances Dispatch.stage to 'acknowledged' and records the URL +
 * timestamps.
 *
 * Phase 1 simplified state-machine collapse: a single transition
 * sets BOTH deliveredAt (kit physically arrived) AND acknowledgedAt
 * (paperwork on file). Future Phase 1.1 with courier integration
 * may differentiate the two by setting deliveredAt earlier (when
 * courier confirms delivery) and acknowledgedAt later (when the
 * signed form is on file). Phase 1 ships with both set together.
 *
 * Per RUNBOOK section 10 "PI vs Dispatch idempotency divergence",
 * dispatch state mutations are idempotent re-renders for already-
 * past states. acknowledgeDispatch follows that pattern: if the
 * dispatch is already 'acknowledged', returns 'already-acknowledged'
 * without writing.
 *
 * Eligible source stages: po-raised, dispatched, in-transit, delivered.
 * Pending dispatches must transit through raiseDispatch first.
 *
 * URL validation: HTTPS or HTTP, well-formed via URL constructor.
 * Phase 1 trusts operators to paste real Drive/SharePoint links;
 * deeper validation (head request, allowlist of domains) is a
 * Phase 1.1 follow-up if links break in practice.
 *
 * Permission gate: 'mou:upload-delivery-ack' (Admin + OpsHead).
 */

import type {
  AuditEntry,
  Dispatch,
  MOU,
  User,
} from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const ELIGIBLE_SOURCE_STAGES: ReadonlyArray<Dispatch['stage']> = [
  'po-raised',
  'dispatched',
  'in-transit',
  'delivered',
]

export interface AcknowledgeDispatchArgs {
  dispatchId: string
  signedHandoverFormUrl: string
  acknowledgedBy: string
}

export type AcknowledgeDispatchFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'dispatch-not-found'
  | 'mou-not-found'
  | 'wrong-stage'
  | 'already-acknowledged'
  | 'invalid-url'

export type AcknowledgeDispatchResult =
  | { ok: true; dispatch: Dispatch }
  | { ok: false; reason: AcknowledgeDispatchFailureReason }

export interface AcknowledgeDispatchDeps {
  dispatches: Dispatch[]
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: AcknowledgeDispatchDeps = {
  dispatches: dispatchesJson as unknown as Dispatch[],
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function isValidUrl(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export async function acknowledgeDispatch(
  args: AcknowledgeDispatchArgs,
  deps: AcknowledgeDispatchDeps = defaultDeps,
): Promise<AcknowledgeDispatchResult> {
  const user = deps.users.find((u) => u.id === args.acknowledgedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:upload-delivery-ack')) {
    return { ok: false, reason: 'permission' }
  }

  if (!isValidUrl(args.signedHandoverFormUrl)) {
    return { ok: false, reason: 'invalid-url' }
  }

  const dispatch = deps.dispatches.find((d) => d.id === args.dispatchId)
  if (!dispatch) return { ok: false, reason: 'dispatch-not-found' }
  if (dispatch.stage === 'acknowledged') {
    return { ok: false, reason: 'already-acknowledged' }
  }
  if (!ELIGIBLE_SOURCE_STAGES.includes(dispatch.stage)) {
    return { ok: false, reason: 'wrong-stage' }
  }

  const mou = deps.mous.find((m) => m.id === dispatch.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const ts = deps.now().toISOString()
  const trimmedUrl = args.signedHandoverFormUrl.trim()

  const dispatchAudit: AuditEntry = {
    timestamp: ts,
    user: args.acknowledgedBy,
    action: 'delivery-acknowledged',
    before: {
      stage: dispatch.stage,
      deliveredAt: dispatch.deliveredAt,
      acknowledgedAt: dispatch.acknowledgedAt,
      acknowledgementUrl: dispatch.acknowledgementUrl,
    },
    after: {
      stage: 'acknowledged',
      deliveredAt: dispatch.deliveredAt ?? ts,
      acknowledgedAt: ts,
      acknowledgementUrl: trimmedUrl,
    },
    notes: `Recorded signed handover form on file at ${trimmedUrl}.`,
  }

  const updatedDispatch: Dispatch = {
    ...dispatch,
    stage: 'acknowledged',
    deliveredAt: dispatch.deliveredAt ?? ts,
    acknowledgedAt: ts,
    acknowledgementUrl: trimmedUrl,
    auditLog: [...dispatch.auditLog, dispatchAudit],
  }

  const mouAudit: AuditEntry = {
    timestamp: ts,
    user: args.acknowledgedBy,
    action: 'delivery-acknowledged',
    after: {
      dispatchId: dispatch.id,
      installmentSeq: dispatch.installmentSeq,
      acknowledgementUrl: trimmedUrl,
    },
    notes: `Acknowledged dispatch ${dispatch.id} for instalment ${dispatch.installmentSeq}.`,
  }
  const updatedMou: MOU = { ...mou, auditLog: [...mou.auditLog, mouAudit] }

  await deps.enqueue({
    queuedBy: args.acknowledgedBy,
    entity: 'dispatch',
    operation: 'update',
    payload: updatedDispatch as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.acknowledgedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  return { ok: true, dispatch: updatedDispatch }
}
