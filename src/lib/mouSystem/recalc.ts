/*
 * Dynamic payment-schedule recalc engine.
 *
 * Phase 3 Round 2 architecture: adjustment-as-line-item.
 *
 * Round 1 Pranav scenario (500 students, Rs 1000/student incl GST, 4 ×
 * 25%):
 *
 *   At MOU sign: 4 PIs of Rs 1,25,000 (500 × 1000 × 25%).
 *   Drop to 450 BEFORE any payment: every PI is replaced; the originals
 *     hadn't been issued in any binding sense yet, so the four PIs are
 *     simply rewritten to Rs 1,12,500 each.
 *   Pay Inst 1 Rs 1,12,500.
 *   Drop to 400 AFTER Inst 1 paid:
 *     Inst 1 PI stays at Rs 1,12,500 (issued and paid; preserved).
 *     A new Adjustment record is created for the (Rs 12,500) excess and
 *     applied to Inst 2.
 *     Inst 2 expected drops to Rs 1,00,000; Inst 2 net due = Rs 87,500
 *     (Rs 1,00,000 − Rs 12,500 credit).
 *     Inst 3, Inst 4 = Rs 1,00,000 each.
 *
 * The legacy `recalculatePaymentSchedule` function below stays around
 * because the MOU-detail "Recalc engine" preview card uses it; that
 * card is read-only and only shows what the schedule WOULD be if every
 * paid amount was re-allocated. The write path uses
 * `computeRecalcWithAdjustments` instead.
 *
 * All functions are pure: same inputs → same outputs, no data writes.
 * Callers persist via the entityWriters helpers.
 */

export interface RecalcInput {
  /** Price per student, GST-inclusive in Pranav's example. */
  perStudentPrice: number
  /** Current actual student count. Falls back to committed if no actual yet. */
  currentStudents: number
  /** Percent due per instalment, in seq order. e.g. [25, 25, 25, 25]. Must sum to 100. */
  pcts: number[]
  /** Total amount already paid against each instalment in seq order. */
  paymentsByInstalment: number[]
}

export interface RecalcInstalment {
  /** 1-based seq. */
  seq: number
  pctDue: number
  /** newExpected = currentStudents * perStudentPrice * pctDue / 100, rounded to 2dp. */
  newExpected: number
  /** Allocated portion of cumulative paid. */
  paidApplied: number
  /** newExpected − paidApplied (>= 0). */
  balance: number
  status: 'Paid' | 'Partial' | 'Pending'
}

export interface RecalcResult {
  instalments: RecalcInstalment[]
  totalDue: number
  totalPaid: number
  /** Paid in excess of the entire schedule, if any (unused credit). */
  surplusCredit: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function recalculatePaymentSchedule(input: RecalcInput): RecalcResult {
  const { perStudentPrice, currentStudents, pcts, paymentsByInstalment } = input
  if (pcts.length === 0) {
    return { instalments: [], totalDue: 0, totalPaid: 0, surplusCredit: 0 }
  }

  const totalPaid = paymentsByInstalment.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)
  let remainingPaid = totalPaid

  const instalments: RecalcInstalment[] = pcts.map((pct, i) => {
    const newExpected = round2((perStudentPrice * currentStudents * pct) / 100)
    const paidApplied = Math.min(newExpected, Math.max(0, remainingPaid))
    remainingPaid = round2(remainingPaid - paidApplied)
    const balance = round2(newExpected - paidApplied)
    let status: RecalcInstalment['status']
    if (balance <= 0.01) status = 'Paid'
    else if (paidApplied > 0.01) status = 'Partial'
    else status = 'Pending'
    return {
      seq: i + 1,
      pctDue: pct,
      newExpected,
      paidApplied: round2(paidApplied),
      balance,
      status,
    }
  })

  const totalDue = round2(instalments.reduce((s, x) => s + x.newExpected, 0))
  return {
    instalments,
    totalDue,
    totalPaid: round2(totalPaid),
    surplusCredit: round2(remainingPaid),
  }
}

// Phase 6D Part 4: `computeRecalcWithAdjustments` retired. The
// schedule-edit override path now routes through
// `recalcInstallments` in `src/lib/mou/studentCountRecalc.ts`, which
// uses the spread-by-weight algorithm matching Pranav's stated model
// ("adjustments will be made in the next PIs"). See
// RECALC_UNIFICATION_TRACE.md for the migration rationale + tests.
// The `recalculatePaymentSchedule` preview helper above stays around
// because the MOU detail card uses it read-only.
