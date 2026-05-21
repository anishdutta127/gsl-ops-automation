/*
 * Student-count recalculation engine.
 *
 * Phase 6A (2026-05-20) revision per Pranav review #2: the algorithm
 * changes from FRONT-LOAD-ON-NEXT-UNPAID to SPREAD-BY-WEIGHT.
 *
 * When the operator changes the student count on an MOU that already
 * has paid (locked) instalments, the remaining contract value (the new
 * total minus the sum of locked receipts) is redistributed across the
 * unpaid instalments in proportion to their `percentShare`. Locked
 * rows keep their immutable `receivedAmount` as `netDue`; unpaid rows
 * each absorb a small adjustment (positive or negative) reflecting the
 * difference between their nominal share at the new count and their
 * actual allocated net due.
 *
 * Example (Pranav's reproduction, MOU-STEAM-2627-001):
 *   contract Rs 4,00,000 at 500 students × Rs 800/student
 *   instalments 10 / 30 / 30 / 30 (40,000 / 1,20,000 × 3)
 *   i1 paid Rs 40,000 (locked)
 *   count drops to 450
 *     new contract = 450 × 800 = 3,60,000
 *     remaining = 3,60,000 - 40,000 = 3,20,000
 *     i2 / i3 / i4 each = 3,20,000 × 30 / 90 = 1,06,666.67
 *
 * The prior FRONT-LOAD algorithm would have dumped the entire delta on
 * i2 only (i2 = 1,04,000, i3 = i4 = 1,08,000). Pranav's reframed
 * mental model in May spreads the carry by share weight so no single
 * PI absorbs the variance disproportionately.
 *
 * The legacy `src/lib/mouSystem/recalc.ts:computeRecalcWithAdjustments`
 * keeps its FRONT-LOAD-as-Adjustment-entity semantics for the
 * schedule-edit override path. See RECALC_ENGINE_TRACE.md for why the
 * two engines now intentionally differ.
 */

import type { Payment } from '@/lib/types'

export interface RecalcInput {
  /** Per-student price including GST. Maps to mou.spWithTax. */
  pricePerStudent: number
  /** Current student count. From the latest StudentCountEvent, else mou.studentsActual ?? mou.studentsMou. */
  currentCount: number
  /**
   * Instalments in seq order. Each row carries `expectedAmount` (the
   * pre-recalc baseline) and `receivedAmount` (which determines lock
   * state).
   *
   * `percentShare` should be set on every row. The applyCountChange
   * wrapper backfills it on first use from `expectedAmount /
   * signingContractValue * 100` so legacy rows gain the stable ratio.
   * If a row still lacks `percentShare` here, the engine falls back to
   * `expectedAmount / sumOfExpectedAmounts * 100` which is correct
   * ONLY when no prior recalc has drifted the ratios. Pass
   * `percentShare` explicitly when in doubt.
   */
  installments: Payment[]
  /**
   * Phase 6D Part 4 hook for the schedule-edit override path. When
   * set, the engine uses this value as the new contract total instead
   * of deriving it as `currentCount * pricePerStudent`. Lets
   * `saveSchedule.overrideLockedSchedule` rewrite the per-row split at
   * a fixed contract value without changing the student count. The
   * `/student-count` flow leaves this undefined so the standard
   * count-driven derivation kicks in.
   */
  newContractValue?: number
}

export interface RecalcInstalmentRow {
  paymentId: string
  instalmentSeq: number
  percentShare: number             // 0-100
  isLocked: boolean
  /** Per-row theoretical share at current count: currentCount × pricePerStudent × pctShare / 100. */
  nominalAmount: number
  /**
   * Locked: 0 (immutable; the row already has receivedAmount as netDue).
   * Unpaid: `netDue - nominalAmount`. Under spread-by-weight, every
   * unpaid row carries a small adjustment because the locked rows'
   * delta is divided across all unpaid rows by percent weight. Sign
   * follows the carry direction:
   *   - negative => unpaid row owes LESS than its nominal share
   *     (locked rows over-paid; credit redistributed to this row)
   *   - positive => unpaid row owes MORE than its nominal share
   *     (locked rows under-paid; catchup added to this row)
   */
  adjustmentFromLockedInstallments: number
  /**
   * Locked: receivedAmount (immutable; the operator does not rewrite
   * paid history).
   * Unpaid: remainingContract × (percentShare / sumOfUnpaidPercentShares),
   * with rounding tail absorbed into the last unpaid row.
   */
  netDue: number
  /**
   * Per-row contribution to the cumulative delta from locked rows.
   * Negative = locked row received MORE than current count would owe
   * (excess credit). Positive = received LESS (shortfall). Zero for
   * any row that is not locked.
   */
  lockedDeltaContribution: number
}

