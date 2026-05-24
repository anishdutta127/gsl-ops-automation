/*
 * Dispatch P2 override audit (Q-J Approach A; step 6.5 Item A).
 *
 * Two write helpers + one gate predicate covering the dispatch
 * pre-payment override flow:
 *
 *   1. writeOverrideAudit({ dispatchId, overriddenBy, reason }):
 *      Leadership-only. Sets dispatch.overrideEvent, appends a
 *      'p2-override' auditLog entry on the dispatch, and creates a
 *      paired Escalation (origin='p2-override', lane='OPS', level='L2',
 *      severity='medium', stage='kit-dispatch') so the override
 *      surfaces in Misba's open-items as well as the audit route.
 *
 *   2. writeOverrideAcknowledgement({ dispatchId, acknowledgedBy }):
 *      Finance-only. Sets overrideEvent.acknowledgedBy /
 *      acknowledgedAt and appends a 'p2-override-acknowledged'
 *      auditLog entry. Acknowledgement is a review-completed marker;
 *      it does NOT unblock or re-block the gate.
 *
 *   3. isGateUnblocked(dispatch): the boolean predicate Ops calls
 *      before raising a PO. True iff the customer paid OR Leadership
 *      authorised pre-payment dispatch.
 *
 * Validation:
 *   - writeOverrideAudit rejects if reason is empty/whitespace, if the
 *     gate is already unlocked (installment1Paid===true), if an
 *     overrideEvent is already set (idempotency), or if the user lacks
 *     'dispatch:override-gate' permission.
 *   - writeOverrideAcknowledgement rejects if no overrideEvent exists
 *     yet, if it has already been acknowledged, or if the user lacks
 *     'dispatch:acknowledge-override' permission.
 *
 * Testability seam: the helpers accept an optional `deps` bundle
 * (dispatches + users + enqueue + now + uuid), default to JSON
 * fixtures and the real queue. Tests inject custom dispatch state and
 * a stub enqueue to avoid touching the queue.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  Dispatch,
  DispatchOverrideEvent,
  Escalation,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform, escalationLevelDefault } from '@/lib/auth/permissions'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { currentBackend } from '@/lib/db/backend'
import dispatchesJson from '@/data/dispatches.json'
import usersJson from '@/data/users.json'

export interface OverrideAuditDeps {
  dispatches: Dispatch[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
  uuid: () => string
  /**
   * P2b.X OCC #3 (2026-05-24): the data-layer guards that REPLACE the
   * old in-memory idempotency checks. The lib still does a fast-path
   * read against deps.dispatches (cheap UX feedback / pre-validation),
   * but the binding correctness guard is these two atomic methods.
   * Tests stub these to control success/conflict outcomes without
   * postgres.
   */
  setOverrideEventIfNull?: typeof dispatchRepo.setOverrideEventIfNull
  acknowledgeOverrideIfUnacknowledged?: typeof dispatchRepo.acknowledgeOverrideIfUnacknowledged
}

const defaultDeps: OverrideAuditDeps = {
  dispatches: dispatchesJson as unknown as Dispatch[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
}

export class OverrideAuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OverrideAuditError'
  }
}

export function isGateUnblocked(dispatch: Dispatch): boolean {
  return dispatch.installment1Paid || dispatch.overrideEvent !== null
}

export interface WriteOverrideAuditArgs {
  dispatchId: string
  overriddenBy: string
  reason: string
}

export interface WriteOverrideAuditResult {
  dispatch: Dispatch
  escalation: Escalation
}

