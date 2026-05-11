/*
 * POST /api/operations/vex/pi/[id]/payment
 *
 * Record a payment receipt against a VEX PI. Finance / Admin only.
 * Phase 1 is a thin queue write that the drain runner reconciles
 * against the snapshot's payment-receipt logic. Excess-payment
 * detection (which gsl-mou-system raised as a "create an Adjustment
 * advance" warning) is deferred to Phase 1.1; the queue payload
 * carries the raw amounts and the drain runs the existing migrated
 * logic on apply.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { PaymentMode, VexPi } from '@/lib/mouSystem/types'
import vexPisJson from '@/data/vex_pis.json'

const allPis = vexPisJson as unknown as VexPi[]

const MODES: PaymentMode[] = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

interface IncomingPayload {
  date?: unknown
  bankAmount?: unknown
  tdsAmount?: unknown
  mode?: unknown
  reference?: unknown
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
      { error: 'forbidden', message: 'Only Finance can log VEX payments.' },
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
  const date = typeof body.date === 'string' ? body.date : ''
  const bankAmount = Number(body.bankAmount) || 0
  const tdsAmount = Number(body.tdsAmount) || 0
  const mode = MODES.includes(body.mode as PaymentMode)
    ? (body.mode as PaymentMode)
    : null
  const reference = typeof body.reference === 'string' ? body.reference.trim() : null
  if (!date) {
    return NextResponse.json(
      { error: 'missing-date', message: 'Payment date required.' },
      { status: 400 },
    )
  }
  const total = bankAmount + tdsAmount
  if (total <= 0) {
    return NextResponse.json(
      {
        error: 'invalid-amount',
        message: 'Bank or TDS amount must be positive.',
      },
      { status: 400 },
    )
  }
  if (!mode) {
    return NextResponse.json(
      { error: 'invalid-mode', message: 'Pick a payment mode.' },
      { status: 400 },
    )
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'paymentLog',
      operation: 'create',
      payload: {
        scope: 'vex',
        vexPiId: pi.id,
        date,
        bankAmount,
        tdsAmount,
        total,
        mode,
        reference,
        loggedBy: user.name,
        loggedAt: new Date().toISOString(),
      },
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to queue the payment. Retry.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
