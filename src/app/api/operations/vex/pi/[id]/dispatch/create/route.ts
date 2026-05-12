/*
 * POST /api/operations/vex/pi/[id]/dispatch/create
 *
 * Create a new VEX dispatch. Ops (canRaiseDispatch) + Admin. The
 * vexDispatchGate from src/lib/mouSystem/vexDispatchGate.ts is the
 * authoritative gate; preserved verbatim. Gate violations surface
 * as 400 with a friendly error message that the UI shows as a
 * toast.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { checkVexDispatchGate } from '@/lib/mouSystem/vexDispatchGate'
import { company } from '@/lib/mouSystem/company'
import type {
  AuditEntry,
  VexDispatch,
  VexDispatchItem,
  VexDispatchMode,
  VexPi,
} from '@/lib/mouSystem/types'
import vexPisJson from '@/data/vex_pis.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'

const allPis = vexPisJson as unknown as VexPi[]
const allDispatches = vexDispatchesJson as unknown as VexDispatch[]

interface IncomingItem {
  partNumber?: unknown
  qty?: unknown
}

interface IncomingPayload {
  items?: unknown
  freight?: unknown
  mode?: unknown
}

function parseItems(raw: unknown): VexDispatchItem[] | null {
  if (!Array.isArray(raw)) return null
  const out: VexDispatchItem[] = []
  for (const item of raw) {
    if (item == null || typeof item !== 'object') return null
    const obj = item as IncomingItem
    const partNumber =
      typeof obj.partNumber === 'string' ? obj.partNumber.trim() : ''
    const qty = Number(obj.qty)
    if (!partNumber || !Number.isFinite(qty) || qty <= 0) return null
    out.push({ partNumber, qty })
  }
  return out.length > 0 ? out : null
}

function nextDispatchSeq(pi: VexPi, existing: VexDispatch[]): number {
  const prefix = `VEXD-${pi.entityKey}-${company.fiscalYear}-`
  let highest = 0
  for (const d of existing) {
    if (!d.id.startsWith(prefix)) continue
    const tail = d.id.slice(prefix.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return highest + 1
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
  if (!canRaiseDispatch(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Ops can raise a VEX dispatch.' },
      { status: 403 },
    )
  }
  const pi = allPis.find((p) => p.id === id)
  if (!pi) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  let body: IncomingPayload
  try {
    body = (await request.json()) as IncomingPayload
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const items = parseItems(body.items)
  if (!items) {
    return NextResponse.json(
      {
        error: 'invalid-items',
        message: 'Enter a positive dispatch quantity for at least one product.',
      },
      { status: 400 },
    )
  }
  const freight = Number(body.freight)
  if (!Number.isFinite(freight) || freight < 0) {
    return NextResponse.json(
      { error: 'invalid-freight', message: 'Freight must be a non-negative number.' },
      { status: 400 },
    )
  }
  const mode: VexDispatchMode | null =
    body.mode === 'Air' || body.mode === 'Surface' ? body.mode : null
  if (!mode) {
    return NextResponse.json(
      { error: 'invalid-mode', message: 'Pick Air or Surface.' },
      { status: 400 },
    )
  }

  // Compute already-dispatched per-SKU + value from the canonical store.
  const piDispatches = allDispatches.filter((d) => d.piId === pi.id)
  const dispatchedByPart = new Map<string, number>()
  let alreadyDispatchedValue = 0
  for (const d of piDispatches) {
    for (const it of d.items) {
      dispatchedByPart.set(
        it.partNumber,
        (dispatchedByPart.get(it.partNumber) ?? 0) + it.qty,
      )
      const li = pi.lineItems.find((l) => l.partNumber === it.partNumber)
      if (li) alreadyDispatchedValue += li.unitPrice * it.qty
    }
  }

  // Build the gate input with per-row pendingQty + unitPrice.
  const proposed = items.map((it) => {
    const li = pi.lineItems.find((l) => l.partNumber === it.partNumber)
    if (!li) {
      return {
        partNumber: it.partNumber,
        qty: it.qty,
        unitPriceRs: 0,
        pendingQty: 0,
      }
    }
    const sent = dispatchedByPart.get(it.partNumber) ?? 0
    return {
      partNumber: it.partNumber,
      qty: it.qty,
      unitPriceRs: li.unitPrice,
      pendingQty: li.quantity - sent,
    }
  })
  // Catch the case where the user requested a part not on the PI.
  const unknownPart = proposed.find((p) => p.unitPriceRs === 0 && p.pendingQty === 0)
  if (unknownPart) {
    return NextResponse.json(
      {
        error: 'unknown-part',
        message: `${unknownPart.partNumber}: not a line item on this PI.`,
      },
      { status: 400 },
    )
  }

  const gateError = checkVexDispatchGate({
    paymentReceivedRs: pi.paymentReceivedAmount,
    alreadyDispatchedValueRs: alreadyDispatchedValue,
    proposedItems: proposed,
  })
  if (gateError) {
    return NextResponse.json(
      { error: 'gate-violation', message: gateError },
      { status: 400 },
    )
  }

  const seq = nextDispatchSeq(pi, allDispatches)
  const now = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'create',
  }
  const dispatch: VexDispatch = {
    id: `VEXD-${pi.entityKey}-${company.fiscalYear}-${String(seq).padStart(3, '0')}`,
    piId: pi.id,
    items,
    freight,
    mode,
    status: 'Requested',
    requestedBy: user.name,
    requestedAt: now,
    taxInvoiceNumber: null,
    taxInvoicePath: null,
    invoicedAt: null,
    notes: null,
    supportingDocPath: null,
    warehouseEmailSentAt: null,
    warehouseEmailSentBy: null,
    auditLog: [audit],
  }

  try {
    // Pass the full VexDispatch record (id-carrying) so the drain's
    // applyOneToList matches on payload.id. Wrapping inside
    // { vexDispatch: dispatch } left payload.id undefined and the
    // drain silently skipped (Gate 5A.5 persistence fix).
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexDispatch',
      operation: 'create',
      payload: dispatch as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error ? e.message : 'Failed to queue the dispatch. Retry.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ dispatch: { id: dispatch.id } })
}
