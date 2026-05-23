/*
 * Payment mutation lib (Gate 5A.6 Step 10).
 *
 * Three actions on an existing Payment record:
 *   - editPayment: change receivedDate / receivedAmount / bankReference
 *     / notes / paymentMode on a paid Payment. When the amount changes
 *     the lib emits an Adjustment row tied to this payment so the
 *     downstream PI math remains coherent.
 *   - unmatchPayment: clear receivedAmount / receivedDate / paymentMode
 *     / bankReference; flip status back to Pending (or Partial when
 *     partialPayments[] still carries entries). Audit captures the
 *     reverted values.
 *   - deletePayment: Admin-only soft delete. Sets status='Cancelled'
 *     and appends an audit entry with the operator-supplied reason.
 *     The record stays in payments.json.
 *
 * All three queue a Payment 'update' via enqueueUpdate. Permission
 * gates: editPayment + unmatchPayment require canEditFinanceData;
 * deletePayment requires the Admin wildcard (role==='Admin' AND
 * department===null).
 */

import crypto from 'node:crypto'
import type {
  Adjustment,
  AuditEntry,
  MOU,
  Payment,
  PaymentMode,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { mouRepo } from '@/lib/db/repos/mou'

export interface PaymentMutationDeps {
  payments: Payment[]
  users: User[]
  mous: MOU[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<PaymentMutationDeps> {
  return {
  payments: await paymentRepo.findAll() as Payment[],
  users: await userRepo.findAll() as User[],
  mous: await mouRepo.findAll() as MOU[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function findUserAndPayment(
  deps: PaymentMutationDeps,
  paymentId: string,
  userId: string,
): { user: User; payment: Payment } | { error: 'unknown-user' | 'payment-not-found' } {
  const user = deps.users.find((u) => u.id === userId)
  if (!user) return { error: 'unknown-user' }
  const payment = deps.payments.find((p) => p.id === paymentId)
  if (!payment) return { error: 'payment-not-found' }
  return { user, payment }
}

// ----------------------------------------------------------------------------
// Edit

export interface EditPaymentArgs {
  paymentId: string
  receivedDate: string
  receivedAmount: number
  paymentMode: PaymentMode
  bankReference: string | null
  notes: string | null
  recordedBy: string
}

export type EditPaymentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'invalid-amount'
  | 'invalid-date'

export type EditPaymentResult =
  | { ok: true; payment: Payment; adjustmentCreated: boolean }
  | { ok: false; reason: EditPaymentFailureReason }

export async function editPayment(
  args: EditPaymentArgs,
  depsOverride?: PaymentMutationDeps,
): Promise<EditPaymentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const found = findUserAndPayment(deps, args.paymentId, args.recordedBy)
  if ('error' in found) return { ok: false, reason: found.error }
  const { user, payment } = found
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  if (!Number.isFinite(args.receivedAmount) || args.receivedAmount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  if (!ISO_DATE_RE.test(args.receivedDate)) {
    return { ok: false, reason: 'invalid-date' }
  }

  const ts = deps.now().toISOString()
  const trimmedRef = (args.bankReference ?? '').trim() || null
  const trimmedNotes = (args.notes ?? '').trim() || null
  const amountChanged = (payment.receivedAmount ?? 0) !== args.receivedAmount

  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: {
      receivedAmount: payment.receivedAmount,
      receivedDate: payment.receivedDate,
      paymentMode: payment.paymentMode,
      bankReference: payment.bankReference,
      notes: payment.notes,
    },
    after: {
      receivedAmount: args.receivedAmount,
      receivedDate: args.receivedDate,
      paymentMode: args.paymentMode,
      bankReference: trimmedRef,
      notes: trimmedNotes,
    },
    notes: amountChanged
      ? `Payment edit: amount changed Rs ${(payment.receivedAmount ?? 0).toLocaleString('en-IN')} -> Rs ${args.receivedAmount.toLocaleString('en-IN')}; adjustment created for delta.`
      : 'Payment edit: metadata only.',
  }
  const next: Payment = {
    ...payment,
    receivedAmount: args.receivedAmount,
    receivedDate: args.receivedDate,
    paymentMode: args.paymentMode,
    bankReference: trimmedRef,
    notes: trimmedNotes,
    auditLog: [...(payment.auditLog ?? []), audit],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'payment',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  let adjustmentCreated = false
  if (amountChanged) {
    const mou = deps.mous.find((m) => m.id === payment.mouId)
    if (mou) {
      const delta = args.receivedAmount - (payment.receivedAmount ?? 0)
      const adjId = `ADJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      const adjustment: Adjustment = {
        id: adjId,
        mouId: mou.id,
        schoolId: mou.schoolId,
        triggeredByEvent: 'manual',
        triggeredAt: ts,
        triggeredBy: args.recordedBy,
        originalInstallmentId: payment.id,
        appliedToInstallmentId: payment.id,
        amountDelta: delta,
        reason: `Payment ${payment.id} amount edited from Rs ${(payment.receivedAmount ?? 0).toLocaleString('en-IN')} to Rs ${args.receivedAmount.toLocaleString('en-IN')}.`,
        beforeAmount: payment.receivedAmount ?? 0,
        afterAmount: args.receivedAmount,
        status: 'Active',
      }
      await deps.enqueue({
        queuedBy: args.recordedBy,
        entity: 'adjustment',
        operation: 'create',
        payload: adjustment as unknown as Record<string, unknown>,
      })
      adjustmentCreated = true
    }
  }

  return { ok: true, payment: next, adjustmentCreated }
}

// ----------------------------------------------------------------------------
// Unmatch

export interface UnmatchPaymentArgs {
  paymentId: string
  reason: string
  recordedBy: string
}

export type UnmatchPaymentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'not-matched'
  | 'missing-reason'

export type UnmatchPaymentResult =
  | { ok: true; payment: Payment }
  | { ok: false; reason: UnmatchPaymentFailureReason }

export async function unmatchPayment(
  args: UnmatchPaymentArgs,
  depsOverride?: PaymentMutationDeps,
): Promise<UnmatchPaymentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const found = findUserAndPayment(deps, args.paymentId, args.recordedBy)
  if ('error' in found) return { ok: false, reason: found.error }
  const { user, payment } = found
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 5) return { ok: false, reason: 'missing-reason' }
  if (
    payment.receivedAmount === null &&
    payment.receivedDate === null &&
    payment.paymentMode === null &&
    payment.bankReference === null
  ) {
    return { ok: false, reason: 'not-matched' }
  }

  const ts = deps.now().toISOString()
  const hasPartials = Array.isArray(payment.partialPayments) && payment.partialPayments.length > 0

  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: {
      receivedAmount: payment.receivedAmount,
      receivedDate: payment.receivedDate,
      paymentMode: payment.paymentMode,
      bankReference: payment.bankReference,
      status: payment.status,
    },
    after: {
      receivedAmount: null,
      receivedDate: null,
      paymentMode: null,
      bankReference: null,
      status: hasPartials ? 'Partial' : 'Pending',
    },
    notes: `Payment unmatched. Reason: ${reason}`,
  }
  const next: Payment = {
    ...payment,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    status: hasPartials ? 'Partial' : 'Pending',
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
// Delete (soft)

export interface DeletePaymentArgs {
  paymentId: string
  reason: string
  recordedBy: string
}

export type DeletePaymentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'missing-reason'

export type DeletePaymentResult =
  | { ok: true; payment: Payment }
  | { ok: false; reason: DeletePaymentFailureReason }

export async function deletePayment(
  args: DeletePaymentArgs,
  depsOverride?: PaymentMutationDeps,
): Promise<DeletePaymentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const found = findUserAndPayment(deps, args.paymentId, args.recordedBy)
  if ('error' in found) return { ok: false, reason: found.error }
  const { user, payment } = found
  // Admin wildcard only.
  if (!(user.role === 'Admin' && (user.department ?? null) === null)) {
    return { ok: false, reason: 'permission' }
  }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { status: payment.status },
    after: { status: 'Cancelled' },
    notes: `Payment soft-deleted by Admin. Reason: ${reason}`,
  }
  const next: Payment = {
    ...payment,
    status: 'Cancelled',
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
