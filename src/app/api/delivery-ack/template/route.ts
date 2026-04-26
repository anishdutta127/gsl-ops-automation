/*
 * POST /api/delivery-ack/template (Phase D4).
 *
 * Generates the BLANK delivery acknowledgement docx for printing.
 * No state mutation; operator prints the form, carries it to the
 * school, gets it stamped + signed, then uploads the scan/photo
 * and posts the URL via /api/delivery-ack/acknowledge.
 *
 * Permission gate (mou:upload-delivery-ack) inside generateDeliveryAck.
 *
 * Status codes:
 *   200 OK with .docx Content-Disposition       -> success
 *   303 redirect with error param               -> user-facing failures
 *   500 with operator copy                      -> template-missing
 */

import { NextResponse } from 'next/server'
import { generateDeliveryAck } from '@/lib/deliveryAck/generateDeliveryAck'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const dispatchId = String(form.get('dispatchId') ?? '')
  const mouId = String(form.get('mouId') ?? '')

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

  const result = await generateDeliveryAck({
    dispatchId,
    generatedBy: session.sub,
  })

  if (!result.ok) {
    if (result.reason === 'template-missing') {
      return NextResponse.json(
        {
          error: 'template-missing',
          message: result.templateError?.message ?? 'Delivery acknowledgement template not yet authored.',
        },
        { status: 500 },
      )
    }
    return errorTo(result.reason)
  }

  const filename = `${result.dispatch.id}-handover.docx`
  const body = new Uint8Array(result.docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
