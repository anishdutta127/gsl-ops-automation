/*
 * POST /api/dispatch-requests/[requestId]/cancel (W4-D.3).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { cancelRequest } from '@/lib/dispatch/reviewRequest'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params
  const detailUrl = new URL(`/admin/dispatch-requests/${requestId}`, request.url)

  const session = await getCurrentSession()
  if (!session) {
    detailUrl.searchParams.set('error', 'unknown-user')
    return NextResponse.redirect(detailUrl, { status: 303 })
  }

  const form = await request.formData()
  const notes = String(form.get('notes') ?? '').trim()

  const result = await cancelRequest({
    requestId,
    cancelledBy: session.sub,
    notes: notes === '' ? null : notes,
  })

  if (!result.ok) {
    detailUrl.searchParams.set('error', result.reason)
    return NextResponse.redirect(detailUrl, { status: 303 })
  }

  detailUrl.searchParams.set('ok', 'cancelled')
  return NextResponse.redirect(detailUrl, { status: 303 })
}
