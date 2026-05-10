/*
 * POST /api/finance/tally-export (Gate 2 Step 6).
 *
 * Form body: fiscalYear, entity ('MH' | 'UP' | 'both'). Returns the
 * Tally Prime 6.2 XML payload as an attachment download.
 *
 * Permission gate: canAccessFinance. Tally export is technically a
 * read-only operation but in production Sales should not see Finance
 * reports, so the gate matches the page's view gate (Finance + Admin +
 * Leadership read-only).
 *
 * Empty FY returns an XML file with the ENVELOPE header but no
 * voucher messages (per Step 6 V5 edge case).
 */

import { NextResponse } from 'next/server'
import { runTallyExport, type EntitySelection } from '@/lib/finance/runTallyExport'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'

const VALID_ENTITIES: ReadonlyArray<EntitySelection> = ['MH', 'UP', 'both']

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/finance/tally-export')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canAccessFinance(user)) {
    const url = new URL('/finance/tally-export', request.url)
    url.searchParams.set('error', 'permission')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const fiscalYear = String(form.get('fiscalYear') ?? '').trim()
  const entityRaw = String(form.get('entity') ?? 'both').trim() as EntitySelection

  if (fiscalYear === '') {
    const url = new URL('/finance/tally-export', request.url)
    url.searchParams.set('error', 'missing-fiscal-year')
    return NextResponse.redirect(url, { status: 303 })
  }

  const entity: EntitySelection = VALID_ENTITIES.includes(entityRaw) ? entityRaw : 'both'

  const { xml, filename } = await runTallyExport({ fiscalYear, entity })

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
