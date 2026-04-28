/*
 * GET /api/dispatch/[id]/handover-worksheet (W4-H.3).
 *
 * Streams the school-facing kits handover worksheet .docx for a known
 * Dispatch. Pure re-render: no decrement, no queue write besides the
 * audit-append, no state transitions. The user must be authenticated;
 * permission is the implicit MOU read gate (a user who can see the
 * dispatch on /mous/[id]/dispatch can download).
 *
 * On success: appends a 'handover-worksheet-downloaded' audit entry
 * to Dispatch.auditLog with 60s dedup per (user, action). Audit
 * enqueue failures log + swallow; the download is not blocked.
 *
 * Status codes:
 *   200 OK with Content-Disposition attachment   -> success
 *   401 redirect to /login                       -> not authenticated
 *   404                                           -> dispatch not found
 *   500                                           -> template-missing
 */

import { NextResponse } from 'next/server'
import type { Dispatch, MOU, School } from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentSession } from '@/lib/auth/session'
import { generateHandoverWorksheet } from '@/lib/dispatch/generateHandoverWorksheet'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { shouldAppendDownloadAudit } from '@/lib/dispatch/auditDownloadDedup'

const dispatches = dispatchesJson as unknown as Dispatch[]
const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/api/dispatch/${id}/handover-worksheet`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const dispatch = dispatches.find((d) => d.id === id)
  if (!dispatch) {
    return NextResponse.json({ error: 'dispatch-not-found' }, { status: 404 })
  }

  const mou = mous.find((m) => m.id === dispatch.mouId)
  if (!mou) {
    return NextResponse.json({ error: 'mou-not-found' }, { status: 404 })
  }

  const school = schools.find((s) => s.id === dispatch.schoolId)
  if (!school) {
    return NextResponse.json({ error: 'school-not-found' }, { status: 404 })
  }

  const result = await generateHandoverWorksheet({
    dispatch,
    mou,
    school,
    now: () => new Date(),
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'template-missing',
        message: result.templateError.message,
      },
      { status: 500 },
    )
  }

  // Audit + enqueue: fire-and-forget so a queue outage does not block
  // the download. Dedup at 60s per (user, action) so a re-click does
  // not pollute the audit trail.
  const now = new Date()
  if (
    shouldAppendDownloadAudit({
      auditLog: dispatch.auditLog,
      user: session.sub,
      action: 'handover-worksheet-downloaded',
      now,
    })
  ) {
    const updatedDispatch: Dispatch = {
      ...dispatch,
      auditLog: [
        ...dispatch.auditLog,
        {
          timestamp: now.toISOString(),
          user: session.sub,
          action: 'handover-worksheet-downloaded',
          after: { dispatchId: dispatch.id },
          notes: `Handover worksheet downloaded by ${session.name}.`,
        },
      ],
    }
    enqueueUpdate({
      queuedBy: session.sub,
      entity: 'dispatch',
      operation: 'update',
      payload: updatedDispatch as unknown as Record<string, unknown>,
    }).catch((err) => {
      console.error('[handover-worksheet] audit enqueue failed', err)
    })
  }

  const filename = `HandoverWorksheet-${dispatch.id}.docx`
  const body = new Uint8Array(result.docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-row-count': String(result.rowCount),
      'x-total-quantity': String(result.totalQuantity),
    },
  })
}