export async function writeOverrideAudit(
  args: WriteOverrideAuditArgs,
  deps: OverrideAuditDeps = defaultDeps,
): Promise<WriteOverrideAuditResult> {
  const { dispatchId, overriddenBy, reason } = args

  const dispatch = deps.dispatches.find((d) => d.id === dispatchId)
  if (!dispatch) {
    throw new OverrideAuditError(`Dispatch not found: ${dispatchId}`)
  }
  if (dispatch.installment1Paid) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} gate is already unlocked (installment1Paid=true); override is not applicable`,
    )
  }
  // P2b.X OCC #3: the in-memory idempotency check is now a FAST-PATH
  // UX check only - returns early with a clear error if the snapshot
  // already shows an overrideEvent. The DATA-LAYER guard below
  // (setOverrideEventIfNull's WHERE override_event IS NULL) is the
  // binding correctness check; it enforces the invariant even when
  // two concurrent requests both see snapshot.overrideEvent === null.
  if (dispatch.overrideEvent !== null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} already has an overrideEvent; idempotency guard (snapshot)`,
    )
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new OverrideAuditError(
      'Override reason is mandatory (non-empty); UI enforces, server defends',
    )
  }
  const user = deps.users.find((u) => u.id === overriddenBy)
  if (!user) {
    throw new OverrideAuditError(`User not found: ${overriddenBy}`)
  }
  if (!canPerform(user, 'dispatch:override-gate')) {
    throw new OverrideAuditError(
      `User ${overriddenBy} lacks 'dispatch:override-gate' permission`,
    )
  }

  const ts = deps.now().toISOString()
  const overrideEvent: DispatchOverrideEvent = {
    overriddenBy,
    overriddenAt: ts,
    reason,
    acknowledgedBy: null,
    acknowledgedAt: null,
  }

  const dispatchAudit: AuditEntry = {
    timestamp: ts,
    user: overriddenBy,
    action: 'p2-override',
    before: { overrideEvent: null },
    after: { overrideEvent },
  }

  // P2b.X OCC #3: data-layer atomic guard. If a concurrent writer
  // landed first, this returns { ok: false, reason: 'already-overridden' }
  // and we throw - same shape as the snapshot-based pre-check above so
  // route callers get a single failure path to map to 409.
  const updatedDispatch: Dispatch = {
    ...dispatch,
    overrideEvent,
    auditLog: [...dispatch.auditLog, dispatchAudit],
  }
  if (deps.setOverrideEventIfNull || currentBackend() === 'postgres') {
    const setOverride = deps.setOverrideEventIfNull
      ?? dispatchRepo.setOverrideEventIfNull.bind(dispatchRepo)
    const setResult = await setOverride(dispatchId, overrideEvent, dispatchAudit, { queuedBy: overriddenBy })
    if (!setResult.ok) {
      if (setResult.reason === 'already-overridden') {
        throw new OverrideAuditError(
          `Dispatch ${dispatchId} already has an overrideEvent; data-layer guard rejected concurrent override`,
        )
      }
      throw new OverrideAuditError(`Dispatch ${dispatchId} not found at the data layer`)
    }
  } else {
    // Json mode fallback: full-row enqueue (the snapshot in-memory
    // check above provides the only guard; production lands on the
    // atomic data-layer branch above).
    await deps.enqueue({
      queuedBy: overriddenBy,
      entity: 'dispatch',
      operation: 'update',
      payload: updatedDispatch as unknown as Record<string, unknown>,
    })
  }

  const assignedTo = escalationLevelDefault('OPS', 'L2')
  const notifiedEmails: string[] = []
  if (assignedTo) {
    const assignee = deps.users.find((u) => u.id === assignedTo)
    if (assignee) notifiedEmails.push(assignee.email)
  }

  const escalation: Escalation = {
    id: `ESC-OVR-${deps.uuid().slice(0, 8)}`,
    createdAt: ts,
    createdBy: overriddenBy,
    schoolId: dispatch.schoolId,
    mouId: dispatch.mouId,
    stage: 'kit-dispatch',
    lane: 'OPS',
    level: 'L2',
    origin: 'p2-override',
    originId: dispatch.id,
    severity: 'medium',
    description: `Dispatch ${dispatch.id} override authorised pre-payment by ${overriddenBy}: ${reason}`,
    assignedTo,
    notifiedEmails,
    status: 'Open',
    category: null,
    type: null,
    waitingOn: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [
      {
        timestamp: ts,
        user: overriddenBy,
        action: 'create',
        notes: `Auto-created from dispatch p2-override on ${dispatch.id}.`,
      },
    ],
  }

  // Dispatch write already landed atomically via setOverrideEventIfNull
  // above; only the escalation create still goes through the queue.
  await deps.enqueue({
    queuedBy: overriddenBy,
    entity: 'escalation',
    operation: 'create',
    payload: escalation as unknown as Record<string, unknown>,
  })

  return { dispatch: updatedDispatch, escalation }
}

