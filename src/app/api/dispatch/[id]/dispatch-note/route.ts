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
import { shouldAppendDownloadAudit } from '@/lib/dispatch/auditDownloadDedup'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { userRepo } from '@/lib/db/repos/user'

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

  const dispatch = await dispatchRepo.findById(id)
  if (!dispatch) {
    return NextResponse.json({ error: 'dispatch-not-found' }, { status: 404 })
  }

  const mou = dispatch.mouId ? await mouRepo.findById(dispatch.mouId) : null
  if (!mou) {
    return NextResponse.json({ error: 'mou-not-found' }, { status: 404 })
  }

  const school = await schoolRepo.findById(dispatch.schoolId)
  if (!school) {
    return NextResponse.json({ error: 'school-not-found' }, { status: 404 })
  }

  // raisedByName preserves the AUTHORISED_BY field from the original
  // raise (not the current downloader). Falls back to dispatch.raisedBy
  // when the user record is missing (e.g., user was deactivated).
  const raiser = await userRepo.findById(dispatch.raisedBy)
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
    // ATOMIC: appendAudit only - no scalar field changes. Two parallel
    // download audit entries land via JSONB || concat without losing
    // either one.
    dispatchRepo.appendAudit(dispatch.id, {
      timestamp: now.toISOString(),
      user: session.sub,
      action: 'dispatch-note-downloaded',
      after: { dispatchId: dispatch.id },
      notes: `Dispatch note re-downloaded by ${session.name}.`,
    }, { queuedBy: session.sub }).catch((err) => {
      console.error('[dispatch-note] audit append failed', err)
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
