/*
 * POST /api/communications/compose (Phase D3 manual-send pattern).
 *
 * Form target for the per-MOU "Compose feedback request"
 * affordance. Reads { mouId, installmentSeq } from the form body,
 * looks up the session user, calls composeFeedbackRequest, and on
 * success redirects to /mous/[mouId]/feedback-request with the
 * communicationId in the query string. The page reads the id and
 * renders the composed content + 3 action buttons.
 *
 * Permission gate (mou:send-feedback-request) is enforced inside
 * composeFeedbackRequest. The 501 stub at /api/communications/send
 * has been removed; Phase 1.1 automated sending would re-create
 * a /send (or /dispatch) route alongside this one.
 *
 * Status codes:
 *   303 to /mous/[id]/feedback-request?communicationId=...  -> success
 *   303 redirect with error param                          -> failures
 */

import { NextResponse } from 'next/server'
import { composeFeedbackRequest } from '@/lib/communications/composeFeedbackRequest'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const installmentSeqRaw = String(form.get('installmentSeq') ?? '')

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/feedback-request` : '/dashboard')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId ? `/mous/${mouId}/feedback-request` : '/dashboard',
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')
  const installmentSeq = Number(installmentSeqRaw)
  if (!Number.isFinite(installmentSeq) || installmentSeq <= 0) {
    return errorTo('invalid-installment-seq')
  }

  const result = await composeFeedbackRequest({
    mouId,
    installmentSeq,
    composedBy: session.sub,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/mous/${mouId}/feedback-request`, request.url)
  url.searchParams.set('communicationId', result.communication.id)
  return NextResponse.redirect(url, { status: 303 })
}
