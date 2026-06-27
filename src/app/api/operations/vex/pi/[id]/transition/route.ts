/*
 * POST /api/operations/vex/pi/[id]/transition
 *
 * Manual status flip on a VEX PI. Finance / Admin only. Status enum
 * matches the migrated VexPi.status. Phase 1 is a soft transition:
 * any status is reachable from any state. The state machine that
 * derives status from payments + dispatches lives on the snapshot's
 * mou-system code; Ops layers the manual override on top for
 * end-of-deal cleanup.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import type { AuditEntry, VexPi, VexPiStatus } from '@/lib/mouSystem/types'

const ALLOWED: VexPiStatus[] = [
  'Generated',
  'Payment Pending',
  'Delivery Pending',
  'Partially Dispatched',
  'Completed',
]

function parseStatus(v: unknown): VexPiStatus | null {
  return typeof v === 'string' && (ALLOWED as string[]).includes(v)
    ? (v as VexPiStatus)
    : null
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can transition a VEX PI.' },
      { status: 403 },
    )
  }
  // vexPiRepo returns @/lib/types/VexPi; the mouSystem flavour here is
  // structurally compatible but nominally distinct, so cast on read.
  const pi = (await vexPiRepo.findById(id)) as unknown as VexPi | null
  if (!pi) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  if ((pi as { voidedAt?: string | null }).voidedAt) {
    return NextResponse.json({ error: 'pi-voided', message: 'This PI is voided.' }, { status: 409 })
  }
  let body: { status?: unknown }
  try {
    body = (await request.json()) as { status?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const status = parseStatus(body.status)
  if (!status) {
    return NextResponse.json(
      { error: 'invalid-status', message: 'Unknown status value.' },
      { status: 400 },
    )
  }
  if (status === pi.status) {
    return NextResponse.json({ ok: true, status })
  }
  // Build the full VexPi record with the new status + audit append.
  // The drain's applyOneToList replaces by payload.id; we must pass
  // the full record, not a partial diff (Gate 5A.5 persistence fix).
  const auditEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    user: user.name,
    action: 'status_change',
    before: { status: pi.status },
    after: { status },
  }
  const nextPi: VexPi = {
    ...pi,
    status,
    auditLog: [...(pi.auditLog ?? []), auditEntry],
  }
  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexPi',
      operation: 'update',
      payload: nextPi as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to queue the transition. Retry.',
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, status })
}
