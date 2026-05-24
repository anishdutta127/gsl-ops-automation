/*
 * POST /api/dispatch/kits/[mouId]/warehouse-email (Gate 3 Step 6).
 *
 * Records a warehouse-email intent on the dispatch summary. Gate 4
 * wires actual SMTP delivery; for Step 6 this is intent-only and
 * lands an audit entry.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canExecuteDispatch } from '@/lib/access'
import type { AuditEntry } from '@/lib/types'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'

const WAREHOUSE_EMAIL = 'warehouse@getsetlearn.info'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canExecuteDispatch(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const kd = await kitDispatchRepo.findByMouId(mouId)
  if (!kd) return NextResponse.json({ error: 'dispatch-not-found' }, { status: 404 })
  if (!kd.dispatchSummary) return NextResponse.json({ error: 'no-summary' }, { status: 400 })

  const isoNow = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: isoNow,
    user: user.id,
    action: 'update',
    before: { warehouseEmailLoggedAt: kd.dispatchSummary.warehouseEmailLoggedAt },
    after: { warehouseEmailLoggedAt: isoNow },
    notes: `warehouse-email-intent: ${WAREHOUSE_EMAIL}`,
  }
  // P2b.X OCC #4: dispatch_summary cross-flow OCC (challan + warehouse-
  // email + summary edit + accounts can overlap). Version-checked.
  const r = await kitDispatchRepo.updateAllocationsOCC(
    kd.id,
    kd.version ?? 1,
    {
      dispatchSummary: {
        ...kd.dispatchSummary,
        warehouseEmailLoggedAt: isoNow,
      },
    },
    audit,
    { queuedBy: user.id },
  )
  if (!r.ok) {
    return NextResponse.json(
      {
        error: 'version-conflict',
        conflictVersion: r.conflictVersion,
        message: 'Another user updated this kit_dispatch (summary, challan, accounts, or allocation) while you were logging the warehouse-email intent. Reload to see the latest and re-submit.',
      },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true, loggedAt: isoNow })
}
