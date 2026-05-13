/*
 * POST /api/finance/payment/bulk-import (Gate 5A.6 Step 3).
 *
 * Receives the reviewed-and-confirmed row payload from
 * /finance/payments/bulk. Per row:
 *
 *   1. dedupe on bank_ref: skip if a PaymentLog already carries the
 *      same reference (case-insensitive).
 *   2. if a paymentId is selected and the amount matches the
 *      instalment's expectedAmount exactly: call recordReceipt()
 *      (auto-match).
 *   3. else: enqueue a fresh PaymentLog row (parked for manual match).
 *
 * Returns { imported, matched, parked, skipped } counts.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { recordReceipt } from '@/lib/payment/recordReceipt'
import type {
  MOU,
  Payment,
  PaymentLog,
  School,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'

const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allLogs = paymentLogsJson as unknown as PaymentLog[]

interface IncomingRow {
  bankRef: string
  amount: number | null
  dateIso: string | null
  bankName: string
  schoolId: string
  mouId: string | null
  paymentId: string | null
  notes: string
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can bulk-import payments.' },
      { status: 403 },
    )
  }

  let body: { rows?: IncomingRow[] }
  try {
    body = (await request.json()) as { rows?: IncomingRow[] }
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'no-rows', message: 'No rows in the upload payload.' },
      { status: 400 },
    )
  }
  if (rows.length > 500) {
    return NextResponse.json(
      { error: 'too-many-rows', message: 'Hard cap is 500 rows per import.' },
      { status: 400 },
    )
  }

  const existingRefs = new Set(
    allLogs
      .map((l) => (l.reference ?? '').trim().toUpperCase())
      .filter((r) => r !== ''),
  )

  let matched = 0
  let parked = 0
  let skipped = 0

  for (const r of rows) {
    const bankRef = (r.bankRef ?? '').trim()
    if (!bankRef || !r.amount || !r.dateIso || !r.schoolId) {
      skipped += 1
      continue
    }
    if (existingRefs.has(bankRef.toUpperCase())) {
      skipped += 1
      continue
    }
    // Mark as seen so duplicates within this batch also skip.
    existingRefs.add(bankRef.toUpperCase())

    const school = allSchools.find((s) => s.id === r.schoolId)
    if (!school) {
      skipped += 1
      continue
    }

    // Auto-match branch: paymentId + amount equals expected.
    if (r.mouId && r.paymentId) {
      const payment = allPayments.find((p) => p.id === r.paymentId)
      const mou = allMous.find((m) => m.id === r.mouId)
      if (
        payment !== undefined
        && mou !== undefined
        && mou.schoolId === r.schoolId
        && Math.abs(payment.expectedAmount - r.amount) < 0.01
      ) {
        const result = await recordReceipt({
          paymentId: r.paymentId,
          receivedDate: r.dateIso,
          receivedAmount: r.amount,
          paymentMode: 'Bank Transfer',
          bankReference: bankRef,
          notes:
            (r.notes ? r.notes + ' | ' : '')
            + `Bank: ${r.bankName || '-'} (bulk-import)`,
          recordedBy: user.id,
        })
        if (result.ok) {
          matched += 1
          continue
        }
      }
    }

    // Park branch.
    const paymentLog: PaymentLog = {
      id: `PL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      date: r.dateIso,
      amount: r.amount,
      mode: 'Bank Transfer',
      reference: bankRef,
      narration:
        [r.bankName ? `bank=${r.bankName}` : '', r.notes].filter(Boolean).join(' | ')
        || null,
      salesPersonId: null,
      matchedInstallmentIds: [],
      unmatched: true,
      loggedBy: user.id,
      loggedAt: new Date().toISOString(),
      notes: `Bulk import. School: ${school.name}${r.mouId ? ` · suggested MOU ${r.mouId}` : ''}.`,
    }
    try {
      await enqueueUpdate({
        queuedBy: user.id,
        entity: 'paymentLog',
        operation: 'create',
        payload: paymentLog as unknown as Record<string, unknown>,
      })
      parked += 1
    } catch {
      skipped += 1
    }
  }

  return NextResponse.json({
    ok: true,
    imported: matched + parked,
    matched,
    parked,
    skipped,
  })
}
