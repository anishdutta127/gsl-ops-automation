/*
 * POST /api/mou/[mouId]/decline-renewal (Gate 4.95 Session 4).
 *
 * Form target for the per-row "Decline to renew" affordance on
 * /finance/renewals. Body shape (form-encoded):
 *
 *   reason     required free-text reason (audit log notes)
 *   returnTo   optional return path (default: /finance/renewals)
 *
 * Does NOT mutate MOU.status; the audit signal alone records the
 * decline. The renewalsData lib reads the log to surface the latest
 * renewal signal, so a subsequent Mark as Renewed correctly overrides
 * the decline.
 *
 * Permission: canEditMOU (sales department + Admin wildcard); mirrors
 * mark-renewed. Path parameter name is [mouId] to match the existing
 * /api/mou/[mouId]/ namespace.
 */

import { NextResponse } from 'next/server'
import { declineRenewal } from '@/lib/mou/declineRenewal'
import { getCurrentSession } from '@/lib/auth/session'

const VALID_RETURN_PATHS = new Set([
  '/finance/renewals',
  '/dashboard/finance',
])

function safeReturnPath(raw: string | null, fallback: string): string {
  if (raw === null) return fallback
  if (VALID_RETURN_PATHS.has(raw)) return raw
  return fallback
}

export async function POST(
  request: Request,
  context: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await context.params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/finance/renewals')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const reason = String(form.get('reason') ?? '').trim()
  const returnToRaw =
    typeof form.get('returnTo') === 'string'
      ? String(form.get('returnTo'))
      : null
  const returnTo = safeReturnPath(returnToRaw, '/finance/renewals')

  const errorTo = (errorReason: string) => {
    const url = new URL(returnTo, request.url)
    url.searchParams.set('error', errorReason)
    if (mouId) url.searchParams.set('mouId', mouId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')
  if (!reason) return errorTo('missing-reason')

  const result = await declineRenewal({
    mouId,
    changedBy: session.sub,
    reason,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL(returnTo, request.url)
  url.searchParams.set('declined', mouId)
  return NextResponse.redirect(url, { status: 303 })
}
