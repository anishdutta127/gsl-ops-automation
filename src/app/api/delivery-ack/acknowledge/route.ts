/*
 * POST /api/delivery-ack/acknowledge (Phase D4).
 *
 * Records the signed handover form URL on the Dispatch and
 * advances state to 'acknowledged'. Phase 1 simplified flow sets
 * deliveredAt + acknowledgedAt + acknowledgementUrl all in one
 * transition (Phase 1.1 may differentiate when courier integration
 * lands).
 *
 * Permission gate (mou:upload-delivery-ack) inside acknowledgeDispatch.
 */

import { NextResponse } from 'next/server'
import { acknowledgeDispatch } from '@/lib/deliveryAck/acknowledgeDispatch'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const dispatchId = String(form.get('dispatchId') ?? '')
  const mouId = String(form.get('mouId') ?? '')
  const signedHandoverFormUrl = String(form.get('signedHandoverFormUrl') ?? '').trim()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/delivery-ack` : '/dashboard')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId ? `/mous/${mouId}/delivery-ack` : '/dashboard',
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!dispatchId) return errorTo('missing-dispatch')
  if (!signedHandoverFormUrl) return errorTo('missing-url')

  const result = await acknowledgeDispatch({
    dispatchId,
    signedHandoverFormUrl,
    acknowledgedBy: session.sub,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL(
    mouId ? `/mous/${mouId}/delivery-ack` : '/dashboard',
    request.url,
  )
  url.searchParams.set('acknowledged', result.dispatch.id)
  return NextResponse.redirect(url, { status: 303 })
}
