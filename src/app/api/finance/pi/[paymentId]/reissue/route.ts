/*
 * POST /api/finance/pi/[paymentId]/reissue (Gate 2 Step 6).
 *
 * Voids the old PI number and advances the per-entity counter.
 * Gated by canEditFinanceData + isPiParallelBuildLocked. Form-POST
 * + 303 redirect back to the view page on success / failure (matches
 * the /mous/[id]/pi pattern; the re-issue button is a plain form
 * submit so no JS is required for the destructive action).
 */

import { NextResponse } from 'next/server'
import { reissuePi } from '@/lib/finance/reissuePi'
import { getCurrentSession } from '@/lib/auth/session'

interface RouteParams {
  params: Promise<{ paymentId: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const { paymentId } = await params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/finance/pi/${paymentId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const result = await reissuePi({ paymentId, reissuedBy: session.sub })

  const back = new URL(`/finance/pi/${paymentId}`, request.url)
  if (!result.ok) {
    back.searchParams.set('error', result.reason)
    return NextResponse.redirect(back, { status: 303 })
  }

  back.searchParams.set('reissued', result.newPiNumber)
  if (result.oldPiNumber !== null) {
    back.searchParams.set('voided', result.oldPiNumber)
  }
  return NextResponse.redirect(back, { status: 303 })
}