export interface WriteOverrideAcknowledgementArgs {
  dispatchId: string
  acknowledgedBy: string
}

export async function writeOverrideAcknowledgement(
  args: WriteOverrideAcknowledgementArgs,
  deps: OverrideAuditDeps = defaultDeps,
): Promise<Dispatch> {
  const { dispatchId, acknowledgedBy } = args

  const dispatch = deps.dispatches.find((d) => d.id === dispatchId)
  if (!dispatch) {
    throw new OverrideAuditError(`Dispatch not found: ${dispatchId}`)
  }
  // P2b.X OCC #3: snapshot fast-path checks (cheap UX feedback). The
  // data-layer atomic guard below is the binding correctness check.
  if (dispatch.overrideEvent === null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} has no overrideEvent to acknowledge (snapshot)`,
    )
  }
  if (dispatch.overrideEvent.acknowledgedBy !== null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} overrideEvent is already acknowledged (snapshot)`,
    )
  }
  const user = deps.users.find((u) => u.id === acknowledgedBy)
  if (!user) {
    throw new OverrideAuditError(`User not found: ${acknowledgedBy}`)
  }
  if (!canPerform(user, 'dispatch:acknowledge-override')) {
    throw new OverrideAuditError(
      `User ${acknowledgedBy} lacks 'dispatch:acknowledge-override' permission`,
    )
  }

  const ts = deps.now().toISOString()
  const updatedOverrideEvent: DispatchOverrideEvent = {
    ...dispatch.overrideEvent,
    acknowledgedBy,
    acknowledgedAt: ts,
  }

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: acknowledgedBy,
    action: 'p2-override-acknowledged',
    before: { overrideEvent: dispatch.overrideEvent },
    after: { overrideEvent: updatedOverrideEvent },
  }

  const updatedDispatch: Dispatch = {
    ...dispatch,
    overrideEvent: updatedOverrideEvent,
    auditLog: [...dispatch.auditLog, auditEntry],
  }
  // P2b.X OCC #3: data-layer atomic guard. WHERE override_event IS NOT
  // NULL AND override_event->>'acknowledgedBy' IS NULL ensures only ONE
  // concurrent acknowledger wins.
  if (deps.acknowledgeOverrideIfUnacknowledged || currentBackend() === 'postgres') {
    const ackOverride = deps.acknowledgeOverrideIfUnacknowledged
      ?? dispatchRepo.acknowledgeOverrideIfUnacknowledged.bind(dispatchRepo)
    const ackResult = await ackOverride(
      dispatchId, updatedOverrideEvent, auditEntry, { queuedBy: acknowledgedBy },
    )
    if (!ackResult.ok) {
      if (ackResult.reason === 'already-acknowledged') {
        throw new OverrideAuditError(
          `Dispatch ${dispatchId} overrideEvent already acknowledged; data-layer guard rejected concurrent ack`,
        )
      }
      if (ackResult.reason === 'no-override') {
        throw new OverrideAuditError(
          `Dispatch ${dispatchId} has no overrideEvent to acknowledge (data-layer)`,
        )
      }
      throw new OverrideAuditError(`Dispatch ${dispatchId} not found at the data layer`)
    }
  } else {
    // Json mode fallback (test-compat).
    await deps.enqueue({
      queuedBy: acknowledgedBy,
      entity: 'dispatch',
      operation: 'update',
      payload: updatedDispatch as unknown as Record<string, unknown>,
    })
  }
  return updatedDispatch
}
