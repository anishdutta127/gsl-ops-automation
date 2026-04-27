/*
 * POST /api/dispatch/generate (Phase D2).
 *
 * Form target for the per-MOU "Raise dispatch" affordance. Reads
 * mouId + installmentSeq, looks up the session user, calls
 * raiseDispatch, and streams the rendered .docx as a binary
 * download. Permission gate (mou:raise-dispatch) is enforced
 * inside raiseDispatch.
 *
 * Phase 1 simplified flow: state machine deferred to Phase 1.1
 * when courier integration lands. Today: PO Raised on /generate;
 * Delivered set by D4 delivery-ack upload. Intermediate states
 * (Dispatched, In Transit) not surfaced.
 *
 * Status codes:
 *   200 OK with Content-Disposition attachment   -> success
 *   303 redirect with error param                -> user-facing failures
 *   500 with operator copy                       -> template-missing
 */

import { NextResponse } from 'next/server'
import { raiseDispatch } from '@/lib/dispatch/raiseDispatch'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const installmentSeqRaw = String(form.get('installmentSeq') ?? '')

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(mouId ? `/mous/${mouId}/dispatch` : '/', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')
  const installmentSeq = Number(installmentSeqRaw)
  if (!Number.isFinite(installmentSeq) || installmentSeq <= 0) {
    return errorTo('invalid-installment-seq')
  }

  const result = await raiseDispatch({
    mouId,
    installmentSeq,
    raisedBy: session.sub,
  })

  if (!result.ok) {
    if (result.reason === 'template-missing') {
      return NextResponse.json(
        {
          error: 'template-missing',
          message: result.templateError?.message ?? 'Dispatch template not yet authored.',
        },
        { status: 500 },
      )
    }
    return errorTo(result.reason)
  }

  const filename = `${result.dispatch.id}.docx`
  // Copy into a fresh ArrayBuffer to satisfy BodyInit typing.
  const body = new Uint8Array(result.docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-already-raised': result.wasAlreadyRaised ? 'true' : 'false',
    },
  })
}
