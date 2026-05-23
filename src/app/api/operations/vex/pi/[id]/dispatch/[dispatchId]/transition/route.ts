/*
 * POST /api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition
 *
 * Advance a VexDispatch through its lifecycle:
 *   Requested -> Request Raised to Warehouse -> Invoiced -> Shipped
 *
 * Ops (canRaiseDispatch) can drive most transitions; Finance (canEditFinanceData)
 * is allowed to mark Invoiced since the tax invoice is a Finance artefact.
 * Both roles share Admin's null-department wildcard.
 *
 * The body may include `warehouseEmailSent: true` to stamp the
 * warehouse-email-sent metadata when the Email warehouse button
 * fires.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData, canRaiseDispatch } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type {
  AuditEntry,
  VexDispatch,
  VexDispatchStatusV3,
} from '@/lib/mouSystem/types'
import { vexDispatchRepo } from '@/lib/db/repos/leafRepos'

const ALLOWED: VexDispatchStatusV3[] = [
  'Requested',
  'Request Raised to Warehouse',
  'Invoiced',
  'Shipped',
]

function parseStatus(v: unknown): VexDispatchStatusV3 | null {
  return typeof v === 'string' && (ALLOWED as string[]).includes(v)
    ? (v as VexDispatchStatusV3)
    : null
}

interface RouteContext {
  params: Promise<{ id: string; dispatchId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id, dispatchId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  // Either Ops or Finance can transition (gate which transition below).
  const canOps = canRaiseDispatch(user)
  const canFin = canEditFinanceData(user)
  if (!canOps && !canFin) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Only Ops or Finance can transition a VEX dispatch.',
      },
      { status: 403 },
    )
  }

  const dispatch = (await vexDispatchRepo.findById(dispatchId)) as VexDispatch | null
  if (!dispatch || dispatch.piId !== id) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  let body: { status?: unknown; warehouseEmailSent?: unknown }
  try {
    body = (await request.json()) as {
      status?: unknown
      warehouseEmailSent?: unknown
    }
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

  // Role-gated specific transitions.
  if (status === 'Invoiced' && !canFin) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Only Finance can mark a dispatch Invoiced.',
      },
      { status: 403 },
    )
  }
  if (
    (status === 'Request Raised to Warehouse' || status === 'Shipped') &&
    !canOps
  ) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message:
          'Only Ops can mark Request Raised to Warehouse or Shipped.',
      },
      { status: 403 },
    )
  }

  // Forward-only transitions (no rewinds in Phase 1).
  const currentIdx = ALLOWED.indexOf(dispatch.status)
  const nextIdx = ALLOWED.indexOf(status)
  if (nextIdx < currentIdx) {
    return NextResponse.json(
      {
        error: 'invalid-transition',
        message: `Cannot move backwards from ${dispatch.status} to ${status}.`,
      },
      { status: 400 },
    )
  }

  const warehouseEmailSent = body.warehouseEmailSent === true
  const now = new Date().toISOString()

  // Build the full VexDispatch record with the new status + metadata
  // + audit entry. The Gate 5A.5 fix replaced the partial-diff payload
  // (which left payload.id undefined and was silently skipped by the
  // drain) with the full id-carrying record.
  const auditEntry: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'status_change',
    before: { status: dispatch.status },
    after: { status },
    notes: warehouseEmailSent ? 'warehouse email button clicked' : undefined,
  }
  const nextDispatch: VexDispatch = {
    ...dispatch,
    status,
    warehouseEmailSentAt: warehouseEmailSent ? now : dispatch.warehouseEmailSentAt,
    warehouseEmailSentBy: warehouseEmailSent ? user.name : dispatch.warehouseEmailSentBy,
    invoicedAt: status === 'Invoiced' ? now : dispatch.invoicedAt,
    auditLog: [...(dispatch.auditLog ?? []), auditEntry],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexDispatch',
      operation: 'update',
      payload: nextDispatch as unknown as Record<string, unknown>,
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
