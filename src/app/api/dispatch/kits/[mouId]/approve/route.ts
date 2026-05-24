/*
 * POST /api/dispatch/kits/[mouId]/approve (Gate 3 Step 4).
 *
 * Sales approves the kit dispatch. Generates the initial dispatch
 * summary stub from MOU + School master.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canApproveDispatch } from '@/lib/access'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { schoolRepo } from '@/lib/db/repos/school'
import { approveKitDispatch } from '@/lib/kitDispatch/approve'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canApproveDispatch(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const mous = await mouRepo.findAll()
  const kitDispatches = await kitDispatchRepo.findAll()
  const schools = await schoolRepo.findAll()
  const result = await approveKitDispatch(
    { mouId, user: { id: user.id, name: user.name } },
    { mous, kitDispatches, schools },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({ ok: true })
}
