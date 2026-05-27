/*
 * POST /api/finance/payments/match-to-instalment
 *
 * Matches an unmatched PaymentLog to a specific instalment.
 * Calls recordPartialReceipt on the target payment row, then
 * updates the PaymentLog with the match reference.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { userRepo } from '@/lib/db/repos/user'
import { paymentRepo } from '@/lib/db/repos/payment'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import type { AuditEntry, PaymentLog } from '@/lib/types'

export async function POST(request: Request) {
  const form = await request.formData()
  const paymentLogId = String(form.get('paymentLogId') ?? '')
  const instalmentId = String(form.get('instalmentId') ?? '')
  const amountRaw = Number(form.get('amount') ?? 0)

  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }

  const allUsers = await userRepo.findAll()
  const user = allUsers.find((u) => u.id === session.sub)
  if (!user || !canEditFinanceData(user)) {
    return NextResponse.redirect(new URL('/finance/payments?error=permission', request.url), { status: 303 })
  }

  if (!paymentLogId || !instalmentId || !Number.isFinite(amountRaw) || amountRaw <= 0) {
    return NextResponse.redirect(new URL('/finance/payments/unmatched?error=invalid-input', request.url), { status: 303 })
  }

  const amount = Math.round(amountRaw)

  const [payment, allLogs] = await Promise.all([
    paymentRepo.findById(instalmentId),
    paymentLogRepo.findAll() as Promise<PaymentLog[]>,
  ])
  const log = allLogs.find((l) => l.id === paymentLogId)

  if (!payment) {
    return NextResponse.redirect(new URL('/finance/payments/unmatched?error=instalment-not-found', request.url), { status: 303 })
  }
  if (!log) {
    return NextResponse.redirect(new URL('/finance/payments/unmatched?error=log-not-found', request.url), { status: 303 })
  }

  const ts = new Date().toISOString()

  const partialEntry = {
    id: `${paymentLogId}-match-${Date.now()}`,
    amount,
    date: log.date,
    mode: log.mode,
    reference: log.reference,
    notes: `Matched from bank receipt ${paymentLogId}`,
    paymentLogId,
  }

  const auditOnPayment: AuditEntry = {
    timestamp: ts,
    user: session.sub,
    action: 'payment-matched',
    after: {
      paymentLogId,
      amount,
      reference: log.reference,
    },
    notes: `Matched Rs ${amount.toLocaleString('en-IN')} from bank receipt ${paymentLogId} (ref: ${log.reference ?? 'none'}).`,
  }

  await paymentRepo.recordPartialReceipt(instalmentId, {
    partial: partialEntry,
    receivedDate: log.date,
    paymentMode: log.mode ?? null,
    bankReference: log.reference,
    notes: `Matched from ${paymentLogId}`,
    audit: auditOnPayment,
    queuedBy: session.sub,
  })

  const updatedMatchIds = [...(log.matchedInstallmentIds ?? []), instalmentId]
  const updatedLog: PaymentLog = {
    ...log,
    matchedInstallmentIds: updatedMatchIds,
    unmatched: false,
    auditLog: [
      ...(log.auditLog ?? []),
      {
        timestamp: ts,
        user: session.sub,
        action: 'matched',
        after: { instalmentId, amount },
        notes: `Allocated Rs ${amount.toLocaleString('en-IN')} to ${instalmentId}.`,
      },
    ],
  }
  await paymentLogRepo.update(updatedLog, { queuedBy: session.sub })

  const returnUrl = new URL(`/finance/payments/match/${paymentLogId}`, request.url)
  returnUrl.searchParams.set('matched', String(amount))
  return NextResponse.redirect(returnUrl, { status: 303 })
}
