/*
 * POST /api/mou/[mouId]/dispatch-override/approve (Gate 5A.5 Step 4).
 *
 * Form target for the "Approve" button on the override approval
 * banner. Gated on canApproveDispatchOverride which expects the
 * caller to be the configured override approver (default Shashank)
 * or an Admin with null department.
 *
 * Body shape (form-encoded):
 *   notes    optional approval notes
 *
 * 303 redirects back to /mous/[mouId] with notice=override-approved
 * on success, error=<code> on failure.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canApproveDispatchOverride } from '@/lib/access'
import { enqueueApprove } from '@/lib/mou/dispatchOverride'
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
  const approverUserId = await getDispatchOverrideApproverUserId()
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
  const notes = String(form.get('notes') ?? '')

  const outcome = await enqueueApprove({
    mou,
    byUserId: user.id,
    notes,
  })

  const url = new URL(`/mous/${mouId}`, request.url)
  if (!outcome.ok) {
    url.searchParams.set('error', `override-${outcome.reason}`)
    return NextResponse.redirect(url, { status: 303 })
  }
  url.searchParams.set(
    'notice',
    outcome.alreadyApproved ? 'override-already-approved' : 'override-approved',
  )
  return NextResponse.redirect(url, { status: 303 })
}
