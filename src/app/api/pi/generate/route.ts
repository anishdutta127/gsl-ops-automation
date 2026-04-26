/*
 * POST /api/pi/generate (Phase D1).
 *
 * Form target for the per-MOU "Generate PI" affordance. Reads mouId
 * + instalmentSeq, looks up the session user, calls generatePi, and
 * streams the rendered .docx as a binary download. Permission gate
 * (mou:generate-pi) is enforced inside generatePi.
 *
 * Failure responses follow the form-POST convention used elsewhere:
 * 303 redirect back to the MOU PI page with an `error` query param
 * so the calling page can render a friendly message. The exception
 * is `template-missing`, which is an operator-facing error rather
 * than a user-facing one; we surface its copyable message via 500
 * so it shows up clearly in server logs.
 *
 * Status codes:
 *   200 OK with Content-Disposition attachment   -> success
 *   303 redirect with error param                -> user-facing failures
 *   500 with operator copy                       -> template-missing
 */

import { NextResponse } from 'next/server'
import { generatePi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const instalmentSeqRaw = String(form.get('instalmentSeq') ?? '')

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}` : '/dashboard')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(mouId ? `/mous/${mouId}/pi` : '/dashboard', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')
  const instalmentSeq = Number(instalmentSeqRaw)
  if (!Number.isFinite(instalmentSeq) || instalmentSeq <= 0) {
    return errorTo('invalid-instalment-seq')
  }

  const result = await generatePi({
    mouId,
    instalmentSeq,
    generatedBy: session.sub,
  })

  if (!result.ok) {
    if (result.reason === 'template-missing') {
      return NextResponse.json(
        {
          error: 'template-missing',
          message: result.templateError?.message ?? 'PI template not yet authored.',
        },
        { status: 500 },
      )
    }
    return errorTo(result.reason)
  }

  const filename = `${result.piNumber.replaceAll('/', '_')}.docx`
  // Copy into a fresh ArrayBuffer to satisfy BodyInit typing (Uint8Array
  // returned by docxtemplater is backed by SharedArrayBuffer in some
  // Node builds which Response does not accept directly).
  const body = new Uint8Array(result.docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
