/*
 * School field-visibility config (Gate 1 Step 4 / MM4).
 *
 * The /schools/[id]/edit form hides the GSTIN + PAN + billing block
 * from non-Finance editors per Misba's MM4 finding ("Ops does not
 * require the GSTIN number"). The brief extended the rule from GSTIN
 * to PAN + billing block. This file is the single source of truth so
 * the form, the API route, and the editSchool lib agree.
 *
 * Related dept-aware gating: the form / route /lib all key off
 * canEditFinanceData(user) from src/lib/access.ts. Admin role with
 * department='ops' (Misba) reads as non-Finance and gets the fields
 * stripped both visually and on save.
 */

import { canEditFinanceData } from './access'
import type { User } from './types'

/**
 * School schema fields that only Finance + Admin (with null
 * department) can view + mutate. The form hides them, the route
 * preserves them on save (Ops save does not wipe GSTIN), the lib
 * defence-in-depths drops them from the patch when the caller is
 * not Finance.
 */
export const FINANCE_ONLY_SCHOOL_FIELDS = [
  'gstNumber',
  'pan',
  'billingName',
] as const

export type FinanceOnlySchoolField = (typeof FINANCE_ONLY_SCHOOL_FIELDS)[number]

export function isFinanceOnlySchoolField(
  field: string,
): field is FinanceOnlySchoolField {
  return (FINANCE_ONLY_SCHOOL_FIELDS as readonly string[]).includes(field)
}

/**
 * Whether the user can see + edit Finance-scoped school fields. Wraps
 * canEditFinanceData so the form / route / lib all share the same
 * decision rule.
 */
export function canEditFinanceSchoolFields(user: User): boolean {
  return canEditFinanceData(user)
}
