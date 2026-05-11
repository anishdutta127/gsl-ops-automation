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
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditMOU } from '@/lib/access'

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

const defaultDeps: MarkRenewedDeps = {
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function markRenewed(
  args: MarkRenewedArgs,
  deps: MarkRenewedDeps = defaultDeps,
): Promise<MarkRenewedResult> {
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
