/*
 * POST /api/mou/cohort-status (W4-A.4 / W4-A.5).
 *
 * Form target for the per-MOU cohortStatus flip surfaced from
 *   - /mous/archive (Reactivate button -> target='active')
 *   - /admin/mou-status (per-row + bulk-edit -> either target)
 *
 * Body shape (form-encoded):
 *   mouId      MOU id
 *   target     'active' | 'archived'
 *   notes      optional reason text (audit log)
 *   returnTo   optional return path (default: /mous/archive when going
 *              to active, /admin/mou-status when going to archived)
 *
 * Permission: Admin via wildcard ('mou:edit-cohort-status'). On
 * permission failure, 303 back to returnTo with ?error=permission so
 * the calling page can render a friendly rail message; per W3-B the
 * forms are visible to non-Admin users (server-side enforcement is
 * the live gate, not the UI).
 */

import { NextResponse } from 'next/server'
import { setCohortStatus } from '@/lib/mou/setCohortStatus'
import { getCurrentSession } from '@/lib/auth/session'

const ALLOWED_TARGETS = new Set(['active', 'archived'])

const VALID_RETURN_PATHS = new Set([
  '/mous/archive',
  '/admin/mou-status',
])

function safeReturnPath(raw: string | null, fallback: string): string {
  if (raw === null) return fallback
  // Hard-allow-list. Mirrors validateNextParam's "no protocol-relative or
  // absolute URLs" intent without the broader open-redirect surface area
  // that flow needs.
  if (VALID_RETURN_PATHS.has(raw)) return raw
  return fallback
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/mous/archive')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const targetRaw = String(form.get('target') ?? '')
  const notes = String(form.get('notes') ?? '').trim() || null
  const returnToRaw = typeof form.get('returnTo') === 'string'
    ? String(form.get('returnTo'))
    : null

  // Default return target: archive page when going active (operator just
  // reactivated something and wants to see the shrunken archive list);
  // admin page when going archived (operator is bulk-managing).
  const defaultReturn = targetRaw === 'archived' ? '/admin/mou-status' : '/mous/archive'
  const returnTo = safeReturnPath(returnToRaw, defaultReturn)

  const errorTo = (reason: string) => {
    const url = new URL(returnTo, request.url)
    url.searchParams.set('error', reason)
    if (mouId) url.searchParams.set('mouId', mouId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')
  if (!ALLOWED_TARGETS.has(targetRaw)) return errorTo('invalid-target')

  const result = await setCohortStatus({
    mouId,
    target: targetRaw as 'active' | 'archived',
    notes,
    changedBy: session.sub,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const url = new URL(returnTo, request.url)
  url.searchParams.set('flipped', mouId)
  url.searchParams.set('to', result.mou.cohortStatus)
  return NextResponse.redirect(url, { status: 303 })
}
