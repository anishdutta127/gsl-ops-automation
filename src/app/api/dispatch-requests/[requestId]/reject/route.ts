/*
 * POST /api/dispatch-requests/[requestId]/reject (W4-D.3).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { rejectRequest } from '@/lib/dispatch/reviewRequest'

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
  const rejectionReason = String(form.get('rejectionReason') ?? '')

  const result = await rejectRequest({
    requestId,
    reviewedBy: session.sub,
    rejectionReason,
  })

  if (!result.ok) {
    detailUrl.searchParams.set('error', result.reason)
    return NextResponse.redirect(detailUrl, { status: 303 })
  }

  detailUrl.searchParams.set('ok', 'rejected')
  return NextResponse.redirect(detailUrl, { status: 303 })
}
