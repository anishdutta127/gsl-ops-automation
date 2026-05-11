/*
 * Reports module permission gates (Gate 5A Step 1).
 *
 * Five canonical report slugs with role-aware access:
 *   - fy-summary           cross-functional; every active user
 *   - sales-performance    Sales + Admin + Leadership
 *   - dispatch-performance Ops + Admin + Leadership
 *   - payment-aging        Finance + Admin + Leadership
 *   - escalations          cross-functional; every active user
 *
 * Admin and Leadership wildcard across every report; a department
 * user can only see fy-summary, escalations, and their own
 * department's report. Inactive users see nothing.
 */

import { getDepartment } from '@/lib/access'
import type { User } from '@/lib/types'

export type ReportSlug =
  | 'fy-summary'
  | 'sales-performance'
  | 'dispatch-performance'
  | 'payment-aging'
  | 'escalations'

export const REPORT_SLUGS: readonly ReportSlug[] = [
  'fy-summary',
  'sales-performance',
  'dispatch-performance',
  'payment-aging',
  'escalations',
]

export function isReportSlug(v: string): v is ReportSlug {
  return (REPORT_SLUGS as readonly string[]).includes(v)
}

export function canAccessReport(user: User | null, slug: ReportSlug): boolean {
  if (!user || !user.active) return false
  // Admin + Leadership are the cross-functional wildcards regardless of dept.
  if (user.role === 'Admin' || user.role === 'Leadership') return true
  const dept = getDepartment(user)
  // Cross-functional reports: every active user can read them.
  if (slug === 'fy-summary' || slug === 'escalations') return true
  if (slug === 'sales-performance') return dept === 'sales'
  if (slug === 'dispatch-performance') return dept === 'ops'
  if (slug === 'payment-aging') return dept === 'finance'
  return false
}

/** Reports the user is allowed to see on the /reports index. */
export function visibleReports(user: User | null): ReportSlug[] {
  return REPORT_SLUGS.filter((s) => canAccessReport(user, s))
}
