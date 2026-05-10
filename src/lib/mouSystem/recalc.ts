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

// ----------------------------------------------------------------------------
// Adjustment-as-line-item write path (Phase 3 Round 2)

export interface ExistingInstallment {
  id: string
  seq: number
  pctDue: number
  /** What is currently stored on the installment. */
  expectedAmount: number
  /** Sum of all paid amounts against this installment (partial + full). */
  paidAmount: number
  /** Round 3: optional pre-computed new expected for this installment.
   *  When provided, the engine uses it directly instead of multiplying
   *  perStudentPrice * newStudents * pctDue/100. This is how per-year
   *  pricing (and multi-year MOUs) plug into the same lock/adjustment
   *  pipeline without forking the engine. */
  freshExpectedAmount?: number
}

export interface InstallmentUpdate {
  installmentId: string
  /** New expectedAmount to persist. */
  newExpectedAmount: number
  /** Old expectedAmount, for the audit trail. */
  oldExpectedAmount: number
}

export interface PendingAdjustment {
  /** The originating installment whose economics no longer match actuals. */
  originalInstallmentId: string
  /** The next unpaid installment this credit/charge attaches to. */
  appliedToInstallmentId: string | null
  /** Signed delta. Negative = credit to school. Positive = additional charge. */
  amountDelta: number
  beforeAmount: number
  afterAmount: number
  reason: string
}

export interface RecalcWriteResult {
  /** Installments whose expectedAmount should change (unpaid, no PI sent). */
  updates: InstallmentUpdate[]
  /** Adjustment records to create (for paid or PI-sent installments). */
  adjustments: PendingAdjustment[]
}

/**
 * Decide which installments get rewritten and which generate adjustment
 * records, given a new actual student count.
 *
 * Lock criterion: an installment is "locked" once any payment has been
 * received against it OR a PI has been sent. Locked installments
 * preserve their original expectedAmount and contribute an Adjustment
 * record. Unlocked installments are rewritten in place.
 *
 * Adjustments are attached to the next unlocked installment in sequence.
 * If none exists (last installment is already locked), the adjustment is
 * marked floating (appliedToInstallmentId = null) and surfaced
 * separately at the school level.
 */
export function computeRecalcWithAdjustments(args: {
  perStudentPrice: number
  newStudents: number
  installments: Array<ExistingInstallment & { piSentDate?: string | null }>
  reason: string
}): RecalcWriteResult {
  const { perStudentPrice, newStudents, installments, reason } = args
  const sorted = installments.slice().sort((a, b) => a.seq - b.seq)
  const locked = (i: ExistingInstallment & { piSentDate?: string | null }) =>
    i.paidAmount > 0 || Boolean(i.piSentDate)

  const newExpectedById = new Map<string, number>()
  for (const inst of sorted) {
    const fresh =
      inst.freshExpectedAmount !== undefined
        ? round2(inst.freshExpectedAmount)
        : round2((perStudentPrice * newStudents * inst.pctDue) / 100)
    newExpectedById.set(inst.id, fresh)
  }

  const updates: InstallmentUpdate[] = []
  const adjustments: PendingAdjustment[] = []

  for (const inst of sorted) {
    const fresh = newExpectedById.get(inst.id) ?? inst.expectedAmount
    if (Math.abs(fresh - inst.expectedAmount) <= 0.01) {
      // No change for this installment.
      continue
    }
    if (!locked(inst)) {
      // Unlocked: rewrite in place.
      updates.push({
        installmentId: inst.id,
        newExpectedAmount: fresh,
        oldExpectedAmount: inst.expectedAmount,
      })
      continue
    }
    // Locked: preserve original, create adjustment for the next unlocked.
    const target = sorted.find((x) => x.seq > inst.seq && !locked(x))
    const delta = round2(fresh - inst.expectedAmount)
    adjustments.push({
      originalInstallmentId: inst.id,
      appliedToInstallmentId: target ? target.id : null,
      amountDelta: delta,
      beforeAmount: inst.expectedAmount,
      afterAmount: fresh,
      reason,
    })
  }

  return { updates, adjustments }
}
