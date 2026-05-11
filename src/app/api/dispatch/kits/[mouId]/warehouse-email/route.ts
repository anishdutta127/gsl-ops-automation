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
import type { AuditEntry, KitDispatch } from '@/lib/types'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]

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
  const kd = kitDispatches.find((k) => k.mouId === mouId)
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
  const nextRecord: KitDispatch = {
    ...kd,
    dispatchSummary: {
      ...kd.dispatchSummary,
      warehouseEmailLoggedAt: isoNow,
    },
    auditLog: [...kd.auditLog, audit],
  }
  await enqueueUpdate({
    queuedBy: user.id,
    entity: 'kitDispatch',
    operation: 'update',
    payload: {
      id: kd.id,
      mouId,
      record: nextRecord as unknown as Record<string, unknown>,
    },
  })
  return NextResponse.json({ ok: true, loggedAt: isoNow })
}
