/*
 * Derive the "current" sales rep for a school.
 *
 * Pranav review item #6: school detail must show the current sales rep
 * with a Reassign affordance. The audit at
 * docs/gate-quick-wins/SALESPERSON_REASSIGNMENT_AUDIT.md decided not to
 * add a `School.currentSalesPersonId` field; the audit log carries the
 * canonical signal.
 *
 * Resolution order:
 *   1. Newest 'sales-rep-reassigned' entry on school.auditLog wins; its
 *      `after.salesPersonId` is the durable record of the last
 *      reassignment.
 *   2. Otherwise pick the MOU at this school with the latest
 *      generatedAt / createdAt and return its `salesPersonId`.
 *   3. Return null when neither exists.
 *
 * The wizard's school-selector pre-fill is the planned follow-up
 * caller; for this gate the helper backs the School detail header.
 */

import type { MOU, School } from '@/lib/types'

export function getCurrentSalesRepForSchool(
  school: School,
  schoolMous: MOU[],
): string | null {
  // (1) Walk the school audit log newest-first.
  for (let i = school.auditLog.length - 1; i >= 0; i -= 1) {
    const entry = school.auditLog[i]
    if (!entry || entry.action !== 'sales-rep-reassigned') continue
    const after = entry.after as Record<string, unknown> | null | undefined
    const salesPersonId = after?.salesPersonId
    if (typeof salesPersonId === 'string') return salesPersonId
    // 'null' explicit (unassigning) is also a valid reassignment outcome.
    if (salesPersonId === null) return null
  }

  // (2) Fall back to the most-recent MOU's stored salesPersonId.
  if (schoolMous.length === 0) return null
  const sorted = [...schoolMous].sort((a, b) => {
    // generatedAt is the wizard-set creation timestamp; older import
    // rows may have it null, so fall back to the lexicographic id which
    // for the MOU minter is monotonic-per-year.
    const aKey = a.generatedAt ?? a.id
    const bKey = b.generatedAt ?? b.id
    if (aKey < bKey) return 1
    if (aKey > bKey) return -1
    return 0
  })
  return sorted[0]?.salesPersonId ?? null
}
