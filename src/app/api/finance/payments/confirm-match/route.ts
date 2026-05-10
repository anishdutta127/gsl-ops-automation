/*
 * POST /api/finance/payments/confirm-match (Gate 2 Step 6).
 *
 * JSON body: paymentId, receivedDate, receivedAmount, paymentMode,
 * bankReference, narration. Calls confirmMatch lib; returns JSON
 * { ok, paymentId, hasVariance, varianceRs } on success or
 * { error } on failure.
 *
 * Permission: canEditFinanceData (Finance + cross-functional Admin).
 */

import { NextResponse } from 'next/server'
import { confirmMatch } from '@/lib/finance/confirmMatch'
import { getCurrentSession } from '@/lib/auth/session'
import type { PaymentMode } from '@/lib/types'

interface RequestBody {
  paymentId?: string
  receivedDate?: string
  receivedAmount?: number
  paymentMode?: PaymentMode
  bankReference?: string | null
  narration?: string | null
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }

  if (!body.paymentId || !body.receivedDate || body.receivedAmount === undefined || !body.paymentMode) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 })
  }

  const result = await confirmMatch({
    paymentId: body.paymentId,
    receivedDate: body.receivedDate,
    receivedAmount: body.receivedAmount,
    paymentMode: body.paymentMode,
    bankReference: body.bankReference ?? null,
    narration: body.narration ?? null,
    recordedBy: session.sub,
  })

  if (!result.ok) {
    const status = result.reason === 'permission' ? 403 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }

  return NextResponse.json({
    ok: true,
    paymentId: result.payment.id,
    hasVariance: result.hasVariance,
    varianceRs: result.varianceRs,
    paymentLogId: result.paymentLog.id,
  })
}
