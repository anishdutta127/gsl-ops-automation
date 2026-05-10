/*
 * Re-issue a PI for an existing Payment (Gate 2 Step 6).
 *
 * Per the gsl-mou-system rule: re-issuing voids the old PI number and
 * advances the per-entity counter to obtain a fresh one. The Payment's
 * `piNumber` is overwritten with the new value; the old number is
 * captured in the Payment.auditLog 'pi-reissued' entry's before-state
 * and in the parent MOU's audit entry.
 *
 * Gated by:
 *   - canEditFinanceData (Finance + cross-functional Admin)
 *   - isPiParallelBuildLocked (advances the counter so the lock
 *     applies here just as it does on /mous/[id]/pi)
 *
 * The new docx is rendered via the same generatePi pipeline but is
 * NOT returned by this lib; the API route re-renders separately.
 */

import type { AuditEntry, MOU, Payment, User } from '@/lib/types'
import paymentsJson from '@/data/payments.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'
import { isPiParallelBuildLocked } from '@/lib/pi/parallelBuildLock'
import { issuePiNumberAtomic } from '@/lib/mouSystem/piCounterAtomic'
import { getEntityForProgramme } from '@/lib/mouSystem/company'

export interface ReissuePiArgs {
  paymentId: string
  reissuedBy: string
}

export type ReissuePiFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'mou-not-found'
  | 'parallel-build-locked'

export type ReissuePiOutcome =
  | {
      ok: true
      payment: Payment
      oldPiNumber: string | null
      newPiNumber: string
    }
  | { ok: false; reason: ReissuePiFailureReason }

export interface ReissuePiDeps {
  payments: Payment[]
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  issueCounter: typeof issuePiNumberAtomic
  now: () => Date
}

const defaultDeps: ReissuePiDeps = {
  payments: paymentsJson as unknown as Payment[],
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  issueCounter: issuePiNumberAtomic,
  now: () => new Date(),
}

export async function reissuePi(
  args: ReissuePiArgs,
  deps: ReissuePiDeps = defaultDeps,
): Promise<ReissuePiOutcome> {
  if (isPiParallelBuildLocked()) {
    return { ok: false, reason: 'parallel-build-locked' }
  }

  const user = deps.users.find((u) => u.id === args.reissuedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }

  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }
  const mou = deps.mous.find((m) => m.id === payment.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const entityKey = getEntityForProgramme(mou.programme)
  const { piNumber: newPiNumber } = await deps.issueCounter(entityKey)
  const ts = deps.now().toISOString()
  const oldPiNumber = payment.piNumber

  const paymentAudit: AuditEntry = {
    timestamp: ts,
    user: args.reissuedBy,
    action: 'pi-reissued',
    before: { piNumber: oldPiNumber },
    after: { piNumber: newPiNumber },
    notes:
      oldPiNumber !== null
        ? `Re-issued PI for ${payment.instalmentLabel}. Old number ${oldPiNumber} voided; advanced ${entityKey} counter.`
        : `Issued PI for ${payment.instalmentLabel} via re-issue surface; advanced ${entityKey} counter.`,
  }

  const updatedPayment: Payment = {
    ...payment,
    piNumber: newPiNumber,
    piGeneratedAt: ts,
    piSentDate: ts,
    auditLog: [...(payment.auditLog ?? []), paymentAudit],
  }

  const mouAudit: AuditEntry = {
    timestamp: ts,
    user: args.reissuedBy,
    action: 'pi-reissued',
    before: { piNumber: oldPiNumber },
    after: { piNumber: newPiNumber, instalmentLabel: payment.instalmentLabel },
    notes:
      oldPiNumber !== null
        ? `Re-issued PI ${oldPiNumber} -> ${newPiNumber} for ${payment.instalmentLabel}.`
        : `Issued PI ${newPiNumber} for ${payment.instalmentLabel} (re-issue surface).`,
  }
  const updatedMou: MOU = {
    ...mou,
    auditLog: [...mou.auditLog, mouAudit],
  }

  await deps.enqueue({
    queuedBy: args.reissuedBy,
    entity: 'payment',
    operation: 'update',
    payload: updatedPayment as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.reissuedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  return { ok: true, payment: updatedPayment, oldPiNumber, newPiNumber }
}
