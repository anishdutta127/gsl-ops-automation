/*
 * Student-count recalculation engine (Phase 5, 2026-05-19).
 *
 * Pranav review #4: schools rarely enrol the exact count named in
 * the MOU. Each unpaid instalment re-prices at the current count;
 * the cumulative over- or under-payment from PAID (locked)
 * instalments rolls into the next unpaid PI.
 *
 * The audit at docs/gate-student-count/RECALC_AUDIT.md verifies the
 * algorithm against Pranav's two worked examples (500 -> 450 -> 400
 * decreasing, and 500 -> 600 increasing). This module implements
 * that algorithm as a pure function over the Payment list.
 *
 * The existing src/lib/mouSystem/recalc.ts engine implements the
 * same algorithm with a different output shape (separate Adjustment
 * entity). Phase 5 prefers the in-row split because Pranav's mental
 * model is "the adjustment shows up ON the installment line"; the
 * old engine keeps powering the schedule-edit path.
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
   * `percentShare` should be set on every row. The
   * applyCountChange wrapper backfills it on first use from
   * `expectedAmount / signingContractValue * 100` so legacy rows
   * gain the stable ratio. If a row still lacks `percentShare` here,
   * the engine falls back to `expectedAmount / sumOfExpectedAmounts *
   * 100` which is correct ONLY when no prior recalc has drifted the
   * ratios. Pass `percentShare` explicitly when in doubt.
   */
  installments: Payment[]
}

export interface RecalcInstalmentRow {
  paymentId: string
  instalmentSeq: number
  percentShare: number             // 0-100
  isLocked: boolean
  nominalAmount: number            // currentCount × pricePerStudent × pctShare / 100
  /**
   * For locked rows: 0 (the row is immutable; the carry lives on the
   * NEXT unpaid row). For the first unpaid row: cumulative delta.
   * For subsequent unpaid rows: 0.
   */
  adjustmentFromLockedInstallments: number
  /**
   * Locked: receivedAmount (immutable).
   * First unpaid: nominalAmount + adjustmentFromLockedInstallments.
   * Subsequent unpaid: nominalAmount.
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
  /** Sum of lockedDeltaContribution across all locked rows. */
  cumulativeDelta: number
  /** Payment.id of the first unpaid instalment, or null when every row is locked. */
  firstUnpaidId: string | null
  /** Sum of netDue across every row; should equal currentCount × pricePerStudent. */
  totalCommitted: number
  /**
   * True when the engine reconciled exactly to the
   * `currentCount × pricePerStudent` invariant (within 1 Rs
   * tolerance). False indicates a data anomaly the operator must
   * resolve before saving.
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
  const { pricePerStudent, currentCount, installments } = input
  const sorted = installments
    .slice()
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  // For the percentShare fallback we use the sum of expectedAmount
  // across all rows. This works on a fresh schedule (no recalc drift
  // yet) and produces 25/25/25/25 for the uniform case. Once any row
  // has been recalc'd, callers must pass `percentShare` explicitly
  // on every row to avoid drift.
  const fallbackBase = sorted.reduce((s, p) => s + p.expectedAmount, 0)

  // Pass 1: compute nominalAmount + lockedDeltaContribution for every row.
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

  // Pass 2: cumulative delta from all locked rows.
  const cumulativeDelta = round2(
    rows.filter((r) => r.isLocked).reduce((s, r) => s + r.lockedDeltaContribution, 0),
  )

  // Pass 3: assign netDue + adjustment.
  let firstUnpaidId: string | null = null
  for (const row of rows) {
    if (row.isLocked) {
      const original = sorted.find((p) => p.id === row.paymentId)
      // For locked rows netDue is the immutable received amount; the
      // installment is already paid and we do not rewrite history.
      row.netDue = round2(original?.receivedAmount ?? row.nominalAmount)
      row.adjustmentFromLockedInstallments = 0
      continue
    }
    if (firstUnpaidId === null) {
      firstUnpaidId = row.paymentId
      row.adjustmentFromLockedInstallments = cumulativeDelta
      row.netDue = round2(row.nominalAmount + cumulativeDelta)
    } else {
      row.adjustmentFromLockedInstallments = 0
      row.netDue = row.nominalAmount
    }
  }

  const totalCommitted = round2(rows.reduce((s, r) => s + r.netDue, 0))
  const expectedTotal = round2(currentCount * pricePerStudent)
  const reconciled = Math.abs(totalCommitted - expectedTotal) <= 1

  return { rows, cumulativeDelta, firstUnpaidId, totalCommitted, reconciled }
}