export interface RecalcResult {
  rows: RecalcInstalmentRow[]
  /** Sum of lockedDeltaContribution across all locked rows. Informational. */
  cumulativeDelta: number
  /** Payment.id of the first unpaid instalment, or null when every row is locked. */
  firstUnpaidId: string | null
  /** Sum of netDue across every row; should equal currentCount × pricePerStudent when reconciled. */
  totalCommitted: number
  /**
   * True when the engine reconciled exactly to the
   * `currentCount × pricePerStudent` invariant (within 1 Rs
   * tolerance). False indicates a data anomaly the operator must
   * resolve before saving (typically: every row is locked, so the
   * engine cannot place the carry anywhere).
   */
  reconciled: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isLocked(p: Payment): boolean {
  if (p.isLocked === true) return true
  return p.receivedAmount !== null && p.receivedAmount > 0
}

function derivePercentShare(p: Payment, fallbackBase: number): number {
  if (typeof p.percentShare === 'number' && p.percentShare > 0) return p.percentShare
  if (fallbackBase <= 0) return 0
  return (p.expectedAmount / fallbackBase) * 100
}

export function recalcInstallments(input: RecalcInput): RecalcResult {
  const { pricePerStudent, currentCount, installments, newContractValue } = input
  const sorted = installments
    .slice()
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  // For the percentShare fallback we use the sum of expectedAmount
  // across all rows. This works on a fresh schedule (no recalc drift
  // yet) and produces 25/25/25/25 for the uniform case. Once any row
  // has been recalc'd, callers must pass `percentShare` explicitly
  // on every row to avoid drift.
  const fallbackBase = sorted.reduce((s, p) => s + p.expectedAmount, 0)

  // Pass 1: classify each row + compute nominalAmount and the locked
  // delta contribution. nominalAmount is the "ideal share at this
  // count" used for both display and the adjustment derivation.
  const rows: RecalcInstalmentRow[] = sorted.map((p) => {
    const percentShare = derivePercentShare(p, fallbackBase)
    const nominalAmount = round2((currentCount * pricePerStudent * percentShare) / 100)
    const locked = isLocked(p)
    const lockedDeltaContribution = locked
      ? round2(nominalAmount - (p.receivedAmount ?? 0))
      : 0
    return {
      paymentId: p.id,
      instalmentSeq: p.instalmentSeq,
      percentShare,
      isLocked: locked,
      nominalAmount,
      adjustmentFromLockedInstallments: 0,
      netDue: 0,
      lockedDeltaContribution,
    }
  })

  const cumulativeDelta = round2(
    rows.filter((r) => r.isLocked).reduce((s, r) => s + r.lockedDeltaContribution, 0),
  )

  // The money already in: sum of receivedAmount across locked rows.
  const lockedReceivedSum = round2(
    sorted
      .filter((p) => isLocked(p))
      .reduce((s, p) => s + (p.receivedAmount ?? 0), 0),
  )

  const resolvedContractValue =
    typeof newContractValue === 'number'
      ? round2(newContractValue)
      : round2(currentCount * pricePerStudent)
  const remainingContract = round2(resolvedContractValue - lockedReceivedSum)

  // Sum of percent share across the UNPAID rows. This is the basis
  // for the spread-by-weight allocation. When zero (every row locked),
  // the engine cannot place the carry; reconciled returns false.
  const unpaidRows = rows.filter((r) => !r.isLocked)
  const sumUnpaidPercent = round2(unpaidRows.reduce((s, r) => s + r.percentShare, 0))

  // Pass 2: assign netDue + adjustment.
  // Locked: netDue = receivedAmount (immutable). adjustment = 0.
  // Unpaid: netDue = remainingContract × (rowPct / sumUnpaidPct).
  //         The last unpaid row absorbs the rounding tail so
  //         sum(netDue) == remainingContract exactly. adjustment is
  //         the per-row delta from nominalAmount.
  let firstUnpaidId: string | null = null
  let unpaidSeenCount = 0
  let unpaidAllocated = 0

  for (const row of rows) {
    if (row.isLocked) {
      const original = sorted.find((p) => p.id === row.paymentId)
      row.netDue = round2(original?.receivedAmount ?? row.nominalAmount)
      row.adjustmentFromLockedInstallments = 0
      continue
    }
    if (firstUnpaidId === null) firstUnpaidId = row.paymentId
    unpaidSeenCount += 1
    const isLastUnpaid = unpaidSeenCount === unpaidRows.length

    let net: number
    if (sumUnpaidPercent <= 0) {
      net = 0
    } else if (isLastUnpaid) {
      // Absorb the rounding tail so the unpaid sum lands on
      // remainingContract exactly.
      net = round2(remainingContract - unpaidAllocated)
    } else {
      net = round2((remainingContract * row.percentShare) / sumUnpaidPercent)
      unpaidAllocated = round2(unpaidAllocated + net)
    }
    row.netDue = net
    row.adjustmentFromLockedInstallments = round2(net - row.nominalAmount)
  }

  const totalCommitted = round2(rows.reduce((s, r) => s + r.netDue, 0))
  const reconciled = Math.abs(totalCommitted - resolvedContractValue) <= 1

  return { rows, cumulativeDelta, firstUnpaidId, totalCommitted, reconciled }
}
