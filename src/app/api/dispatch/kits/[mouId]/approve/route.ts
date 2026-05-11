/*
 * POST /api/dispatch/kits/[mouId]/approve (Gate 3 Step 4).
 *
 * Sales approves the kit dispatch. Generates the initial dispatch
 * summary stub from MOU + School master.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canApproveDispatch } from '@/lib/access'
import type { KitDispatch, MOU, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import schoolsJson from '@/data/schools.json'
import { approveKitDispatch } from '@/lib/kitDispatch/approve'

const mous = mousJson as unknown as MOU[]
const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const schools = schoolsJson as unknown as School[]

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
