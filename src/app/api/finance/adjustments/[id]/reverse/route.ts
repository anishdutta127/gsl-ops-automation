/*
 * POST /api/finance/adjustments/[id]/reverse (Gate 2 Step 6).
 *
 * Form body: reason (optional). Calls reverseAdjustment lib;
 * 303-redirects back to /finance/adjustments with either
 * ?reversed=<id> or ?error=<reason>.
 *
 * Idempotent : a second click on an already-reversed adjustment
 * returns ?error=already-reversed without writing a no-op audit.
 *
 * Permission: canEditFinanceData (Finance + cross-functional Admin).
 */

import { NextResponse } from 'next/server'
import { reverseAdjustment } from '@/lib/finance/reverseAdjustment'
import { getCurrentSession } from '@/lib/auth/session'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/finance/adjustments')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData().catch(() => null)
  const reason = form ? String(form.get('reason') ?? '').trim() : ''

  const result = await reverseAdjustment({
    adjustmentId: id,
    reversedBy: session.sub,
    reason: reason === '' ? null : reason,
  })

  const back = new URL('/finance/adjustments', request.url)
  if (!result.ok) {
    back.searchParams.set('error', result.reason)
    back.searchParams.set('adjustmentId', id)
    return NextResponse.redirect(back, { status: 303 })
  }

  back.searchParams.set('reversed', id)
  return NextResponse.redirect(back, { status: 303 })
}
