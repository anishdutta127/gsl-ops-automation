/*
 * POST /api/payment/record (W4-B.5).
 *
 * Form target for /mous/[id]/payment-receipt. Accepts the receipt
 * details, calls recordReceipt, and 303-redirects back to the form
 * with either ?recorded=<paymentId> or ?error=<reason>.
 *
 * Permission: 'payment:reconcile' (Finance + Admin via wildcard).
 * Non-finance submits 303 back with ?error=permission.
 */

import { NextResponse } from 'next/server'
import { recordReceipt } from '@/lib/payment/recordReceipt'
import { getCurrentSession } from '@/lib/auth/session'
import type { PaymentMode } from '@/lib/types'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const paymentId = String(form.get('paymentId') ?? '')
  const receivedDate = String(form.get('receivedDate') ?? '')
  const receivedAmountRaw = String(form.get('receivedAmount') ?? '')
  const paymentMode = String(form.get('paymentMode') ?? '') as PaymentMode
  const bankReferenceRaw = String(form.get('bankReference') ?? '').trim()
  const notesRaw = String(form.get('notes') ?? '').trim()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/payment-receipt` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId ? `/mous/${mouId}/payment-receipt` : '/',
      request.url,
    )
    url.searchParams.set('error', reason)
    if (paymentId) url.searchParams.set('paymentId', paymentId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!paymentId) return errorTo('missing-payment')
  const receivedAmount = Number(receivedAmountRaw)
  if (!Number.isFinite(receivedAmount)) return errorTo('invalid-amount')

  const result = await recordReceipt({
    paymentId,
    receivedDate,
    receivedAmount,
    paymentMode,
    bankReference: bankReferenceRaw === '' ? null : bankReferenceRaw,
    notes: notesRaw === '' ? null : notesRaw,
    recordedBy: session.sub,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const url = new URL(
    mouId ? `/mous/${mouId}/payment-receipt` : '/',
    request.url,
  )
  url.searchParams.set('recorded', paymentId)
  if (result.hasVariance) {
    url.searchParams.set('variance', String(result.varianceRs))
  }
  return NextResponse.redirect(url, { status: 303 })
}
