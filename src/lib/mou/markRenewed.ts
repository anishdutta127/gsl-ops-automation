/*
 * MOU "Mark as Renewed" mutator (Gate 4.95 Session 4).
 *
 * Backing lib for POST /api/mou/[id]/mark-renewed. Sets MOU.status to
 * 'Renewed' and appends a status_change audit entry. Permission gate
 * mirrors /mous/[id]/edit (canEditMOU; sales department + Admin
 * wildcard) per the brief: renewals are owned by Sales.
 *
 * No-op when the MOU is already Renewed (returns 'no-change' so the
 * route can surface a friendly toast rather than write a redundant
 * audit entry).
 */

import type { AuditEntry, MOU, User } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditMOU } from '@/lib/access'
import { mouRepo } from '@/lib/db/repos/mou'
import { userRepo } from '@/lib/db/repos/user'

export interface MarkRenewedArgs {
  mouId: string
  changedBy: string
  notes?: string | null
}

export type MarkRenewedFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'no-change'

export type MarkRenewedResult =
  | { ok: true; mou: MOU }
  | { ok: false; reason: MarkRenewedFailureReason }

export interface MarkRenewedDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<MarkRenewedDeps> {
  const [mous, users] = await Promise.all([mouRepo.findAll(), userRepo.findAll()])
  return { mous, users, enqueue: enqueueUpdate, now: () => new Date() }
}

export async function markRenewed(
  args: MarkRenewedArgs,
  depsOverride?: MarkRenewedDeps,
): Promise<MarkRenewedResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.changedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditMOU(user)) return { ok: false, reason: 'permission' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  if (mou.status === 'Renewed') return { ok: false, reason: 'no-change' }

  const ts = deps.now().toISOString()
  const trimmedNotes = (args.notes ?? '').trim()

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.changedBy,
    action: 'status_change',
    before: { status: mou.status },
    after: { status: 'Renewed' },
    notes: trimmedNotes === '' ? undefined : trimmedNotes,
  }

  const updated: MOU = {
    ...mou,
    status: 'Renewed',
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
