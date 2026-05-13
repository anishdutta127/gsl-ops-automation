/*
 * POST /api/finance/pi/[paymentId]/void (Gate 5A.6 Step 13).
 *
 * Admin-only PI void. Counter is NOT rolled back. Emits an Adjustment
 * for the voided amount tied to the same instalment.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { voidPi } from '@/lib/payment/skipAndVoid'

interface RouteContext {
  params: Promise<{ paymentId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { paymentId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/finance/pi/${paymentId}`)
    return NextResponse.redirect(url, { status: 303 })
  }
  const form = await request.formData()
  const reason = String(form.get('reason') ?? '').trim()

  const result = await voidPi({
    paymentId,
    reason,
    recordedBy: session.sub,
  })

  const url = new URL(`/finance/pi/${paymentId}`, request.url)
  if (!result.ok) {
    url.searchParams.set('error', `void-${result.reason}`)
  } else {
    url.searchParams.set('ok', 'void')
    if (result.adjustmentCreated) url.searchParams.set('adjustment', '1')
  }
  return NextResponse.redirect(url, { status: 303 })
}
