/*
 * POST /api/dispatch-requests/[requestId]/approve (W4-D.3).
 *
 * Form target for the detail-page approve action. Reads optional
 * lineItemsOverride (JSON) + notes; calls reviewRequest.approveRequest;
 * redirects to the detail page with ?ok=approved or ?error=<reason>.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { approveRequest } from '@/lib/dispatch/reviewRequest'
import type { DispatchLineItem } from '@/lib/types'

function parseLineItemsOverride(raw: string): DispatchLineItem[] | null {
  if (raw.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const out: DispatchLineItem[] = []
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') return null
    const obj = item as Record<string, unknown>
    if (obj.kind === 'flat') {
      const skuName = typeof obj.skuName === 'string' ? obj.skuName : ''
      const quantity = Number(obj.quantity)
      if (skuName === '' || !Number.isFinite(quantity) || quantity <= 0) return null
      out.push({ kind: 'flat', skuName, quantity })
    } else if (obj.kind === 'per-grade') {
      const skuName = typeof obj.skuName === 'string' ? obj.skuName : ''
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
  return out.length === 0 ? null : out
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params
  const detailUrl = new URL(`/admin/dispatch-requests/${requestId}`, request.url)

  const session = await getCurrentSession()
  if (!session) {
    detailUrl.searchParams.set('error', 'unknown-user')
    return NextResponse.redirect(detailUrl, { status: 303 })
  }

  const form = await request.formData()
  const overrideRaw = String(form.get('lineItemsOverride') ?? '')
  const notes = String(form.get('notes') ?? '').trim()

  let override: DispatchLineItem[] | undefined
  if (overrideRaw.trim() !== '') {
    const parsed = parseLineItemsOverride(overrideRaw)
    if (parsed === null) {
      detailUrl.searchParams.set('error', 'invalid-line-items')
      return NextResponse.redirect(detailUrl, { status: 303 })
    }
    override = parsed
  }

  const result = await approveRequest({
    requestId,
    reviewedBy: session.sub,
    lineItemsOverride: override,
    notes: notes === '' ? null : notes,
  })

  if (!result.ok) {
    detailUrl.searchParams.set('error', result.reason)
    return NextResponse.redirect(detailUrl, { status: 303 })
  }

  detailUrl.searchParams.set('ok', 'approved')
  return NextResponse.redirect(detailUrl, { status: 303 })
}
