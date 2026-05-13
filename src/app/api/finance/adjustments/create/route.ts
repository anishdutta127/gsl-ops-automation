/*
 * POST /api/finance/adjustments/create (Gate 5A.6 Step 5).
 *
 * Form target for /finance/adjustments/new. Creates a manual
 * Adjustment row tied to a specific instalment.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { createAdjustment } from '@/lib/adjustments/createAdjustment'
import type { AdjustmentTrigger } from '@/lib/types'

const VALID_TRIGGERS: ReadonlyArray<AdjustmentTrigger> = [
  'actuals_update',
  'installment_plan_change',
  'manual',
  'vex_overpayment',
]

const ADJUSTMENT_TYPE_TO_TRIGGER: Record<string, AdjustmentTrigger> = {
  'student-count': 'actuals_update',
  'fee-revision': 'manual',
  discount: 'manual',
  refund: 'manual',
  other: 'manual',
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/finance/adjustments/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '').trim()
  const installmentId = String(form.get('installmentId') ?? '').trim()
  const adjustmentTypeRaw = String(form.get('adjustmentType') ?? '').trim()
  const amountRaw = String(form.get('amount') ?? '').trim()
  const reason = String(form.get('reason') ?? '').trim()
  const effectiveDateRaw = String(form.get('effectiveDate') ?? '').trim()
  const notesRaw = String(form.get('notes') ?? '').trim()

  const redirectTo = (params: Record<string, string>) => {
    const url = new URL('/finance/adjustments/new', request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (mouId) url.searchParams.set('mouId', mouId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return redirectTo({ error: 'missing-mou' })
  if (!installmentId) return redirectTo({ error: 'missing-installment' })

  const amountDelta = Number(amountRaw)
  if (!Number.isFinite(amountDelta) || amountDelta === 0) {
    return redirectTo({ error: 'invalid-amount' })
  }

  const triggeredByEvent = ADJUSTMENT_TYPE_TO_TRIGGER[adjustmentTypeRaw] ?? null
  if (triggeredByEvent === null || !VALID_TRIGGERS.includes(triggeredByEvent)) {
    return redirectTo({ error: 'invalid-type' })
  }

  const result = await createAdjustment({
    mouId,
    installmentId,
    triggeredByEvent,
    amountDelta,
    reason,
    effectiveDate: effectiveDateRaw === '' ? null : effectiveDateRaw,
    notes: notesRaw === '' ? null : notesRaw,
    recordedBy: session.sub,
  })

  if (!result.ok) {
    return redirectTo({ error: result.reason })
  }

  // Redirect to the adjustments list with a success flash.
  const url = new URL('/finance/adjustments', request.url)
  url.searchParams.set('created', result.adjustment.id)
  return NextResponse.redirect(url, { status: 303 })
}
