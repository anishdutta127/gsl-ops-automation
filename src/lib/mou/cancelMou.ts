/*
 * MOU cancel / soft-delete (Phase 3).
 *
 * Admin-wildcard only (same gate as payment soft-delete). Sets MOU
 * status='Cancelled' (migration 018) and CASCADES: every linked payment that is
 * not already Cancelled is soft-deleted (status='Cancelled') so received /
 * outstanding (computed from non-Cancelled payments, never the stale
 * mou.received) fall to zero and no orphan or stale total remains. The MOU stays
 * in the table (soft-delete); finance views exclude Cancelled MOUs + payments.
 *
 * Order: payments first, MOU last - so a partial failure (fail-loud re-throw
 * from enqueueUpdate) is retry-safe (a re-run re-cancels the remaining payments,
 * then the still-Active MOU; an already-Cancelled MOU short-circuits).
 *
 * The cancel EVENT lives on the MOU ('mou-cancelled', per the audit convention);
 * each payment carries a generic 'update' with a forward pointer to the MOU.
 */

import type { AuditEntry, MOU, Payment, User } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { mouRepo } from '@/lib/db/repos/mou'

export interface CancelMouDeps {
  mous: MOU[]
  payments: Payment[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<CancelMouDeps> {
  return {
    mous: (await mouRepo.findAll()) as MOU[],
    payments: (await paymentRepo.findAll()) as Payment[],
    users: (await userRepo.findAll()) as User[],
    enqueue: enqueueUpdate,
    now: () => new Date(),
  }
}

export interface CancelMouArgs {
  mouId: string
  reason: string
  recordedBy: string
}

export type CancelMouFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'already-cancelled'
  | 'missing-reason'

export type CancelMouResult =
  | { ok: true; mou: MOU; cancelledPaymentIds: string[] }
  | { ok: false; reason: CancelMouFailureReason }

export async function cancelMou(
  args: CancelMouArgs,
  depsOverride?: CancelMouDeps,
): Promise<CancelMouResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  // Admin wildcard only (role==='Admin' AND department===null), matching the
  // payment soft-delete gate.
  if (!(user.role === 'Admin' && (user.department ?? null) === null)) {
    return { ok: false, reason: 'permission' }
  }
  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  if (mou.status === 'Cancelled') return { ok: false, reason: 'already-cancelled' }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const linked = deps.payments.filter((p) => p.mouId === mou.id && p.status !== 'Cancelled')

  // 1) Cascade: soft-delete each linked payment FIRST (retry-safe ordering).
  const cancelledPaymentIds: string[] = []
  for (const p of linked) {
    const pAudit: AuditEntry = {
      timestamp: ts,
      user: args.recordedBy,
      action: 'update',
      before: { status: p.status },
      after: { status: 'Cancelled' },
      notes: `Soft-deleted by MOU cancel ${mou.id}. Reason: ${reason}`,
    }
    // Minimal patch: only the changed scalar + the full auditLog (the dispatch
    // diffs auditLog by length to append the new entry). Avoids re-binding every
    // field through updatePartial.
    await deps.enqueue({
      queuedBy: args.recordedBy,
      entity: 'payment',
      operation: 'update',
      payload: {
        id: p.id,
        status: 'Cancelled',
        auditLog: [...(p.auditLog ?? []), pAudit],
      } as unknown as Record<string, unknown>,
    })
    cancelledPaymentIds.push(p.id)
  }

  // 2) Cancel the MOU LAST (the cancel event lives here).
  const mouAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'mou-cancelled',
    before: { status: mou.status },
    after: { status: 'Cancelled' },
    notes: `MOU soft-cancelled by Admin. Reason: ${reason}. Cascade soft-deleted ${cancelledPaymentIds.length} payment(s).`,
  }
  // Also archive: every existing active-MOU view filters cohortStatus==='active'
  // (the /mous list, kanban, dashboards, dispatch/escalation/adjustment pickers),
  // so setting cohortStatus='archived' removes the cancelled MOU from all of them
  // without touching 15+ call sites. status='Cancelled' is the semantic marker
  // (distinct from a plain archive) that also drives the received-sum exclusion.
  const nextMou: MOU = {
    ...mou,
    status: 'Cancelled',
    cohortStatus: 'archived',
    auditLog: [...(mou.auditLog ?? []), mouAudit],
  }
  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: {
      id: mou.id,
      status: 'Cancelled',
      cohortStatus: 'archived',
      auditLog: nextMou.auditLog,
    } as unknown as Record<string, unknown>,
  })

  return { ok: true, mou: nextMou, cancelledPaymentIds }
}
