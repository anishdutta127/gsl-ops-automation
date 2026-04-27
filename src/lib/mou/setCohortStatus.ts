/*
 * MOU.cohortStatus mutator (W4-A.4 / W4-A.5).
 *
 * Flips a single MOU between cohortStatus 'active' and 'archived'.
 * Used by /mous/archive (Reactivate button) and /admin/mou-status
 * (per-MOU + bulk-edit affordance). Server-side permission gate uses
 * the W4-A new 'mou:edit-cohort-status' Action; Admin-only via the
 * Admin wildcard. OpsHead is intentionally not granted because cohort
 * decisions are leadership-level (which AY counts as the active pursuit).
 *
 * No-change semantics: if the requested target equals the current
 * value, returns failure 'no-change' so the calling route can surface
 * a friendly toast rather than writing a confusing audit entry that
 * shows the same before / after value. Mirrors the W3-D
 * lifecycle-rule edit pattern.
 *
 * Audit anchor: writes a 'mou-cohort-status-changed' AuditEntry to
 * the MOU's auditLog. before / after capture the old + new
 * cohortStatus; notes carry the optional reason text the operator
 * provides.
 */

import type { AuditEntry, CohortStatus, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

export interface SetCohortStatusArgs {
  mouId: string
  target: CohortStatus
  notes?: string | null
  changedBy: string
}

export type SetCohortStatusFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'no-change'

export type SetCohortStatusResult =
  | { ok: true; mou: MOU }
  | { ok: false; reason: SetCohortStatusFailureReason }

export interface SetCohortStatusDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: SetCohortStatusDeps = {
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function setCohortStatus(
  args: SetCohortStatusArgs,
  deps: SetCohortStatusDeps = defaultDeps,
): Promise<SetCohortStatusResult> {
  const user = deps.users.find((u) => u.id === args.changedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:edit-cohort-status')) {
    return { ok: false, reason: 'permission' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  if (mou.cohortStatus === args.target) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()
  const trimmedNotes = (args.notes ?? '').trim()

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.changedBy,
    action: 'mou-cohort-status-changed',
    before: { cohortStatus: mou.cohortStatus },
    after: { cohortStatus: args.target },
    notes: trimmedNotes === '' ? undefined : trimmedNotes,
  }

  const updated: MOU = {
    ...mou,
    cohortStatus: args.target,
    auditLog: [...mou.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.changedBy,
    entity: 'mou',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, mou: updated }
}
