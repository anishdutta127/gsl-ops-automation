/*
 * POST /api/operations/vex/pi/[id]/payment
 *
 * Record a payment receipt against a VEX PI. Finance / Admin only.
 * Phase 1 is a thin queue write that the drain runner reconciles
 * against the snapshot's payment-receipt logic. Excess-payment
 * detection (which gsl-mou-system raised as a "create an Adjustment
 * advance" warning) is deferred to Phase 1.1; the queue payload
 * carries the raw amounts and the drain runs the existing migrated
 * logic on apply.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { formatRs } from '@/lib/format'
import type {
  AuditEntry,
  PaymentMode,
  VexPiStatus,
} from '@/lib/mouSystem/types'

const MODES: PaymentMode[] = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

interface IncomingPayload {
  date?: unknown
  bankAmount?: unknown
  tdsAmount?: unknown
  mode?: unknown
  reference?: unknown
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can log VEX payments.' },
      { status: 403 },
    )
  }
  const pi = await vexPiRepo.findById(id)
  if (!pi) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  let body: IncomingPayload
  try {
    body = (await request.json()) as IncomingPayload
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const date = typeof body.date === 'string' ? body.date : ''
  const bankAmount = Number(body.bankAmount) || 0
  const tdsAmount = Number(body.tdsAmount) || 0
  const mode = MODES.includes(body.mode as PaymentMode)
    ? (body.mode as PaymentMode)
    : null
  const reference = typeof body.reference === 'string' ? body.reference.trim() : null
  if (!date) {
    return NextResponse.json(
      { error: 'missing-date', message: 'Payment date required.' },
      { status: 400 },
    )
  }
  const total = bankAmount + tdsAmount
  if (total <= 0) {
    return NextResponse.json(
      {
        error: 'invalid-amount',
        message: 'Bank or TDS amount must be positive.',
      },
      { status: 400 },
    )
  }
  if (!mode) {
    return NextResponse.json(
      { error: 'invalid-mode', message: 'Pick a payment mode.' },
      { status: 400 },
    )
  }

  // The Gate 5A.5 fix mutates the parent VexPi (paymentReceivedAmount
  // + paymentLogIds + auditLog + derived status) and enqueues the
  // full record. The paymentLog row carries an id so the drain can
  // apply it to payment_logs.json by id. The pre-fix shape enqueued
  // a paymentLog payload with no id; the drain silently skipped it
  // and the parent VexPi balance never updated.
  const logId = `VEXPL-${crypto.randomUUID().slice(0, 8)}`
  const loggedAt = new Date().toISOString()
  const newPaymentReceived = pi.paymentReceivedAmount + total
  const newStatus: VexPiStatus = (() => {
    if (newPaymentReceived >= pi.total) {
      return pi.status === 'Completed' ? pi.status : 'Delivery Pending'
    }
    return pi.status === 'Generated' ? 'Payment Pending' : pi.status
  })()
  const piAudit: AuditEntry = {
    timestamp: loggedAt,
    user: user.name,
    action: 'update',
    before: {
      paymentReceivedAmount: pi.paymentReceivedAmount,
      status: pi.status,
    },
    after: {
      paymentReceivedAmount: newPaymentReceived,
      status: newStatus,
    },
    notes: `Payment received Rs ${total} (bank ${bankAmount} + TDS ${tdsAmount}) via ${mode}.`,
  }
  // Shape MUST match PaymentLog / the payment_logs table (paymentLogRepo.create
  // binds `amount` raw; the VEX-only fields scope/vexPiId/bankAmount/tdsAmount
  // have no columns). The VexPi<->log link is VexPi.paymentLogIds -> this id;
  // the bank/TDS split + PI ref live in `narration` (no dedicated columns).
  // `amount` is the total receipt; `unmatched: false` because a VEX receipt is
  // tied to its PI, not awaiting instalment reconciliation.
  const paymentLogRecord = {
    id: logId,
    date,
    amount: total,
    mode,
    reference,
    narration: `VEX PI ${pi.id}: bank ${formatRs(bankAmount)} + TDS ${formatRs(tdsAmount)} via ${mode}.`,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: false,
    loggedBy: user.name,
    loggedAt,
    notes: null,
    auditLog: [
      {
        timestamp: loggedAt,
        user: user.name,
        action: 'create' as const,
        notes: `VEX PI ${pi.id} payment receipt ${formatRs(total)} (bank ${formatRs(bankAmount)} + TDS ${formatRs(tdsAmount)}) via ${mode}.`,
      },
    ],
  }

  try {
    // ATOMIC: the parent VexPi mutation (payment_log_ids append +
    // payment_received_amount increment + status recompute + audit
    // append) is one server-side UPDATE statement via
    // vexPiRepo.recordVexPayment. Concurrent payment recordings no
    // longer race (Anish 2026-05-24 anti-race fix).
    await vexPiRepo.recordVexPayment(pi.id, {
      logId,
      amount: total,
      audit: piAudit,
      queuedBy: user.id,
    })
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'paymentLog',
      operation: 'create',
      payload: paymentLogRecord as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to queue the payment. Retry.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
