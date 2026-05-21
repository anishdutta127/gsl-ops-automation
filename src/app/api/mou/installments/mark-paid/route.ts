/*
 * POST /api/mou/installments/mark-paid (Gate 5A.6 Step 4).
 *
 * Form target for /mous/[mouId]/installments/[paymentId]/mark-paid.
 * Calls recordReceipt() with the operator-supplied amount + reason;
 * audit notes capture the reason.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { recordReceipt } from '@/lib/payment/recordReceipt'
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
        ? `/mous/${mouId}/installments/${paymentId}/mark-paid`
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
        ? `/mous/${mouId}/installments/${paymentId}/mark-paid`
        : `/mous/${mouId || ''}/installments`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditFinanceData(user)) return errorTo('permission')
  if (!mouId || !paymentId) return errorTo('payment-not-found')

  const reason = String(form.get('reasonForManualMark') ?? '').trim()
  if (!reason) return errorTo('missing-reason')

  // Phase 6E Finding 4: form now sends bankAmount + tdsAmount as the
  // editable inputs. Total receivedAmount is the server-side sum so
  // the legacy receivedAmount field is preserved as the canonical
  // total downstream. Back-compat: if bankAmount + tdsAmount are
  // absent (older clients), fall back to the legacy receivedAmount
  // field with tds=0.
  const bankAmountRaw = String(form.get('bankAmount') ?? '')
  const tdsAmountRaw = String(form.get('tdsAmount') ?? '')
  const legacyReceivedRaw = String(form.get('receivedAmount') ?? '')
  let bankAmount: number | null = null
  let tdsAmount: number | null = null
  let receivedAmount: number
  if (bankAmountRaw !== '') {
    const b = Number(bankAmountRaw)
    const t = tdsAmountRaw !== '' ? Number(tdsAmountRaw) : 0
    if (!Number.isFinite(b) || b < 0) return errorTo('invalid-amount')
    if (!Number.isFinite(t) || t < 0) return errorTo('invalid-amount')
    bankAmount = b
    tdsAmount = t
    receivedAmount = Math.round((b + t) * 100) / 100
  } else {
    receivedAmount = Number(legacyReceivedRaw)
  }
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
    return errorTo('invalid-amount')
  }
  const receivedDate = String(form.get('receivedDate') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return errorTo('invalid-date')
  const paymentMode = String(form.get('paymentMode') ?? '') as PaymentMode
  const bankReferenceRaw = String(form.get('bankReference') ?? '').trim()

  const result = await recordReceipt({
    paymentId,
    receivedDate,
    receivedAmount,
    bankAmount,
    tdsAmount,
    paymentMode,
    bankReference: bankReferenceRaw === '' ? null : bankReferenceRaw,
    notes: `Manual Mark as Paid. Reason: ${reason}`,
    recordedBy: user.id,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/mous/${mouId}/installments`, request.url)
  url.searchParams.set('marked-paid', paymentId)
  return NextResponse.redirect(url, { status: 303 })
}
