/*
 * Payment schedule summary derivation.
 *
 * The MOU has a stored `paymentSchedule` summary string set at MOU
 * creation / Pranav refresh time. The actual installment rows in
 * payments.json are the truth: a Sales edit at
 * /mous/[mouId]/installments/schedule-edit can rewrite the rows
 * without regenerating the stored summary. Pranav reported a school
 * where the stored summary still said "50-50 half-yearly" while the
 * rows had moved to 10-30-30-30.
 *
 * `deriveScheduleSummary(payments, contractValue)` returns the
 * canonical display string by reading the rows. Display sites call
 * this at render time; the stored field stays untouched. When no
 * installments exist (unsigned MOU) the function falls back to the
 * stored value so the KPI tile still has something to show.
 */

import type { Payment } from '@/lib/types'

/**
 * Derive a human-readable payment-schedule summary from the
 * installment rows. Single source of truth = the rows themselves.
 *
 * @param payments        Installments for this MOU.
 * @param contractValue   MOU.contractValue (used as the percentage base).
 * @param storedFallback  mou.paymentSchedule, returned when there are
 *                        zero rows so unsigned MOUs still show the
 *                        Sales-entered intent.
 */
export function deriveScheduleSummary(
  payments: Payment[],
  contractValue: number,
  storedFallback: string,
): string {
  if (payments.length === 0) return storedFallback
  if (payments.length === 1) return '100%'

  const sorted = [...payments].sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  // Use contractValue as the percentage base. If contractValue is
  // zero or negative (corrupted MOU), fall back to the sum of the
  // installments so we still produce a coherent string.
  const base = contractValue > 0
    ? contractValue
    : sorted.reduce((s, p) => s + p.expectedAmount, 0)

  if (base <= 0) return storedFallback

  const rawPercents = sorted.map((p) => (p.expectedAmount / base) * 100)
  const rounded = rawPercents.map((v) => Math.round(v))
  const sum = rounded.reduce((s, v) => s + v, 0)
  const remainder = 100 - sum
  // Last row absorbs the rounding remainder so the summary sums to 100.
  const lastIndex = rounded.length - 1
  const lastVal = rounded[lastIndex] ?? 0
  rounded[lastIndex] = lastVal + remainder

  const dashJoined = rounded.join('-')
  const allEqual = rounded.every((v) => v === rounded[0])

  if (rounded.length === 2) {
    if (allEqual && rounded[0] === 50) return '50-50 half-yearly'
    return dashJoined
  }
  if (rounded.length === 4 && allEqual && rounded[0] === 25) {
    return '25-25-25-25 quarterly'
  }
  return dashJoined
}
