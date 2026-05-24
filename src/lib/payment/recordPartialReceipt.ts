/*
 * Partial payment recording (Gate 5A.6 Step 4).
 *
 * Mirrors `recordReceipt` but never flips the Payment status to 'Paid'.
 * Each call appends a fresh PartialPaymentEntry to
 * Payment.partialPayments[], sums all partial amounts into the
 * Payment's receivedAmount, and sets status='Partial' (or leaves
 * status='Paid' when cumulative partials exactly reach
 * expectedAmount; in that boundary case the audit notes record the
 * partial-to-paid flip).
 *
 * Permission gate: same as recordReceipt ('payment:reconcile' -> Finance
 * + Admin via wildcard).
 */

import type {
  AuditEntry,
  MOU,
  PartialPaymentEntry,
  Payment,
  PaymentMode,
  SalesPerson,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { mouRepo } from '@/lib/db/repos/mou'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'

const VALID_MODES: ReadonlyArray<PaymentMode> = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

export interface RecordPartialReceiptArgs {
  paymentId: string
  receivedDate: string
  receivedAmount: number
  paymentMode: PaymentMode
  bankReference: string | null
  notes: string | null
  recordedBy: string
}

export type RecordPartialReceiptFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-mode'

export type RecordPartialReceiptOutcome =
  | { ok: true; payment: Payment; cumulativeReceived: number }
  | { ok: false; reason: RecordPartialReceiptFailureReason }

export interface RecordPartialReceiptDeps {
  payments: Payment[]
  users: User[]
  mous: MOU[]
  salesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<RecordPartialReceiptDeps> {
  return {
    payments: await paymentRepo.findAll(),
    users: await userRepo.findAll(),
    mous: await mouRepo.findAll(),
    salesTeam: await salesTeamRepo.findAll(),
    enqueue: enqueueUpdate,
    now: () => new Date(),
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function recordPartialReceipt(
  args: RecordPartialReceiptArgs,
  depsOverride?: RecordPartialReceiptDeps,
): Promise<RecordPartialReceiptOutcome> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'payment:reconcile')) {
    return { ok: false, reason: 'permission' }
  }

  if (!Number.isFinite(args.receivedAmount) || args.receivedAmount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  if (!ISO_DATE_RE.test(args.receivedDate)) {
    return { ok: false, reason: 'invalid-date' }
  }
  if (!VALID_MODES.includes(args.paymentMode)) {
    return { ok: false, reason: 'invalid-mode' }
  }

  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }

  const ts = deps.now().toISOString()
  const trimmedRef = (args.bankReference ?? '').trim() || null
  const trimmedNotes = (args.notes ?? '').trim() || null

  const newPartial: PartialPaymentEntry = {
    date: args.receivedDate,
    amount: args.receivedAmount,
    mode: args.paymentMode,
    reference: trimmedRef,
    notes: trimmedNotes,
    paymentLogId: null,
  }

  const prevPartials = payment.partialPayments ?? []
  // Cumulative reported in the audit + return value is INDICATIVE
  // (computed from the read snapshot); the actual post-write cumulative
  // comes out of the atomic SQL increment. Two parallel partial records
  // may each report the same indicative-cumulative; that's fine - the
  // server-side received_amount is the source of truth.
  const indicativeCumulative = prevPartials.reduce((s, p) => s + (p.amount ?? 0), 0)
    + args.receivedAmount
  const indicativeStatus =
    indicativeCumulative + 0.01 >= payment.expectedAmount ? 'Paid' : 'Partial'

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'payment-recorded',
    before: {
      receivedAmount: payment.receivedAmount,
      partialCount: prevPartials.length,
      status: payment.status,
    },
    after: {
      receivedAmount: indicativeCumulative,
      partialCount: prevPartials.length + 1,
      status: indicativeStatus,
    },
    notes: `Partial payment Rs ${args.receivedAmount.toLocaleString('en-IN')} recorded. Cumulative ${indicativeCumulative.toLocaleString('en-IN')} of expected ${payment.expectedAmount.toLocaleString('en-IN')}.`,
  }

  // ATOMIC RECORD: the entire mutation (partial append + received_amount
  // increment + status recompute + audit append) is one server-side
  // UPDATE statement. Concurrent recordPartialReceipt callers no longer
  // race - see verify-rmw-races.mjs after-fix run (10/10 survived).
  await paymentRepo.recordPartialReceipt(args.paymentId, {
    partial: newPartial,
    receivedDate: args.receivedDate,
    paymentMode: args.paymentMode,
    bankReference: trimmedRef ?? payment.bankReference,
    notes: trimmedNotes ?? payment.notes,
    audit: auditEntry,
    queuedBy: args.recordedBy,
  })
  // Indicative shape returned to the caller. The true post-state lives
  // in postgres; callers that need it should re-read via paymentRepo.findById.
  const updated: Payment = {
    ...payment,
    receivedAmount: indicativeCumulative,
    receivedDate: args.receivedDate,
    paymentMode: args.paymentMode,
    bankReference: trimmedRef ?? payment.bankReference,
    status: indicativeStatus,
    partialPayments: [...prevPartials, newPartial],
    notes: trimmedNotes ?? payment.notes,
    auditLog: [...(payment.auditLog ?? []), auditEntry],
  }
  return { ok: true, payment: updated, cumulativeReceived: indicativeCumulative }
}
