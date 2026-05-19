/*
 * Financial-year membership derivation for MOUs.
 *
 * Pranav review item #1: registry should organise by FY, and a
 * multi-year MOU should appear in each FY where at least one of its
 * instalments has a due date. The audit at
 * docs/gate-year-registry/REGISTRY_AUDIT.md confirmed the existing
 * schema is enough: walk Payment.dueDateIso, derive the FY label
 * via fiscalYearOfIso (already exists in leadershipData), and fall
 * back to MOU duration when no instalments exist yet.
 *
 * Format note: FY labels follow the existing codebase convention of
 * "YYYY-YY" e.g. "2026-27", not "FY2026-27" with a prefix. This
 * matches `mou.academicYear`, `fiscalYearOfIso`, `priorFy`, and the
 * existing dashboard FY toggle.
 */

import type { MOU, Payment } from '@/lib/types'
import { fiscalYearOfIso } from '@/lib/dashboard/leadershipData'

/**
 * Returns the current FY label based on today's date. Indian FY runs
 * April N to March N+1; for the May 2026 launch date a call to this
 * returns "2026-27".
 */
export function getCurrentFinancialYear(now: Date = new Date()): string {
  const label = fiscalYearOfIso(now.toISOString())
  // fiscalYearOfIso is null-safe; production calls always produce a
  // valid date, but type-narrow here so callers can use the return
  // value without an extra null check.
  return label ?? '2026-27'
}

/**
 * Enumerate every FY label between (and including) two ISO dates.
 * Used by the draft / unsigned fallback when an MOU has no Payments
 * yet but does have startDate / endDate.
 */
function fyRange(startIso: string, endIso: string): string[] {
  const start = fiscalYearOfIso(startIso)
  const end = fiscalYearOfIso(endIso)
  if (!start || !end) return []
  if (start === end) return [start]
  const out: string[] = []
  let cursor = start
  // Loop forward by year (cap at 12 iterations as a safety net; an MOU
  // longer than 12 financial years is a data bug, not a real case).
  for (let i = 0; i < 12; i += 1) {
    out.push(cursor)
    if (cursor === end) return out
    const match = cursor.match(/^(\d{4})-(\d{2})$/)
    if (!match) return out
    const startYear = Number(match[1])
    const nextStart = startYear + 1
    const nextEndShort = String((nextStart + 1) % 100).padStart(2, '0')
    cursor = `${nextStart}-${nextEndShort}`
  }
  return out
}

/**
 * Returns the FYs this MOU appears in.
 *
 * Resolution order:
 *   1. If the MOU has any Payment with dueDateIso, collect the
 *      FY of every such instalment and return the unique sorted set.
 *   2. Otherwise fall back to the FY range spanned by
 *      [mou.startDate, mou.endDate].
 *   3. Otherwise fall back to [mou.academicYear].
 */
export function getFinancialYearsForMou(
  mou: MOU,
  allPayments: Payment[],
): string[] {
  const ownPayments = allPayments.filter((p) => p.mouId === mou.id)
  const fysFromPayments = new Set<string>()
  for (const p of ownPayments) {
    if (!p.dueDateIso) continue
    const fy = fiscalYearOfIso(p.dueDateIso)
    if (fy) fysFromPayments.add(fy)
  }
  if (fysFromPayments.size > 0) {
    return Array.from(fysFromPayments).sort()
  }

  if (mou.startDate && mou.endDate) {
    const range = fyRange(mou.startDate, mou.endDate)
    if (range.length > 0) return range
  }

  if (mou.academicYear) return [mou.academicYear]
  return []
}

/**
 * Returns every FY that has at least one MOU in it. Sorted descending
 * (most recent first) so the year picker pill row reads
 * "2027-28 | 2026-27 | 2025-26" with the current year typically
 * highlighted in the middle or near the top.
 */
export function getAllRelevantFinancialYears(
  mous: MOU[],
  allPayments: Payment[],
): string[] {
  const set = new Set<string>()
  for (const mou of mous) {
    for (const fy of getFinancialYearsForMou(mou, allPayments)) {
      set.add(fy)
    }
  }
  return Array.from(set).sort().reverse()
}

/**
 * Filter MOUs to those appearing in the given FY tag.
 */
export function filterMousByFinancialYear(
  mous: MOU[],
  allPayments: Payment[],
  fyTag: string,
): MOU[] {
  return mous.filter((mou) =>
    getFinancialYearsForMou(mou, allPayments).includes(fyTag),
  )
}

/**
 * Returns the subset of Payment rows for this MOU whose dueDateIso
 * falls within the given FY tag. Used by the year-scoped row data on
 * the registry list (Year contract value, Year received, etc.) and by
 * the year tabs on the multi-year MOU detail page.
 *
 * When the MOU has no payments yet (draft) and the FY tag matches one
 * of its duration-derived FYs, returns []. Callers should fall back to
 * lifetime totals for display in that case.
 */
export function getYearSpecificInstalments(
  mou: MOU,
  fyTag: string,
  allPayments: Payment[],
): Payment[] {
  return allPayments
    .filter((p) => p.mouId === mou.id)
    .filter((p) => {
      if (!p.dueDateIso) return false
      return fiscalYearOfIso(p.dueDateIso) === fyTag
    })
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
}
