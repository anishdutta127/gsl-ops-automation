/*
 * POST /api/mou/[mouId]/communication-sent (W4-I.5 P3C4).
 *
 * Form target for the "Mark as sent" button on the template launcher.
 * Records the operator's intent at click-time as a 'communication-sent'
 * audit entry on the MOU. SMTP-confirmed delivery is deferred to
 * Phase 1.1; the audit captures the realistic workflow.
 */

import { NextResponse } from 'next/server'
import { markCommunicationSent } from '@/lib/templates/markCommunicationSent'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(
  request: Request,
  context: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await context.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const templateId = String(form.get('templateId') ?? '').trim()
  const recipient = String(form.get('recipient') ?? '').trim()
  const subject = String(form.get('subject') ?? '').trim()
  const filledVariablesCsv = String(form.get('filledVariables') ?? '')

  const errorTo = (reason: string) => {
    const url = new URL(`/mous/${mouId}/send-template/${encodeURIComponent(templateId)}`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (templateId === '') return errorTo('missing-template')

  const result = await markCommunicationSent({
    mouId,
    templateId,
    recipient,
    subject,
    filledVariablesCsv,
    sentBy: session.sub,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/mous/${mouId}/send-template/${encodeURIComponent(templateId)}`, request.url)
  url.searchParams.set('sent', '1')
  return NextResponse.redirect(url, { status: 303 })
}
