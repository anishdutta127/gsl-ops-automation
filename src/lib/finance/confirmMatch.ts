/*
 * Confirm a bank-entry -> PI match (Gate 2 Step 6).
 *
 * Inputs: paymentId (the receivable instalment), the bank-entry details
 * (amount, date, mode, reference, narration), the user. Writes three
 * pending updates atomically through the queue:
 *
 *   1. Payment update : receivedAmount, receivedDate, paymentMode,
 *      bankReference, status (Paid or Partial), audit entry on the
 *      Payment row.
 *   2. PaymentLog create : new row with matchedInstallmentIds: [paymentId],
 *      unmatched: false, loggedBy: user.id.
 *   3. MOU update : audit entry 'payment-matched' on the parent MOU so
 *      the matched payment is visible from the MOU detail page without
 *      joining payment_logs.
 *
 * Permission gate: canEditFinanceData (Finance + cross-functional Admin).
 *
 * Variance handling : if the bank entry differs from the expected
 * amount, status flips to 'Partial' instead of 'Paid' and the audit
 * note records the variance.
 *
 * Notification fan-out : Finance role recipients + the parent MOU's
 * sales owner (mapped via SalesPerson email -> User email) get a
 * notification so Sales sees the match without polling.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  MOU,
  Payment,
  PaymentLog,
  PaymentMode,
  SalesPerson,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'
import { paymentRepo } from '@/lib/db/repos/payment'
import { mouRepo } from '@/lib/db/repos/mou'
import { userRepo } from '@/lib/db/repos/user'
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface ConfirmMatchArgs {
  paymentId: string
  receivedDate: string
  receivedAmount: number
  paymentMode: PaymentMode
  bankReference: string | null
  narration: string | null
  recordedBy: string
}

export type ConfirmMatchFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'payment-not-found'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-mode'

export interface ConfirmMatchSuccess {
  ok: true
  payment: Payment
  paymentLog: PaymentLog
  varianceRs: number
  hasVariance: boolean
}

export type ConfirmMatchOutcome =
  | ConfirmMatchSuccess
  | { ok: false; reason: ConfirmMatchFailureReason }

export interface ConfirmMatchDeps {
  payments: Payment[]
  mous: MOU[]
  users: User[]
  salesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<ConfirmMatchDeps> {
  return {
  payments: await paymentRepo.findAll() as Payment[],
  mous: await mouRepo.findAll() as MOU[],
  users: await userRepo.findAll() as User[],
  salesTeam: await salesTeamRepo.findAll() as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}
}

export async function confirmMatch(
  args: ConfirmMatchArgs,
  depsOverride?: ConfirmMatchDeps,
): Promise<ConfirmMatchOutcome> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }

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
  const trimmedNar = (args.narration ?? '').trim() || null
  const nextStatus: Payment['status'] = hasVariance ? 'Partial' : 'Paid'

  const paymentAuditNotes = hasVariance
    ? `Matched against bank entry. Variance Rs ${varianceRs.toLocaleString('en-IN')} vs expected Rs ${payment.expectedAmount.toLocaleString('en-IN')}.`
    : 'Matched against bank entry. Exact match.'

  const paymentAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'payment-matched',
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
      status: nextStatus,
    },
    notes: paymentAuditNotes,
  }

  const updatedPayment: Payment = {
    ...payment,
    receivedAmount: args.receivedAmount,
    receivedDate: args.receivedDate,
    paymentMode: args.paymentMode,
    bankReference: trimmedRef,
    status: nextStatus,
    auditLog: [...(payment.auditLog ?? []), paymentAudit],
  }

  const paymentLog: PaymentLog = {
    id: `PL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    date: args.receivedDate,
    amount: args.receivedAmount,
    mode: args.paymentMode,
    reference: trimmedRef,
    narration: trimmedNar,
    salesPersonId: null,
    matchedInstallmentIds: [payment.id],
    unmatched: false,
    loggedBy: args.recordedBy,
    loggedAt: ts,
    notes: null,
  }

  const mou = deps.mous.find((m) => m.id === payment.mouId)
  if (mou) {
    const mouAudit: AuditEntry = {
      timestamp: ts,
      user: args.recordedBy,
      action: 'payment-matched',
      after: {
        paymentId: payment.id,
        piNumber: payment.piNumber,
        instalmentLabel: payment.instalmentLabel,
        receivedAmount: args.receivedAmount,
        status: nextStatus,
      },
      notes: `Matched ${payment.instalmentLabel} for Rs ${args.receivedAmount.toLocaleString('en-IN')}${hasVariance ? ' (variance)' : ''}.`,
    }
    const updatedMou: MOU = {
      ...mou,
      auditLog: [...mou.auditLog, mouAudit],
    }
    await deps.enqueue({
      queuedBy: args.recordedBy,
      entity: 'mou',
      operation: 'update',
      payload: updatedMou as unknown as Record<string, unknown>,
    })
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'payment',
    operation: 'update',
    payload: updatedPayment as unknown as Record<string, unknown>,
  })

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'paymentLog',
    operation: 'create',
    payload: paymentLog as unknown as Record<string, unknown>,
  })

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
    title: `Payment matched for ${payment.schoolName}`,
    body: `${user.name} matched Rs ${args.receivedAmount.toLocaleString('en-IN')} against ${payment.instalmentLabel} (${payment.id})${hasVariance ? ' (variance)' : ''}.`,
    actionUrl: `/mous/${payment.mouId}`,
    payload: {
      paymentId: payment.id,
      mouId: payment.mouId,
      schoolName: payment.schoolName,
      receivedAmount: args.receivedAmount,
      hasVariance,
    },
    relatedEntityId: payment.id,
  }).catch((err) => {
    console.error('[confirmMatch] notification fan-out failed', err)
  })

  return { ok: true, payment: updatedPayment, paymentLog, varianceRs, hasVariance }
}
