/*
 * School data-completeness scoring (W3-C C3; kanban GSTIN tile).
 *
 * Pure helpers that score each school 0-4 against the four critical
 * contact / billing fields:
 *
 *   - gstNumber       (PI generation blocks when null)
 *   - email           (SPOC outreach blocks when null)
 *   - contactPerson   (escalation routing benefits)
 *   - pinCode         (dispatch routing benefits)
 *
 * Score is the COUNT OF MISSING fields (0 = complete; 4 = empty).
 * "Most missing first" sort surfaces the schools that need the most
 * triage at the top of the filtered list.
 *
 * All 124 upstream-imported schools currently score 4 (every field
 * is null post Week 3 import; backfill is operational pilot work
 * surfaced via the kanban "Schools needing data" tile).
 *
 * W3-D may extend the criteria as the rule set evolves; for C3 the
 * four-field shape is locked.
 */

import type { School } from '@/lib/types'

export const COMPLETENESS_FIELDS = ['gstNumber', 'email', 'contactPerson', 'pinCode'] as const

export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number]

/** Number of missing critical fields on a school (0 = complete, 4 = empty). */
export function missingFieldCount(school: School): number {
  let count = 0
  for (const field of COMPLETENESS_FIELDS) {
    const value = school[field]
    if (value === null || value === undefined || value === '') count += 1
  }
  return count
}

/** Convenience predicate: school has all four critical fields populated. */
export function isSchoolComplete(school: School): boolean {
  return missingFieldCount(school) === 0
}

/**
 * Filter + sort: schools with at least `threshold` missing fields,
 * sorted "most missing first" so triage hits the worst cases at the
 * top. Stable secondary order: school name ascending.
 */
export function getIncompleteSchools(
  schools: School[],
  threshold: number = 1,
): School[] {
  return schools
    .map((s) => ({ school: s, miss: missingFieldCount(s) }))
    .filter((entry) => entry.miss >= threshold)
    .sort((a, b) => {
      if (a.miss !== b.miss) return b.miss - a.miss
      return a.school.name.localeCompare(b.school.name)
    })
    .map((entry) => entry.school)
}
