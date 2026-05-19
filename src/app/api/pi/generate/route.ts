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
 * so the calling page can render a friendly message. 2026-05-19
 * stabilisation switched parallel-build-locked and template-missing
 * onto the redirect path too; the form is a browser POST so a raw
 * JSON 503 / 500 landed the user on raw JSON instead of the page-level
 * banner. template-missing still logs the underlying error to the
 * server console so the operator can drop the missing .docx and retry.
 *
 * Status codes:
 *   200 OK with Content-Disposition attachment   -> success
 *   303 redirect with error param                -> all failures
 */

import { NextResponse } from 'next/server'
import { generatePi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'
import { isPiParallelBuildLocked } from '@/lib/pi/parallelBuildLock'

export async function POST(request: Request) {
  // Parallel-build lock (Gate 2 housekeeping item A). Default ON: the
  // per-entity counter at pi_counter_map.json is also the cutover-
  // ready snapshot; advancing it during the parallel-build window
  // collides with the next legitimate PI from gsl-mou-system. Checked
  // BEFORE auth so even an authenticated tester cannot accidentally
  // advance the counter. Production unlock: PI_PARALLEL_BUILD_LOCK=false.
  //
  // 2026-05-19 stabilisation: if the lock flips between page-load and
  // submit (or the form is opened with a stale cached page), redirect
  // to the MOU PI page so the existing parallel-build banner renders
  // instead of dropping the user on raw JSON.
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const instalmentSeqRaw = String(form.get('instalmentSeq') ?? '')

  if (isPiParallelBuildLocked()) {
    const url = new URL(mouId ? `/mous/${mouId}/pi` : '/', request.url)
    url.searchParams.set('error', 'parallel-build-locked')
    return NextResponse.redirect(url, { status: 303 })
  }

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(mouId ? `/mous/${mouId}/pi` : '/', request.url)
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
    // template-missing is an operator-facing condition; surface via the
    // same redirect-with-error pattern as the other failure modes. The
    // server log still carries the underlying TemplateMissingError via
    // console.error so the operator can drop the missing template file
    // and retry.
    if (result.reason === 'template-missing') {
      console.error(
        'PI template missing:',
        result.templateError?.message ?? '(no detail)',
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
