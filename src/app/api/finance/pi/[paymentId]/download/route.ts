/*
 * GET /api/finance/pi/[paymentId]/download (Gate 5A Step 2).
 *
 * Render-only download for an already-issued PI. Calls renderPi which
 * does NOT advance the per-entity counter, does NOT enqueue any
 * Payment/MOU update, and does NOT write any audit entry. The
 * Download button on /finance/pi/[paymentId] is wired here so a
 * Finance user opening the same PI twice gets identical .docx bytes
 * twice without burning a fresh number off the counter.
 *
 * The parallel-build lock guards issueAndRenderPi (the counter-advance
 * path); render-only is intentionally NOT lock-gated because no
 * counter state changes on this code path.
 */

import { NextResponse } from 'next/server'
import { renderPi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'

interface Params {
  params: Promise<{ paymentId: string }>
}

export async function GET(request: Request, { params }: Params) {
  const { paymentId } = await params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/finance/pi/${paymentId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const result = await renderPi({ paymentId })

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
    const url = new URL(`/finance/pi/${paymentId}`, request.url)
    url.searchParams.set('error', result.reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const filename = `${result.piNumber.replaceAll('/', '_')}.docx`
  const body = new Uint8Array(result.docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
