/*
 * POST /api/mou/[mouId]/dispatch-override/reject (Gate 5A.5 Step 4).
 *
 * Form target for the "Reject" button on the override approval
 * banner. Same approver gate as approve.
 *
 * Body shape (form-encoded):
 *   reason   non-empty rationale for the rejection
 *
 * 303 redirects back to /mous/[mouId] with notice=override-rejected
 * on success, error=<code> on failure.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canApproveDispatchOverride } from '@/lib/access'
import { enqueueReject } from '@/lib/mou/dispatchOverride'
import { getDispatchOverrideApproverUserId } from '@/lib/mou/overrideApprover'
import usersJson from '@/data/users.json'
import mousJson from '@/data/mous.json'
import type { MOU, User } from '@/lib/types'

const users = usersJson as unknown as User[]
const mous = mousJson as unknown as MOU[]

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

  const user = users.find((u) => u.id === session.sub)
  const approverUserId = getDispatchOverrideApproverUserId()
  if (!user || !canApproveDispatchOverride(user, approverUserId)) {
    const url = new URL(`/mous/${mouId}`, request.url)
    url.searchParams.set('error', 'override-permission')
    return NextResponse.redirect(url, { status: 303 })
  }

  const mou = mous.find((m) => m.id === mouId)
  if (!mou) {
    const url = new URL('/mous', request.url)
    url.searchParams.set('error', 'mou-not-found')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const reason = String(form.get('reason') ?? '').trim()

  const outcome = await enqueueReject({
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
    outcome.alreadyRejected ? 'override-already-rejected' : 'override-rejected',
  )
  return NextResponse.redirect(url, { status: 303 })
}
