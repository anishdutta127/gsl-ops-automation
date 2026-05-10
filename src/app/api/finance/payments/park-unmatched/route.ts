/*
 * POST /api/finance/payments/park-unmatched (Gate 2 Step 6).
 *
 * JSON body: date, amount, mode, reference, narration. Calls
 * parkUnmatched lib; returns JSON { ok, paymentLogId } on success or
 * { error } on failure.
 *
 * Permission: canEditFinanceData (Finance + cross-functional Admin).
 */

import { NextResponse } from 'next/server'
import { parkUnmatched } from '@/lib/finance/parkUnmatched'
import { getCurrentSession } from '@/lib/auth/session'
import type { PaymentMode } from '@/lib/types'

interface RequestBody {
  date?: string
  amount?: number
  mode?: PaymentMode
  reference?: string | null
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

  if (!body.date || body.amount === undefined || !body.mode) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 })
  }

  const result = await parkUnmatched({
    date: body.date,
    amount: body.amount,
    mode: body.mode,
    reference: body.reference ?? null,
    narration: body.narration ?? null,
    loggedBy: session.sub,
  })

  if (!result.ok) {
    const status = result.reason === 'permission' ? 403 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }

  return NextResponse.json({ ok: true, paymentLogId: result.paymentLog.id })
}
