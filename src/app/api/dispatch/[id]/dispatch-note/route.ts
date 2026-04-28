/*
 * GET /api/dispatch/[id]/dispatch-note (W4-H.4.1).
 *
 * Streams the GSL-internal dispatch note .docx for a known Dispatch.
 * Mirror of the W4-H.3 handover-worksheet route in shape: pure
 * re-render, audit-append with 60s dedup, no state transitions.
 *
 * The .docx itself is rendered via the W4-D.5 dispatch-template path:
 * we reuse `buildPlaceholderBag` + `renderDispatchDocx` (exported
 * from raiseDispatch.ts in this batch) so the document is byte-equivalent
 * to the one produced when the dispatch was originally raised, modulo
 * the AUTHORISED_BY name (looked up from dispatch.raisedBy at render
 * time so it stays the original raiser, not the downloader).
 *
 * Permission: implicit MOU read gate (a user who can see the dispatch
 * on /mous/[id]/dispatch can re-download).
 *
 * Status codes:
 *   200 OK with Content-Disposition attachment   -> success
 *   401 redirect to /login                       -> not authenticated
 *   404                                           -> dispatch / mou / school / raiser not found
 *   500                                           -> template-missing
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import type { Dispatch, MOU, School, User } from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import companyJson from '../../../../../../config/company.json'
import { getCurrentSession } from '@/lib/auth/session'
import {
  buildPlaceholderBag,
  renderDispatchDocx,
  type CompanyConfig,
} from '@/lib/dispatch/raiseDispatch'
import {
  DISPATCH_TEMPLATE,
  DispatchTemplateMissingError,
} from '@/lib/dispatch/templates'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { shouldAppendDownloadAudit } from '@/lib/dispatch/auditDownloadDedup'

const dispatches = dispatchesJson as unknown as Dispatch[]
const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]
const users = usersJson as unknown as User[]
const company = companyJson as CompanyConfig

async function defaultLoadTemplate(templatePath: string): Promise<Uint8Array> {
  const fullPath = path.join(process.cwd(), templatePath)
  try {
    return await readFile(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DispatchTemplateMissingError(DISPATCH_TEMPLATE.id, DISPATCH_TEMPLATE.file)
    }
    throw err
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/api/dispatch/${id}/dispatch-note`)
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

  // raisedByName preserves the AUTHORISED_BY field from the original
  // raise (not the current downloader). Falls back to dispatch.raisedBy
  // when the user record is missing (e.g., user was deactivated).
  const raiser = users.find((u) => u.id === dispatch.raisedBy)
  const raisedByName = raiser ? raiser.name : dispatch.raisedBy

  const ts = dispatch.poRaisedAt ?? new Date().toISOString()

  let docxBytes: Uint8Array
  try {
    const bag = buildPlaceholderBag({
      dispatch,
      mou,
      school,
      company,
      raisedByName,
      ts,
    })
    docxBytes = await renderDispatchDocx(bag, defaultLoadTemplate)
  } catch (err) {
    if (err instanceof DispatchTemplateMissingError) {
      return NextResponse.json(
        { error: 'template-missing', message: err.message },
        { status: 500 },
      )
    }
    throw err
  }

  const now = new Date()
  if (
    shouldAppendDownloadAudit({
      auditLog: dispatch.auditLog,
      user: session.sub,
      action: 'dispatch-note-downloaded',
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
          action: 'dispatch-note-downloaded',
          after: { dispatchId: dispatch.id },
          notes: `Dispatch note re-downloaded by ${session.name}.`,
        },
      ],
    }
    enqueueUpdate({
      queuedBy: session.sub,
      entity: 'dispatch',
      operation: 'update',
      payload: updatedDispatch as unknown as Record<string, unknown>,
    }).catch((err) => {
      console.error('[dispatch-note] audit enqueue failed', err)
    })
  }

  const filename = `DispatchNote-${dispatch.id}.docx`
  const body = new Uint8Array(docxBytes).buffer
  return new Response(body, {
    status: 200,
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
