/*
 * Kanban transition writer (W3-C C2).
 *
 * Pure-ish lib (DI seam for tests + production). Validates the
 * (fromStage, toStage, reason, mouId, user) tuple, classifies the
 * transition via classifyTransition, and writes a
 * 'kanban-stage-transition' audit entry to the MOU's auditLog by
 * enqueuing an MOU update through the existing pendingUpdates queue.
 *
 * Permission: any authenticated user can record a transition.
 * The substantive state-mutation gate stays on the per-stage actions
 * (lib/pi/generatePi.ts, lib/dispatch/raiseDispatch.ts, etc.). This
 * lib captures intent + reason; it does not advance lifecycle data.
 *
 * Reason validation: reason-required transitions (skip / backward /
 * Pre-Ops exit) require min-5-char reason. Forward-by-1 does not
 * require reason and does not emit an audit entry (per the W3-C C2
 * audit-shape decision: forward-by-1's per-stage action is the
 * substantive record).
 *
 * No-op + rejected transitions return without a queue write.
 */

import type { AuditEntry, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  classifyTransition,
  validateReason,
  type KanbanStageKey as _KanbanStageKey,
} from './deriveStageReexport'

type KanbanStageKey = _KanbanStageKey

export interface RecordTransitionArgs {
  mouId: string
  fromStage: KanbanStageKey
  toStage: KanbanStageKey
  reason: string | null
  recordedBy: string  // User.id
}

export type RecordTransitionFailureReason =
  | 'mou-not-found'
  | 'unknown-user'
  | 'reason-missing'
  | 'reason-too-short'
  | 'rejected-pre-ops'
  | 'no-op'

export type RecordTransitionResult =
  | { ok: true; audited: boolean; mouId: string; kind: string }
  | { ok: false; reason: RecordTransitionFailureReason }

export interface RecordTransitionDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: RecordTransitionDeps = {
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function recordTransition(
  args: RecordTransitionArgs,
  deps: RecordTransitionDeps = defaultDeps,
): Promise<RecordTransitionResult> {
  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const classification = classifyTransition(args.fromStage, args.toStage, args.mouId)

  if (classification.kind === 'rejected') {
    return { ok: false, reason: 'rejected-pre-ops' }
  }
  if (classification.kind === 'no-op') {
    return { ok: false, reason: 'no-op' }
  }

  if (classification.reasonRequired) {
    const reasonError = validateReason(args.reason)
    if (reasonError !== null) return { ok: false, reason: reasonError }
  }

  // Forward-by-one: do NOT emit an audit entry. The per-stage action
  // (e.g., 'pi-issued' written by lib/pi/generatePi.ts when the
  // operator completes the form) is the substantive record. Return ok
  // without a queue write so the caller can navigate to the form path.
  if (classification.kind === 'forward-by-one') {
    return { ok: true, audited: false, mouId: args.mouId, kind: classification.kind }
  }

  // Skip / backward / Pre-Ops exit: emit 'kanban-stage-transition'
  // audit entry capturing fromStage / toStage / reason.
  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'kanban-stage-transition',
    before: { stage: args.fromStage },
    after: { stage: args.toStage },
    notes: (args.reason ?? '').trim(),
  }

  const updatedMou: MOU = {
    ...mou,
    auditLog: [...mou.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  return { ok: true, audited: true, mouId: args.mouId, kind: classification.kind }
}
