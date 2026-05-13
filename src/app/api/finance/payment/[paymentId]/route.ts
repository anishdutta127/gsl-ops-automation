/*
 * POST /api/finance/payment/[paymentId] (Gate 5A.6 Step 10).
 *
 * Action multiplexer: edit / unmatch / delete via `action` form field.
 *
 *   - action='edit'    -> editPayment (Finance + Admin)
 *   - action='unmatch' -> unmatchPayment (Finance + Admin)
 *   - action='delete'  -> deletePayment (Admin wildcard only)
 *
 * 303-redirects back to /finance/payments/[id] with ?ok=<action> or
 * ?error=<reason>.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import {
  editPayment,
  unmatchPayment,
  deletePayment,
} from '@/lib/payment/paymentMutations'
import type { PaymentMode } from '@/lib/types'

interface RouteContext {
  params: Promise<{ paymentId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { paymentId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/finance/payments/${paymentId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const action = String(form.get('action') ?? '').trim()

  const redirectTo = (params: Record<string, string>) => {
    const url = new URL(`/finance/payments/${paymentId}`, request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (action === 'edit') {
    const receivedDate = String(form.get('receivedDate') ?? '')
    const receivedAmount = Number(form.get('receivedAmount') ?? '')
    const paymentMode = String(form.get('paymentMode') ?? '') as PaymentMode
    const bankReferenceRaw = String(form.get('bankReference') ?? '').trim()
    const notesRaw = String(form.get('notes') ?? '').trim()
    const result = await editPayment({
      paymentId,
      receivedDate,
      receivedAmount,
      paymentMode,
      bankReference: bankReferenceRaw === '' ? null : bankReferenceRaw,
      notes: notesRaw === '' ? null : notesRaw,
      recordedBy: session.sub,
    })
    if (!result.ok) return redirectTo({ error: result.reason })
    return redirectTo({
      ok: 'edit',
      adjustment: result.adjustmentCreated ? '1' : '0',
    })
  }

  if (action === 'unmatch') {
    const reason = String(form.get('reason') ?? '').trim()
    const result = await unmatchPayment({
      paymentId,
      reason,
      recordedBy: session.sub,
    })
    if (!result.ok) return redirectTo({ error: result.reason })
    return redirectTo({ ok: 'unmatch' })
  }

  if (action === 'delete') {
    const reason = String(form.get('reason') ?? '').trim()
    const result = await deletePayment({
      paymentId,
      reason,
      recordedBy: session.sub,
    })
    if (!result.ok) return redirectTo({ error: result.reason })
    return redirectTo({ ok: 'delete' })
  }

  return redirectTo({ error: 'invalid-action' })
}
