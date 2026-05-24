/*
 * POST /api/mou/[mouId]/dispatch-override/request (Gate 5A.5 Step 4).
 *
 * Form target for the "Request dispatch override" modal on the MOU
 * detail page. Sales / Ops can request; the configured override
 * approver (default Shashank) approves or rejects via the sibling
 * routes.
 *
 * Body shape (form-encoded):
 *   reason   non-empty rationale for the override
 *
 * 303 redirects back to /mous/[mouId] with notice=override-requested
 * on success, error=<code> on failure.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canRequestDispatchOverride } from '@/lib/access'
import { enqueueRequest } from '@/lib/mou/dispatchOverride'
import { userRepo } from '@/lib/db/repos/user'
import { mouRepo } from '@/lib/db/repos/mou'

interface Ctx {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { mouId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const users = await userRepo.findAll()
  const user = users.find((u) => u.id === session.sub)
  if (!user || !canRequestDispatchOverride(user)) {
    const url = new URL(`/mous/${mouId}`, request.url)
    url.searchParams.set('error', 'override-permission')
    return NextResponse.redirect(url, { status: 303 })
  }

  const mous = await mouRepo.findAll()
  const mou = mous.find((m) => m.id === mouId)
  if (!mou) {
    const url = new URL('/mous', request.url)
    url.searchParams.set('error', 'mou-not-found')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const reason = String(form.get('reason') ?? '').trim()

  const outcome = await enqueueRequest({
    mou,
    byUserId: user.id,
    reason,
  })

  const url = new URL(`/mous/${mouId}`, request.url)
  if (!outcome.ok) {
    url.searchParams.set('error', `override-${outcome.reason}`)
    return NextResponse.redirect(url, { status: 303 })
  }
  url.searchParams.set(
    'notice',
    outcome.alreadyRequested ? 'override-already-requested' : 'override-requested',
  )
  return NextResponse.redirect(url, { status: 303 })
}
