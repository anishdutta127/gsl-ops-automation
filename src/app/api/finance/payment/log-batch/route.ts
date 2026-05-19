/*
 * POST /api/finance/payment/log-batch (Phase 4, 2026-05-19).
 *
 * Per-school batch payment entry. Body shape is JSON because the row
 * count is variable and we need typed arrays rather than the
 * positional name="rows[N].bankAmount" pattern.
 *
 * Body:
 *   {
 *     receivedDate: 'YYYY-MM-DD',
 *     paymentMode: PaymentMode,
 *     bankReference: string | null,
 *     notes: string | null,
 *     rows: Array<{ paymentId, bankAmount, tdsAmount }>
 *   }
 *
 * Calls `recordBatch` and returns the per-row outcomes as JSON so
 * the client form can surface the success / failure mix.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { recordBatch, type BatchRowInput } from '@/lib/payment/recordBatch'
import type { PaymentMode } from '@/lib/types'

const VALID_MODES: ReadonlyArray<PaymentMode> = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

function asPaymentMode(v: unknown): PaymentMode | null {
  if (typeof v !== 'string') return null
  if (v === 'DD') return 'Cheque'
  return VALID_MODES.includes(v as PaymentMode) ? (v as PaymentMode) : null
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function asRows(v: unknown): BatchRowInput[] | null {
  if (!Array.isArray(v)) return null
  const out: BatchRowInput[] = []
  for (const item of v) {
    if (item === null || typeof item !== 'object') return null
    const obj = item as Record<string, unknown>
    const paymentId = asNonEmptyString(obj.paymentId)
    if (!paymentId) return null
    const bank = Number(obj.bankAmount ?? 0)
    const tds = Number(obj.tdsAmount ?? 0)
    if (!Number.isFinite(bank) || !Number.isFinite(tds)) return null
    if (bank < 0 || tds < 0) return null
    out.push({ paymentId, bankAmount: bank, tdsAmount: tds })
  }
  return out
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const receivedDate = asNonEmptyString(body.receivedDate)
  if (!receivedDate || !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
    return NextResponse.json({ error: 'invalid-date' }, { status: 400 })
  }
  const paymentMode = asPaymentMode(body.paymentMode)
  if (!paymentMode) {
    return NextResponse.json({ error: 'invalid-mode' }, { status: 400 })
  }
  const bankReference = asNonEmptyString(body.bankReference)
  const notes = asNonEmptyString(body.notes)
  const rows = asRows(body.rows)
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'invalid-rows' }, { status: 400 })
  }

  const result = await recordBatch({
    rows,
    receivedDate,
    paymentMode,
    bankReference,
    notes,
    recordedBy: user.id,
  })

  return NextResponse.json({
    okCount: result.okCount,
    failCount: result.failCount,
    outcomes: result.outcomes,
    totalBankAmount: result.totalBankAmount,
    totalTdsAmount: result.totalTdsAmount,
  })
}
