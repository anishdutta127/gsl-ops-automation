/*
 * POST /api/finance/payment/[paymentId]/skip (Gate 5A.6 Step 13).
 *
 * Finance / Admin skip an instalment. Returns 303 to the instalments
 * page with the result flash.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { skipInstallment } from '@/lib/payment/skipAndVoid'

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
  const reason = String(form.get('reason') ?? '').trim()
  const mouId = String(form.get('mouId') ?? '').trim()
  const redirectBack = mouId === ''
    ? `/finance/payments/${paymentId}`
    : `/mous/${mouId}/installments`

  const result = await skipInstallment({
    paymentId,
    reason,
    recordedBy: session.sub,
  })

  const url = new URL(redirectBack, request.url)
  if (!result.ok) {
    url.searchParams.set('error', `skip-${result.reason}`)
  } else {
    url.searchParams.set('ok', 'skip')
    url.searchParams.set('payment', paymentId)
  }
  return NextResponse.redirect(url, { status: 303 })
}
