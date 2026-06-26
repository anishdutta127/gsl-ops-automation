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
import type {
  AuditEntry,
  VexDispatch,
  VexDispatchStatusV3,
  VexPi,
} from '@/lib/mouSystem/types'
import { vexDispatchRepo } from '@/lib/db/repos/leafRepos'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { rollUpVexPiStatus } from '@/lib/mouSystem/vexPiRollup'

const ALLOWED: VexDispatchStatusV3[] = [
  'Requested',
  'Request Raised to Warehouse',
  'Invoiced',
  'Shipped',
  'Delivered',
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
    (status === 'Request Raised to Warehouse' ||
      status === 'Shipped' ||
      status === 'Delivered') &&
    !canOps
  ) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message:
          'Only Ops can mark Request Raised to Warehouse, Shipped or Delivered.',
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
  const isNoOp = nextIdx === currentIdx

  // Apply the dispatch transition. Skip the write on a same-status re-post so
  // a retry after a failed PI roll-up below cannot duplicate the audit entry.
  if (!isNoOp) {
    // The Gate 5A.5 fix replaced the partial-diff payload (which left
    // payload.id undefined and was silently skipped by the drain) with the
    // full id-carrying record.
    const auditEntry: AuditEntry = {
      timestamp: now,
      user: user.name,
      action: 'status_change',
      before: { status: dispatch.status },
      after: { status },
      notes: warehouseEmailSent ? 'warehouse email button clicked' : undefined,
    }
    // ATOMIC PATTERN (Part 5.B Priority 1 part 2): partial-update on scalar
    // fields (status + warehouseEmail* + invoicedAt + delivered*) + atomic
    // JSONB || concat on audit_log via appendAudit. Two parallel operators no
    // longer race on audit_log.
    const patch: Partial<VexDispatch> = {
      status,
      warehouseEmailSentAt: warehouseEmailSent ? now : dispatch.warehouseEmailSentAt,
      warehouseEmailSentBy: warehouseEmailSent ? user.name : dispatch.warehouseEmailSentBy,
      invoicedAt: status === 'Invoiced' ? now : dispatch.invoicedAt,
      deliveredAt: status === 'Delivered' ? now : dispatch.deliveredAt,
      deliveredBy: status === 'Delivered' ? user.name : dispatch.deliveredBy,
    }
    try {
      await vexDispatchRepo.updateWithAudit(dispatch.id, patch, auditEntry, {
        queuedBy: user.id,
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
  }

  // PI status roll-up: once delivery progresses, advance the PI off "Delivery
  // Pending" without a manual nudge (the gap Pranav flagged on the VEX PI). The
  // dispatch set has this transition applied in-memory so the roll-up is
  // deterministic in both the postgres and json backends.
  let piStatus: VexPi['status'] | null = null
  try {
    const pi = (await vexPiRepo.findById(id)) as unknown as VexPi | null
    if (pi) {
      const dispatchSet = (await vexDispatchRepo.findAll()).map((d) =>
        d.id === dispatch.id ? { ...d, status } : d,
      )
      const target = rollUpVexPiStatus(pi, dispatchSet)
      if (target && target !== pi.status) {
        const piAudit: AuditEntry = {
          timestamp: now,
          user: user.name,
          action: 'status_change',
          before: { status: pi.status },
          after: { status: target },
          notes: `Auto roll-up from dispatch ${dispatch.id} marked ${status}.`,
        }
        await enqueueUpdate({
          queuedBy: user.id,
          entity: 'vexPi',
          operation: 'update',
          payload: {
            ...pi,
            status: target,
            auditLog: [...(pi.auditLog ?? []), piAudit],
          } as unknown as Record<string, unknown>,
        })
        piStatus = target
      }
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: 'pi-rollup-failed',
        message: `Dispatch saved as ${status}, but the PI status roll-up failed: ${
          e instanceof Error ? e.message : 'unknown error'
        }. Retry to finish.`,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, status, piStatus })
}
