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
import paymentsJson from '@/data/payments.json'
import usersJson from '@/data/users.json'
import mousJson from '@/data/mous.json'
import salesTeamJson from '@/data/sales_team.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'

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
}

export type RecordReceiptFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-mode'

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

const defaultDeps: RecordReceiptDeps = {
  payments: paymentsJson as unknown as Payment[],
  users: usersJson as unknown as User[],
  mous: mousJson as unknown as MOU[],
  salesTeam: salesTeamJson as unknown as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function recordReceipt(
  args: RecordReceiptArgs,
  deps: RecordReceiptDeps = defaultDeps,
): Promise<RecordReceiptOutcome> {
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
    },
    after: {
      receivedAmount: args.receivedAmount,
      receivedDate: args.receivedDate,
      paymentMode: args.paymentMode,
      bankReference: trimmedRef,
      status: 'Paid' as const,
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
