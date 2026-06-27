/*
 * POST /api/operations/vex/pi/[id]/payment/[logId]
 *
 * Correct a recorded VEX payment. Finance / Admin only. JSON body with
 * `action`:
 *   - action='edit'  -> editVexPayment (amount/date/mode/reference); the VexPi
 *     balance moves by the delta and status is recomputed.
 *   - action='void'  -> voidVexPayment (soft-delete + reverse): drops the log
 *     id from the VexPi, decrements the balance, tombstones the log.
 *
 * Replaces the one-off over-count recovery scripts (VEXPI-UP-26-27-020,
 * Funscholar) with a permissioned + audited in-app action.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { editVexPayment, voidVexPayment } from '@/lib/vex/vexPaymentMutations'
import type { PaymentMode } from '@/lib/types'

interface RouteContext {
  params: Promise<{ id: string; logId: string }>
}

interface Body {
  action?: unknown
  amount?: unknown
  date?: unknown
  mode?: unknown
  reference?: unknown
  reason?: unknown
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id, logId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can correct VEX payments.' },
      { status: 403 },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const action = typeof body.action === 'string' ? body.action : ''

  if (action === 'edit') {
    const result = await editVexPayment({
      piId: id,
      logId,
      amount: Number(body.amount),
      date: typeof body.date === 'string' ? body.date : '',
      mode: body.mode as PaymentMode,
      reference: typeof body.reference === 'string' ? body.reference.trim() || null : null,
      recordedBy: user.id,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }
    revalidatePath(`/operations/vex/pi/${id}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'void') {
    const result = await voidVexPayment({
      piId: id,
      logId,
      reason: typeof body.reason === 'string' ? body.reason : '',
      recordedBy: user.id,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }
    revalidatePath(`/operations/vex/pi/${id}`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid-action' }, { status: 400 })
}
