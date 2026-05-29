/*
 * Per-year pricing helpers (Round 3 Step 2).
 *
 * Pranav's report:
 *   2-year MOU, 1000 students, Rs 1500/student.
 *   Year 1 schedule 20-40-40, Year 2 schedule 20-40-40.
 *   Expected total Rs 30,00,000 (Y1 Rs 15L + Y2 Rs 15L).
 *   System produced Rs 15,00,000 split across 6 instalments.
 *
 * Root cause: saveDraftMou computed contractValue = students *
 * spWithTax with no multiplication by numberOfYears. The fix introduces
 * a YearlyPricingRow array on MOU; this module resolves it for any MOU
 * (legacy or new) into a uniform shape so downstream code (contract
 * value, instalment generation, recalc) reads from one source.
 *
 * All functions pure: same inputs -> same outputs, no IO.
 */

import type { MOU, YearlyPricingRow } from './types'
import companyJson from '../../../config/company.json'

const GST_RATE_FROM_CONFIG = (companyJson as { gstRate?: number }).gstRate ?? 0.18

/**
 * Round 4 Bug 2: derive the without-GST per-student price from the
 * with-GST entry using the same top-down derivation generatePi.ts
 * applies to PI subtotals (`Math.round(withTax / (1 + gstRate))`).
 *
 * Keeping a single derivation in one place prevents the spWithoutTax
 * shown on the annexure pricing grid from drifting against the PI
 * subtotal (which the Round 1 fix anchored to with-GST as the truth).
 * Returns 0 when withTax is 0 or non-finite so callers can pass
 * unparsed inputs straight through.
 */
export function deriveSpWithoutTax(
  withTax: number,
  gstRate: number = GST_RATE_FROM_CONFIG,
): number {
  if (!Number.isFinite(withTax) || withTax <= 0) return 0
  return Math.round(withTax / (1 + gstRate))
}

export const DEFAULT_GST_RATE = GST_RATE_FROM_CONFIG

export interface ResolvedYearlyPricing {
  rows: YearlyPricingRow[]
  /** number of years the MOU runs for (>= 1). */
  numberOfYears: number
  /** True when the MOU has explicit per-year pricing, false when we
   *  fell back to uniform pricing from spWithoutTax/spWithTax. */
  fromExplicit: boolean
}

/**
 * Resolve an MOU's pricing into a normalised per-year array.
 *
 * Priority:
 *   1. mou.yearlyPricing if non-empty (length matches numberOfYears
 *      after coercion; missing years are backfilled with top-level
 *      price so we never produce zero-priced years).
 *   2. Fall back to (numberOfYears) * { spWithoutTax, spWithTax } so
 *      legacy single-year MOUs and pre-Round-3 multi-year drafts work.
 */
export function resolveYearlyPricing(mou: Pick<
  MOU,
  'spWithoutTax' | 'spWithTax' | 'numberOfYears' | 'yearlyPricing'
>): ResolvedYearlyPricing {
  const years = Math.max(1, mou.numberOfYears ?? 1)
  const explicit = mou.yearlyPricing ?? []
  if (explicit.length > 0) {
    const rows: YearlyPricingRow[] = []
    for (let y = 1; y <= years; y++) {
      const found = explicit.find((row) => row.year === y)
      if (found) {
        rows.push({
          year: y,
          spWithoutTax: Number(found.spWithoutTax) || 0,
          spWithTax: Number(found.spWithTax) || 0,
        })
      } else {
        rows.push({
          year: y,
          spWithoutTax: mou.spWithoutTax || 0,
          spWithTax: mou.spWithTax || 0,
        })
      }
    }
    return { rows, numberOfYears: years, fromExplicit: true }
  }
  const rows: YearlyPricingRow[] = []
  for (let y = 1; y <= years; y++) {
    rows.push({
      year: y,
      spWithoutTax: mou.spWithoutTax || 0,
      spWithTax: mou.spWithTax || 0,
    })
  }
  return { rows, numberOfYears: years, fromExplicit: false }
}

/**
 * Total contract value for the MOU, summing each year's
 * (students * yearN.spWithTax). Pranav's 2-year x 1000 x 1500 example
 * produces Rs 30,00,000.
 */
export function computeContractValue(
  mou: Pick<
    MOU,
    'studentsMou' | 'spWithoutTax' | 'spWithTax' | 'numberOfYears' | 'yearlyPricing'
  >,
): number {
  const students = mou.studentsMou || 0
  if (students <= 0) return 0
  const { rows } = resolveYearlyPricing(mou)
  let sum = 0
  for (const row of rows) {
    sum += students * (row.spWithTax || 0)
  }
  return Math.round(sum)
}

/**
 * Given an MOU, return per-year revenue (students * yearN.spWithTax).
 * Useful for instalment generation: each year's payment schedule
 * percentages apply to that year's revenue, not to the contract total.
 */
export function computeYearlyRevenue(
  mou: Pick<
    MOU,
    'studentsMou' | 'studentsActual' | 'spWithoutTax' | 'spWithTax' | 'numberOfYears' | 'yearlyPricing'
  >,
  options: { useActual?: boolean } = {},
): Array<{ year: number; revenue: number; spWithTax: number; students: number }> {
  const students = options.useActual
    ? (mou.studentsActual ?? mou.studentsMou ?? 0)
    : (mou.studentsMou ?? 0)
  const { rows } = resolveYearlyPricing(mou)
  return rows.map((row) => ({
    year: row.year,
    revenue: Math.round(students * (row.spWithTax || 0)),
    spWithTax: row.spWithTax || 0,
    students,
  }))
}
