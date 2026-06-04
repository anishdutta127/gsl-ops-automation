/*
 * POST /api/mou/[mouId]/submit-to-finance (Step 2, item 7).
 *
 * The Ops->Finance handoff. When Ops has assigned products + aligned
 * dispatch on the review screen, "Submit to Finance for Dispatch"
 * advances opsReviewStatus to 'Submitted to Finance'. Finance then sees
 * it in the dispatch-requests view to raise the Delivery Note.
 *
 * This is the Step-1-aligned dispatch handoff (products[] portfolio +
 * opsReviewStatus), deliberately SEPARATE from the legacy raiseDispatch /
 * Dispatch entity so the two dispatch systems coexist without collision:
 * this route touches only the MOU's ops_review_status column, never the
 * dispatches table the legacy admin/intake readers depend on.
 *
 * Permission: canRaiseDispatch (Ops + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import type { AuditEntry } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'

interface RouteContext {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/operations/review/${mouId}`)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canRaiseDispatch(user)) {
    return NextResponse.redirect(new URL(`/operations/review/${mouId}?error=permission`, request.url), { status: 303 })
  }

  const mou = await mouRepo.findById(mouId)
  if (!mou) {
    return NextResponse.redirect(new URL(`/operations/review/${mouId}?error=not-found`, request.url), { status: 303 })
  }

  // Guard: a portfolio must be assigned before submitting for dispatch.
  if (!mou.products || mou.products.length === 0) {
    return NextResponse.redirect(new URL(`/operations/review/${mouId}?error=no-products`, request.url), { status: 303 })
  }

  const now = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'status_change',
    before: { opsReviewStatus: mou.opsReviewStatus ?? null },
    after: { opsReviewStatus: 'Submitted to Finance' },
    notes: 'Submitted to Finance for Dispatch (Ops review complete).',
  }

  try {
    await mouRepo.updateWithAudit(
      mou.id,
      { opsReviewStatus: 'Submitted to Finance' },
      audit,
      { queuedBy: user.id },
    )
  } catch {
    return NextResponse.redirect(
      new URL(`/operations/review/${mouId}?error=save-failed`, request.url),
      { status: 303 },
    )
  }

  return NextResponse.redirect(new URL(`/operations/review/${mouId}?submitted=1`, request.url), { status: 303 })
}
