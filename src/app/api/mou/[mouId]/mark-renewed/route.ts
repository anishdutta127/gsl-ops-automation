/*
 * POST /api/mou/[mouId]/mark-renewed (Gate 4.95 Session 4).
 *
 * Form target for the per-row Mark as Renewed button on
 * /finance/renewals. Body shape (form-encoded):
 *
 *   notes      optional reason text (audit log)
 *   returnTo   optional return path (default: /finance/renewals)
 *
 * Permission: canEditMOU (sales department + Admin wildcard) per the
 * brief - renewals are owned by Sales. On permission failure: 303 back
 * to returnTo with ?error=permission so the rail can render a friendly
 * message. The form is visible to non-Sales users per W3-B; server-
 * side enforcement is the live gate.
 *
 * Path parameter name is [mouId] (not [id]) to match the existing
 * /api/mou/[mouId]/ namespace; Next.js will reject two different
 * dynamic parameter names at the same path position.
 */

import { NextResponse } from 'next/server'
import { markRenewed } from '@/lib/mou/markRenewed'
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
  const notes = String(form.get('notes') ?? '').trim() || null
  const returnToRaw =
    typeof form.get('returnTo') === 'string'
      ? String(form.get('returnTo'))
      : null
  const returnTo = safeReturnPath(returnToRaw, '/finance/renewals')

  const errorTo = (reason: string) => {
    const url = new URL(returnTo, request.url)
    url.searchParams.set('error', reason)
    if (mouId) url.searchParams.set('mouId', mouId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')

  const result = await markRenewed({
    mouId,
    changedBy: session.sub,
    notes,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL(returnTo, request.url)
  url.searchParams.set('renewed', mouId)
  return NextResponse.redirect(url, { status: 303 })
}
