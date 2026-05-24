/*
 * POST /api/dispatch/kits/[mouId]/shipment/save (Gate 3 Step 8).
 *
 * Save shipment tracking (courier metadata + delivery status). POD
 * upload is a separate route.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canUploadPOD } from '@/lib/access'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { saveShipmentTracking } from '@/lib/kitDispatch/shipment'

interface Body {
  courierName?: unknown
  trackingId?: unknown
  dispatchDate?: unknown
  expectedDelivery?: unknown
  deliveryStatus?: unknown
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
  if (!canUploadPOD(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const deliveryStatus =
    body.deliveryStatus === 'Delivered' || body.deliveryStatus === 'In Transit'
      ? body.deliveryStatus
      : 'In Transit'

  const kitDispatches = await kitDispatchRepo.findAll()
  const result = await saveShipmentTracking(
    {
      mouId,
      user: { id: user.id, name: user.name },
      courierName: str(body.courierName),
      trackingId: str(body.trackingId),
      dispatchDate: str(body.dispatchDate),
      expectedDelivery:
        body.expectedDelivery === null || body.expectedDelivery === undefined
          ? null
          : str(body.expectedDelivery) || null,
      deliveryStatus,
    },
    { kitDispatches },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({ ok: true, newDispatchStatus: result.newDispatchStatus })
}
