/*
 * Phase 6C PI backfill matcher tests.
 */

import { describe, expect, it } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import payments from '@/data/payments.json'
import mous from '@/data/mous.json'
import importJson from '@/data/imports/fy-2025-26-import.json'
import type { ImportFile } from './fy2526Import'
import { buildBackfillPlan } from './piBackfill'

const allPayments = payments as unknown as Payment[]
const allMous = mous as unknown as MOU[]
const importFile = importJson as unknown as ImportFile

describe('buildBackfillPlan (production data)', () => {
  it('produces a sensible split of auto-matched, needs-review, impossible across the ~126 unmatched-paid rows', () => {
    const plan = buildBackfillPlan({
      payments: allPayments,
      mous: allMous,
      importRecords: importFile.records,
    })
    const total =
      plan.totals.autoMatched +
      plan.totals.needsReview +
      plan.totals.impossible
    // Sanity: the matcher addresses every paid-no-PI row in payments.json.
    const paidNoPi = allPayments.filter(
      (p) => (p.receivedAmount ?? 0) > 0 && (!p.piNumber || String(p.piNumber).trim() === ''),
    ).length
    expect(total).toBe(paidNoPi)
    // Phase 6C cutover audit found ~126 such rows.
    expect(total).toBeGreaterThan(100)
    expect(total).toBeLessThan(200)
  })

  it('returns at least some auto-matches against the production data', () => {
    const plan = buildBackfillPlan({
      payments: allPayments,
      mous: allMous,
      importRecords: importFile.records,
    })
    expect(plan.totals.autoMatched).toBeGreaterThan(0)
  })

  it('flags impossible candidates with a non-empty reason string', () => {
    const plan = buildBackfillPlan({
      payments: allPayments,
      mous: allMous,
      importRecords: importFile.records,
    })
    for (const r of plan.rows) {
      if (r.kind === 'impossible') {
        expect(r.reason.length).toBeGreaterThan(0)
      }
    }
  })

  it('amount tolerance: Rs 5 diff matches, Rs 20 diff does not', () => {
    const matchingPayment = {
      id: 'P1', mouId: 'MOU-STEAM-2526-X', schoolName: 'Test School',
      receivedAmount: 50005, piNumber: null,
    } as Payment
    const tooFarPayment = {
      id: 'P2', mouId: 'MOU-STEAM-2526-X', schoolName: 'Test School',
      receivedAmount: 50020, piNumber: null,
    } as Payment
    const plan = buildBackfillPlan({
      payments: [matchingPayment, tooFarPayment],
      mous: [],
      importRecords: [
        {
          srNo: 1, schoolName: 'Test School', city: 'X', state: 'Y',
          studentsMou: 100, studentsActual: 100, spPerStudentWithoutTax: 0,
          spPerStudentWithTax: 0, salesAmountWithTax: 100000,
          amountReceived: 50000, tdsAmount: 0, balanceOutstanding: 50000,
          amtRecdIn2627: null, tds2627: null, pctReceivedOverall: 0.5,
          salesRep: null, schoolCount: 1, mouStatusText: '', kitsSent: 'NO',
          duration: '', ownerName: null,
          piNotRaisedPaymentReceived: 0, piRaisedPaymentReceived: 0,
          piRaisedPaymentNotReceived: 0, piNotRaisedPaymentNotReceived: 0,
          instalments: [
            { instalmentNo: 1, pctShare: 0.5, amount: 50000, month: null, paymentReceived: 'Yes' },
          ],
        },
      ],
    })
    const a = plan.rows.find((r) => r.payment.id === 'P1')
    const b = plan.rows.find((r) => r.payment.id === 'P2')
    expect(a?.kind).toBe('auto-matched')
    expect(b?.kind).toBe('impossible')
  })
})
