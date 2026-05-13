/*
 * POST /api/mou/installments/mark-partial (Gate 5A.6 Step 4).
 *
 * Form target for /mous/[mouId]/installments/[paymentId]/mark-partial.
 * Calls recordPartialReceipt() to append a PartialPaymentEntry and
 * set status='Partial' (or 'Paid' if cumulative >= expected).
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { recordPartialReceipt } from '@/lib/payment/recordPartialReceipt'
import type { PaymentMode } from '@/lib/types'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const paymentId = String(form.get('paymentId') ?? '')
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set(
      'next',
      mouId && paymentId
        ? `/mous/${mouId}/installments/${paymentId}/mark-partial`
        : '/',
    )
    return NextResponse.redirect(url, { status: 303 })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId && paymentId
        ? `/mous/${mouId}/installments/${paymentId}/mark-partial`
        : `/mous/${mouId || ''}/installments`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditFinanceData(user)) return errorTo('permission')
  if (!mouId || !paymentId) return errorTo('payment-not-found')

  const receivedAmount = Number(String(form.get('receivedAmount') ?? ''))
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
    return errorTo('invalid-amount')
  }
  const receivedDate = String(form.get('receivedDate') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return errorTo('invalid-date')
  const paymentMode = String(form.get('paymentMode') ?? '') as PaymentMode
  const bankReferenceRaw = String(form.get('bankReference') ?? '').trim()
  const notesRaw = String(form.get('notes') ?? '').trim()

  const result = await recordPartialReceipt({
    paymentId,
    receivedDate,
    receivedAmount,
    paymentMode,
    bankReference: bankReferenceRaw === '' ? null : bankReferenceRaw,
    notes: notesRaw === '' ? null : notesRaw,
    recordedBy: user.id,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/mous/${mouId}/installments`, request.url)
  url.searchParams.set('marked-partial', paymentId)
  return NextResponse.redirect(url, { status: 303 })
}
