/*
 * POST /api/communications/[communicationId]/mark-sent (Phase D3).
 *
 * Operator-driven: after the operator copies the composed content
 * via clipboard and sends from Outlook, this endpoint flips the
 * Communication.status from 'queued-for-manual' to 'sent'.
 * Permission gate inside markCommunicationSent.
 *
 * Status codes:
 *   303 redirect to MOU detail (or feedback-request page) -> success
 *   303 redirect with error param                         -> failures
 */

import { NextResponse } from 'next/server'
import { markCommunicationSent } from '@/lib/communications/markSent'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communicationId: string }> },
) {
  const { communicationId } = await params
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/feedback-request` : '/dashboard')
    return NextResponse.redirect(url, { status: 303 })
  }

  const back = (qs: Record<string, string> = {}) => {
    const url = new URL(
      mouId ? `/mous/${mouId}/feedback-request` : '/dashboard',
      request.url,
    )
    if (mouId) url.searchParams.set('communicationId', communicationId)
    for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }

  const result = await markCommunicationSent({
    communicationId,
    markedBy: session.sub,
  })

  if (!result.ok) return back({ error: result.reason })
  return back({ marked: 'sent' })
}
