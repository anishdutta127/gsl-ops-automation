/*
 * POST /api/admin/mou-status/bulk (W4-A.5).
 *
 * Bulk cohortStatus flip handler for /admin/mou-status. Body shape:
 *
 *   mouIds   one or more MOU ids (HTML form sends a list of values
 *            for multi-select checkboxes under the same name)
 *   target   'active' | 'archived'
 *
 * Loops over the selected ids and calls setCohortStatus per id; the
 * lib mutator runs the permission check + audit + queue write per
 * row. If any single row fails (most likely 'permission' since the
 * form is W3-B-style visible to non-Admin), the redirect carries
 * partial-failure semantics so the page can flash the rail.
 *
 * Audit anchor: per-row (the lib mutator writes the entry on the
 * MOU's auditLog). The bulk submit itself does not write a separate
 * audit entry; the per-row entries plus the queue history give a
 * complete trail.
 */

import { NextResponse } from 'next/server'
import { setCohortStatus } from '@/lib/mou/setCohortStatus'
import { getCurrentSession } from '@/lib/auth/session'

const ALLOWED_TARGETS = new Set(['active', 'archived'])

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/mou-status')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  // HTML forms send all checked checkboxes under the same name; getAll
  // returns the full list. Coerce to string[] (filter out non-strings just
  // in case a non-File entry shows up).
  const mouIds = form.getAll('mouIds').map((v) => String(v)).filter((s) => s !== '')
  const targetRaw = String(form.get('target') ?? '')

  const errorTo = (reason: string) => {
    const url = new URL('/admin/mou-status', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (mouIds.length === 0) return errorTo('no-selection')
  if (!ALLOWED_TARGETS.has(targetRaw)) return errorTo('invalid-target')

  const target = targetRaw as 'active' | 'archived'

  let succeeded = 0
  let firstFailure: string | null = null
  for (const mouId of mouIds) {
    const result = await setCohortStatus({
      mouId,
      target,
      changedBy: session.sub,
    })
    if (result.ok) {
      succeeded += 1
    } else if (firstFailure === null) {
      firstFailure = result.reason
    }
  }

  // If every row failed for permission, surface the gate instead of
  // pretending some succeeded (succeeded === 0 implies the operator hit
  // the wall).
  if (succeeded === 0 && firstFailure !== null) {
    return errorTo(firstFailure)
  }

  const url = new URL('/admin/mou-status', request.url)
  url.searchParams.set('bulkCount', String(succeeded))
  url.searchParams.set('bulkTarget', target)
  if (firstFailure !== null && succeeded < mouIds.length) {
    url.searchParams.set('error', 'partial-failure')
  }
  return NextResponse.redirect(url, { status: 303 })
}
