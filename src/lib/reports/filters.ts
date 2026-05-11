/*
 * Reports filter parsing (Gate 5A Step 1).
 *
 * Shared filter shape across the 5 report routes:
 *   - fy:   Indian fiscal-year label 'YYYY-YY' (e.g. '2026-27')
 *   - dept: 'sales' | 'ops' | 'finance' | 'All'
 *   - from / to: ISO yyyy-mm-dd overrides (when both null, FY drives the window)
 *
 * URL-mirrored: parseReportFilters reads a Next.js searchParams record;
 * serializeReportFilters emits the canonical query string the
 * ReportFilterRail Apply action posts back.
 */

import type { MOU } from '@/lib/types'
import { fiscalYearOfIso } from '@/lib/dashboard/leadershipData'
import { fyToRange } from '@/lib/dashboard/financeDashboardData'

export type ReportDept = 'sales' | 'ops' | 'finance' | 'All'

export const REPORT_DEPTS: readonly ReportDept[] = ['All', 'sales', 'ops', 'finance']

export interface ReportFilters {
  fy: string | null
  dept: ReportDept
  from: string | null
  to: string | null
}

function parseIsoDate(v: string | string[] | undefined): string | null {
  if (typeof v !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(v + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  if (d.toISOString().slice(0, 10) !== v) return null
  return v
}

export function parseReportFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ReportFilters {
  const fyRaw = typeof searchParams.fy === 'string' ? searchParams.fy : null
  const fy = fyRaw && /^\d{4}-\d{2}$/.test(fyRaw) ? fyRaw : null

  const deptRaw = typeof searchParams.dept === 'string' ? searchParams.dept : null
  const dept: ReportDept =
    deptRaw && (REPORT_DEPTS as readonly string[]).includes(deptRaw)
      ? (deptRaw as ReportDept)
      : 'All'

  const from = parseIsoDate(searchParams.from)
  const to = parseIsoDate(searchParams.to)

  return { fy, dept, from, to }
}

export function serializeReportFilters(f: ReportFilters): string {
  const params = new URLSearchParams()
  if (f.fy) params.set('fy', f.fy)
  if (f.dept !== 'All') params.set('dept', f.dept)
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  return params.toString()
}

/** Resolve [from, to] window. Explicit from/to overrides FY. */
export function resolveReportWindow(f: ReportFilters): {
  from: string | null
  to: string | null
} {
  if (f.from || f.to) return { from: f.from, to: f.to }
  if (f.fy) {
    const r = fyToRange(f.fy)
    if (r) return r
  }
  return { from: null, to: null }
}

/** Distinct FY labels across the MOU set + current FY, sorted desc. */
export function fyOptionsFor(mous: MOU[], now: Date): string[] {
  const set = new Set<string>()
  for (const m of mous) if (m.academicYear) set.add(m.academicYear)
  const nowFy = fiscalYearOfIso(now.toISOString())
  if (nowFy) set.add(nowFy)
  return Array.from(set).sort().reverse()
}

/** Three FY options surfaced by default: current + prior 2 (if known). */
export function defaultFyOptions(mous: MOU[], now: Date): string[] {
  return fyOptionsFor(mous, now).slice(0, 3)
}

/** Human-readable subtitle of the active window. */
export function reportSubtitle(filters: ReportFilters, now: Date): string {
  const parts: string[] = []
  if (filters.from || filters.to) {
    parts.push(`${filters.from ?? '...'} to ${filters.to ?? '...'}`)
  } else if (filters.fy) {
    parts.push(`FY ${filters.fy}`)
  }
  if (filters.dept !== 'All') parts.push(`Dept: ${filters.dept}`)
  if (parts.length === 0) return `As of ${now.toISOString().slice(0, 10)}`
  return `Filtered view: ${parts.join(' · ')}`
}

/** ISO date in window inclusive of both ends. */
export function isoInWindow(
  iso: string | null,
  from: string | null,
  to: string | null,
): boolean {
  if (!iso) return false
  if (from && iso < from) return false
  if (to && iso > to) return false
  return true
}
