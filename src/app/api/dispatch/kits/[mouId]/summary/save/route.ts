/*
 * POST /api/dispatch/kits/[mouId]/summary/save (Gate 3 Step 5).
 *
 * Sales-editable school details; dual-writes to School master per
 * joint spec section 5.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canApproveDispatch } from '@/lib/access'
import type { KitDispatch, School } from '@/lib/types'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import schoolsJson from '@/data/schools.json'
import { saveDispatchSummary } from '@/lib/kitDispatch/summary'

const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const schools = schoolsJson as unknown as School[]

interface Body {
  schoolName?: unknown
  shippingAddress?: unknown
  contactPerson?: unknown
  contactNumber?: unknown
  salesRemarks?: unknown
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
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
  const result = await saveDispatchSummary(
    {
      mouId,
      user: { id: user.id, name: user.name },
      schoolName: str(body.schoolName),
      shippingAddress: str(body.shippingAddress),
      contactPerson: str(body.contactPerson),
      contactNumber: str(body.contactNumber),
      salesRemarks:
        body.salesRemarks === null || body.salesRemarks === undefined
          ? null
          : typeof body.salesRemarks === 'string'
            ? body.salesRemarks
            : null,
    },
    { kitDispatches, schools },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({
    ok: true,
    schoolEdited: result.schoolEdited,
    schoolFieldsChanged: result.schoolFieldsChanged,
  })
}
