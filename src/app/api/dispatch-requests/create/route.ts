/*
 * POST /api/dispatch-requests/create (W4-D.2).
 *
 * Receives a JSON payload from the Sales-side form, calls createRequest,
 * returns { ok, requestId, warnings } on success or { ok: false, reason }
 * on failure. The form Component renders the response inline; no
 * server-side redirect on the success path.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { createRequest } from '@/lib/dispatch/createRequest'
import type { DispatchLineItem } from '@/lib/types'

interface IncomingPayload {
  mouId?: unknown
  installmentSeq?: unknown
  requestReason?: unknown
  lineItems?: unknown
  notes?: unknown
}

function parseLineItems(raw: unknown): DispatchLineItem[] | null {
  if (!Array.isArray(raw)) return null
  const out: DispatchLineItem[] = []
  for (const item of raw) {
    if (item == null || typeof item !== 'object') return null
    const obj = item as Record<string, unknown>
    if (obj.kind === 'flat') {
      const skuName = typeof obj.skuName === 'string' ? obj.skuName.trim() : ''
      const quantity = Number(obj.quantity)
      if (skuName === '' || !Number.isFinite(quantity) || quantity <= 0) return null
      out.push({ kind: 'flat', skuName, quantity })
    } else if (obj.kind === 'per-grade') {
      const skuName = typeof obj.skuName === 'string' ? obj.skuName.trim() : ''
      const allocsRaw = obj.gradeAllocations
      if (skuName === '' || !Array.isArray(allocsRaw)) return null
      const allocations: { grade: number; quantity: number }[] = []
      for (const a of allocsRaw) {
        if (a == null || typeof a !== 'object') return null
        const ar = a as Record<string, unknown>
        const grade = Number(ar.grade)
        const quantity = Number(ar.quantity)
        if (!Number.isInteger(grade) || grade < 1 || grade > 12) return null
        if (!Number.isFinite(quantity) || quantity <= 0) return null
        allocations.push({ grade, quantity })
      }
      if (allocations.length === 0) return null
      out.push({ kind: 'per-grade', skuName, gradeAllocations: allocations })
    } else {
      return null
    }
  }
  return out
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'unknown-user' }, { status: 401 })
  }

  let body: IncomingPayload
  try {
    body = (await request.json()) as IncomingPayload
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid-json' }, { status: 400 })
  }

  const mouId = typeof body.mouId === 'string' ? body.mouId : ''
  const installmentSeq = Number(body.installmentSeq)
  const requestReason = typeof body.requestReason === 'string' ? body.requestReason : ''
  const notes = typeof body.notes === 'string' ? body.notes : null
  const lineItems = parseLineItems(body.lineItems)

  if (lineItems === null) {
    return NextResponse.json({ ok: false, reason: 'invalid-line-items' }, { status: 400 })
  }

  const result = await createRequest({
    mouId,
    installmentSeq,
    requestReason,
    lineItems,
    notes,
    requestedBy: session.sub,
  })

  if (!result.ok) {
    const status = result.reason === 'permission' ? 403
      : result.reason === 'unknown-user' ? 401
      : 400
    return NextResponse.json({ ok: false, reason: result.reason }, { status })
  }

  return NextResponse.json({
    ok: true,
    requestId: result.request.id,
    warnings: result.warnings,
  })
}
