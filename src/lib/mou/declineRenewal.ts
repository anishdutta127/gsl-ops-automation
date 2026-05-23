/*
 * MOU "Decline to renew" mutator (Gate 4.95 Session 4).
 *
 * Backing lib for POST /api/mou/[id]/decline-renewal. Appends a
 * 'mou-renewal-declined' audit entry carrying the operator-supplied
 * reason text. Does NOT mutate MOU.status; the audit signal alone
 * records the decline (operators may change their mind, and the
 * renewalsData lib's computeRenewalStatus reads the log to surface
 * the latest signal).
 *
 * Permission gate mirrors markRenewed (canEditMOU; renewals are
 * Sales-owned per the brief).
 */

import type { AuditEntry, MOU, User } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditMOU } from '@/lib/access'
import { mouRepo } from '@/lib/db/repos/mou'
import { userRepo } from '@/lib/db/repos/user'

export interface DeclineRenewalArgs {
  mouId: string
  changedBy: string
  reason: string
}

export type DeclineRenewalFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'missing-reason'

export type DeclineRenewalResult =
  | { ok: true; mou: MOU }
  | { ok: false; reason: DeclineRenewalFailureReason }

export interface DeclineRenewalDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<DeclineRenewalDeps> {
  const [mous, users] = await Promise.all([mouRepo.findAll(), userRepo.findAll()])
  return { mous, users, enqueue: enqueueUpdate, now: () => new Date() }
}

export async function declineRenewal(
  args: DeclineRenewalArgs,
  depsOverride?: DeclineRenewalDeps,
): Promise<DeclineRenewalResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const trimmedReason = (args.reason ?? '').trim()
  if (trimmedReason === '') return { ok: false, reason: 'missing-reason' }

  const user = deps.users.find((u) => u.id === args.changedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditMOU(user)) return { ok: false, reason: 'permission' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const ts = deps.now().toISOString()

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.changedBy,
    action: 'mou-renewal-declined',
    notes: trimmedReason,
  }

  const updated: MOU = {
    ...mou,
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
