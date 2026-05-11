/*
 * POST /api/dispatch/kits/[mouId]/reject (Gate 3 Step 4).
 *
 * Sales rejects the kit dispatch with a mandatory non-empty reason.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canApproveDispatch } from '@/lib/access'
import type { KitDispatch, MOU, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import schoolsJson from '@/data/schools.json'
import { rejectKitDispatch } from '@/lib/kitDispatch/approve'

const mous = mousJson as unknown as MOU[]
const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const schools = schoolsJson as unknown as School[]

interface Body {
  reason?: unknown
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canApproveDispatch(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason : ''
  if (reason.trim() === '') {
    return NextResponse.json({ error: 'rejection-reason-required' }, { status: 400 })
  }
  const result = await rejectKitDispatch(
    { mouId, user: { id: user.id, name: user.name }, reason },
    { mous, kitDispatches, schools },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({ ok: true })
}
