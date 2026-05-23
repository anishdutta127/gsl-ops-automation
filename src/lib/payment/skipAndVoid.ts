/*
 * Skip-installment + void-PI lib (Gate 5A.6 Step 13).
 *
 * skipInstallment:
 *   - canEditFinanceData gate
 *   - flips Payment.status to 'Skipped'
 *   - audit captures the operator-supplied reason
 *   - PI generation is blocked downstream by the status check
 *   - balance excluded from outstanding totals via UI-side filter
 *
 * voidPi:
 *   - Admin wildcard only (role==='Admin' + department null) per the
 *     "high stakes" gate
 *   - sets piVoidedAt + piVoidReason on the Payment record
 *   - piNumber is PRESERVED (Gate 2 §3 counter-integrity: voided
 *     numbers stay in the audit log so the next PI claims the next
 *     sequential number)
 *   - emits an Adjustment row for the voided amount tied back to this
 *     installment so the next-unpaid PI surfaces a credit
 */

import crypto from 'node:crypto'
import type {
  Adjustment,
  AuditEntry,
  MOU,
  Payment,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { mouRepo } from '@/lib/db/repos/mou'

export interface SkipVoidDeps {
  payments: Payment[]
  users: User[]
  mous: MOU[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<SkipVoidDeps> {
  const [payments, users, mous] = await Promise.all([
    paymentRepo.findAll(),
    userRepo.findAll(),
    mouRepo.findAll(),
  ])
  return { payments, users, mous, enqueue: enqueueUpdate, now: () => new Date() }
}

// ----------------------------------------------------------------------------
// Skip instalment

export interface SkipInstallmentArgs {
  paymentId: string
  reason: string
  recordedBy: string
}

export type SkipInstallmentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'pi-issued'
  | 'already-paid'
  | 'missing-reason'

export type SkipInstallmentResult =
  | { ok: true; payment: Payment }
  | { ok: false; reason: SkipInstallmentFailureReason }

export async function skipInstallment(
  args: SkipInstallmentArgs,
  depsOverride?: SkipVoidDeps,
): Promise<SkipInstallmentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }
  if (payment.piNumber !== null && (payment.piVoidedAt ?? null) === null) {
    return { ok: false, reason: 'pi-issued' }
  }
  if (payment.status === 'Paid' || payment.status === 'Received') {
    return { ok: false, reason: 'already-paid' }
  }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'status_change',
    before: { status: payment.status },
    after: { status: 'Skipped' },
    notes: `Instalment skipped. Reason: ${reason}`,
  }
  const next: Payment = {
    ...payment,
    status: 'Skipped',
    auditLog: [...(payment.auditLog ?? []), audit],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'payment',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  return { ok: true, payment: next }
}

// ----------------------------------------------------------------------------
// Void PI

export interface VoidPiArgs {
  paymentId: string
  reason: string
  recordedBy: string
}

export type VoidPiFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'no-pi'
  | 'already-voided'
  | 'missing-reason'

export type VoidPiResult =
  | { ok: true; payment: Payment; adjustmentCreated: boolean }
  | { ok: false; reason: VoidPiFailureReason }

export async function voidPi(
  args: VoidPiArgs,
  depsOverride?: SkipVoidDeps,
): Promise<VoidPiResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!(user.role === 'Admin' && (user.department ?? null) === null)) {
    return { ok: false, reason: 'permission' }
  }
  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }
  if (payment.piNumber === null) return { ok: false, reason: 'no-pi' }
  if ((payment.piVoidedAt ?? null) !== null) {
    return { ok: false, reason: 'already-voided' }
  }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'status_change',
    before: {
      piVoidedAt: payment.piVoidedAt ?? null,
      piNumber: payment.piNumber,
    },
    after: {
      piVoidedAt: ts,
      piNumber: payment.piNumber,
    },
    notes: `PI ${payment.piNumber} voided. Reason: ${reason}. Counter is NOT rolled back; the number stays in the audit ledger.`,
  }
  const next: Payment = {
    ...payment,
    piVoidedAt: ts,
    piVoidReason: reason,
    auditLog: [...(payment.auditLog ?? []), audit],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'payment',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  // Emit an Adjustment for the voided PI amount so the next-unpaid PI
  // surfaces the credit. amountDelta is negative of the expectedAmount.
  let adjustmentCreated = false
  const mou = deps.mous.find((m) => m.id === payment.mouId)
  if (mou) {
    const adjId = `ADJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    const adj: Adjustment = {
      id: adjId,
      mouId: mou.id,
      schoolId: mou.schoolId,
      triggeredByEvent: 'manual',
      triggeredAt: ts,
      triggeredBy: args.recordedBy,
      originalInstallmentId: payment.id,
      appliedToInstallmentId: null,
      amountDelta: -payment.expectedAmount,
      reason: `PI ${payment.piNumber} voided: ${reason}`,
      beforeAmount: payment.expectedAmount,
      afterAmount: 0,
      status: 'Active',
    }
    await deps.enqueue({
      queuedBy: args.recordedBy,
      entity: 'adjustment',
      operation: 'create',
      payload: adj as unknown as Record<string, unknown>,
    })
    adjustmentCreated = true
  }

  return { ok: true, payment: next, adjustmentCreated }
}
