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
import dispatchesJson from '@/data/dispatches.json'
import usersJson from '@/data/users.json'

export interface OverrideAuditDeps {
  dispatches: Dispatch[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
  uuid: () => string
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
  if (dispatch.overrideEvent !== null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} already has an overrideEvent; idempotency guard`,
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

  const updatedDispatch: Dispatch = {
    ...dispatch,
    overrideEvent,
    auditLog: [...dispatch.auditLog, dispatchAudit],
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
    status: 'open',
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

  await deps.enqueue({
    queuedBy: overriddenBy,
    entity: 'dispatch',
    operation: 'update',
    payload: updatedDispatch as unknown as Record<string, unknown>,
  })
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
  if (dispatch.overrideEvent === null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} has no overrideEvent to acknowledge`,
    )
  }
  if (dispatch.overrideEvent.acknowledgedBy !== null) {
    throw new OverrideAuditError(
      `Dispatch ${dispatchId} overrideEvent is already acknowledged`,
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

  await deps.enqueue({
    queuedBy: acknowledgedBy,
    entity: 'dispatch',
    operation: 'update',
    payload: updatedDispatch as unknown as Record<string, unknown>,
  })

  return updatedDispatch
}
