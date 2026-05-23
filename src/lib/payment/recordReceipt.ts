/*
 * Payment receipt recording (W4-B.5).
 *
 * Operator records a received payment against an existing Payment
 * row at /mous/[id]/payment-receipt. Captures receivedDate +
 * receivedAmount + paymentMode + bankReference + notes; flips
 * Payment.status to 'Paid' on success.
 *
 * Variance handling: when receivedAmount differs from
 * Payment.expectedAmount, the lib still accepts the write but
 * surfaces a `variance` flag in the result so the UI can render a
 * prominent "Partial payment" banner. The audit entry's notes
 * field captures the variance Rs amount + sign so the trail is
 * legible without requiring a join against the Payment row.
 *
 * Idempotency: re-recording on an already-paid Payment is allowed
 * (edit-mode correction). Operators may need to fix wrong reference
 * numbers; refusing the edit would force them to manually unpick
 * the Payment record. The audit log gains a fresh
 * 'payment-recorded' entry per save with before / after diff.
 *
 * Permission gate: 'payment:reconcile' (Finance + Admin via
 * wildcard). OpsHead is intentionally not granted because payment
 * reconciliation is a Finance-team responsibility.
 */

import type {
  AuditEntry,
  MOU,
  Payment,
  PaymentMode,
  SalesPerson,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'
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

export interface RecordReceiptArgs {
  paymentId: string
  receivedDate: string              // ISO yyyy-mm-dd
  receivedAmount: number
  paymentMode: PaymentMode
  bankReference: string | null
  notes: string | null
  recordedBy: string
  /**
   * Phase 4 (2026-05-19): bank + TDS split. When both are provided,
   * the lib stores them on the Payment row and validates that
   * `bankAmount + tdsAmount` equals `receivedAmount` (within a 1
   * rupee tolerance for paise-level rounding). When omitted, the
   * row's split fields stay undefined; existing call sites that pass
   * only `receivedAmount` keep working without change.
   */
  bankAmount?: number | null
  tdsAmount?: number | null
}

export type RecordReceiptFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-mode'
  | 'invalid-tds-split'

export interface RecordReceiptResult {
  ok: true
  payment: Payment
  /** Variance Rs (received - expected). 0 means exact match. */
  varianceRs: number
  /** True when |varianceRs| > 0 -> the UI shows the partial banner. */
  hasVariance: boolean
}

export type RecordReceiptOutcome =
  | RecordReceiptResult
  | { ok: false; reason: RecordReceiptFailureReason }

export interface RecordReceiptDeps {
  payments: Payment[]
  users: User[]
  mous: MOU[]
  salesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<RecordReceiptDeps> {
  return {
  payments: await paymentRepo.findAll() as Payment[],
  users: await userRepo.findAll() as User[],
  mous: await mouRepo.findAll() as MOU[],
  salesTeam: await salesTeamRepo.findAll() as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
  }
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function recordReceipt(
  args: RecordReceiptArgs,
  depsOverride?: RecordReceiptDeps,
): Promise<RecordReceiptOutcome> {
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

  // Phase 4 split validation: if either bank or TDS is supplied, both
  // must add up to receivedAmount within 1 Rs tolerance. Negative
  // numbers are rejected (TDS is never negative; a refund would be a
  // separate Adjustment record).
  const bankAmount = args.bankAmount ?? null
  const tdsAmount = args.tdsAmount ?? null
  if (bankAmount !== null || tdsAmount !== null) {
    const bank = bankAmount ?? 0
    const tds = tdsAmount ?? 0
    if (!Number.isFinite(bank) || bank < 0) return { ok: false, reason: 'invalid-tds-split' }
    if (!Number.isFinite(tds) || tds < 0) return { ok: false, reason: 'invalid-tds-split' }
    if (Math.abs(bank + tds - args.receivedAmount) > 1) {
      return { ok: false, reason: 'invalid-tds-split' }
    }
  }

  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }

  const ts = deps.now().toISOString()
  const varianceRs = args.receivedAmount - payment.expectedAmount
  const hasVariance = varianceRs !== 0
  const trimmedRef = (args.bankReference ?? '').trim() || null
  const trimmedNotes = (args.notes ?? '').trim() || null

  const auditNotes = hasVariance
    ? `Variance Rs ${varianceRs.toLocaleString('en-IN')} vs expected Rs ${payment.expectedAmount.toLocaleString('en-IN')}.`
    : 'Exact match.'

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'payment-recorded',
    before: {
      receivedAmount: payment.receivedAmount,
      receivedDate: payment.receivedDate,
      paymentMode: payment.paymentMode,
      bankReference: payment.bankReference,
      status: payment.status,
      bankAmount: payment.bankAmount ?? null,
      tdsAmount: payment.tdsAmount ?? null,
    },
    after: {
      receivedAmount: args.receivedAmount,
      receivedDate: args.receivedDate,
      paymentMode: args.paymentMode,
      bankReference: trimmedRef,
      status: 'Paid' as const,
      bankAmount: args.bankAmount ?? null,
      tdsAmount: args.tdsAmount ?? null,
    },
    notes: auditNotes,
  }

  const updated: Payment = {
    ...payment,
    receivedAmount: args.receivedAmount,
    receivedDate: args.receivedDate,
    paymentMode: args.paymentMode,
    bankReference: trimmedRef,
    status: 'Paid',
    notes: trimmedNotes ?? payment.notes,
    // Phase 4: persist the split when supplied; preserve undefined
    // for callers that did not pass it (backwards compat).
    ...(args.bankAmount !== undefined ? { bankAmount: args.bankAmount } : {}),
    ...(args.tdsAmount !== undefined ? { tdsAmount: args.tdsAmount } : {}),
    auditLog: [...(payment.auditLog ?? []), auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'payment',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  // W4-E.5 fan-out: Finance + sales-owner of the parent MOU. Sales-
  // owner mapping = SalesPerson → User by email match (sp-vishwanath
  // -> vishwanath.g via shared email). Skip the per-MOU step when no
  // mapping is found.
  const mou = deps.mous.find((m) => m.id === payment.mouId)
  const recipients = new Set<string>(recipientsByRole(deps.users, ['Finance']))
  if (mou?.salesPersonId) {
    const sp = deps.salesTeam.find((s) => s.id === mou.salesPersonId)
    if (sp) {
      const ownerUser = deps.users.find((u) => u.email === sp.email)
      if (ownerUser) recipients.add(ownerUser.id)
    }
  }
  await broadcastNotification({
    recipientUserIds: Array.from(recipients),
    senderUserId: args.recordedBy,
    kind: 'payment-recorded',
    title: `Payment recorded for ${payment.schoolName}`,
    body: `${user.name} recorded Rs ${args.receivedAmount.toLocaleString('en-IN')} against ${payment.id}${hasVariance ? ' (variance)' : ''}.`,
    actionUrl: `/mous/${payment.mouId}`,
    payload: {
      paymentId: payment.id,
      mouId: payment.mouId,
      schoolName: payment.schoolName,
      installmentSeq: payment.instalmentSeq,
      recorderName: user.name,
      receivedAmount: args.receivedAmount,
      hasVariance,
    },
    relatedEntityId: payment.id,
  }).catch((err) => {
    console.error('[recordReceipt] notification fan-out failed', err)
  })

  return { ok: true, payment: updated, varianceRs, hasVariance }
}
