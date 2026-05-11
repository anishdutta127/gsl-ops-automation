/*
 * Escalations report compute + CSV (Gate 5A Step 1).
 *
 * Department x severity matrix of OPEN escalations, average + median
 * resolution time for CLOSED escalations in the window, category-
 * level open/closed breakdown, and a current-vs-prior-window trend
 * showing the three categories with the biggest percentage rise.
 *
 * Department scoping: a Sales/Ops/Finance filter narrows to
 * escalations where ownedByDepartment matches OR (when
 * ownedByDepartment is null) lane maps to the chosen department.
 */

import type {
  Escalation,
  EscalationCategory,
  EscalationLane,
  EscalationSeverity,
} from '@/lib/types'
import { buildCsv } from './csv'
import type { ReportFilters } from './filters'
import { isoInWindow, resolveReportWindow } from './filters'

const CATEGORIES: ReadonlyArray<EscalationCategory> = [
  'Dispatch Delay',
  'Payment Issue',
  'Quality Complaint',
  'Training Issue',
  'School Communication',
  'Inventory Shortfall',
  'Vendor Issue',
  'Other',
]

const SEVERITIES: ReadonlyArray<EscalationSeverity> = [
  'critical',
  'high',
  'medium',
  'low',
]

const DEPTS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

function laneToDept(lane: EscalationLane): 'sales' | 'ops' | 'finance' {
  if (lane === 'SALES') return 'sales'
  if (lane === 'ACADEMICS') return 'ops'
  return 'ops'
}

function deptOf(e: Escalation): 'sales' | 'ops' | 'finance' {
  if (e.ownedByDepartment) return e.ownedByDepartment
  return laneToDept(e.lane)
}

export interface EscalationMatrix {
  cells: Record<
    'sales' | 'ops' | 'finance',
    Record<EscalationSeverity, number>
  >
  totalOpen: number
}

export interface ResolutionTimeStats {
  avgDays: number | null
  medianDays: number | null
  count: number
}

export interface CategoryRow {
  category: EscalationCategory
  open: number
  closed: number
}

export interface TrendRow {
  category: EscalationCategory
  current: number
  prior: number
  deltaPct: number | null
}

export interface EscalationsReport {
  matrix: EscalationMatrix
  resolution: ResolutionTimeStats
  categories: CategoryRow[]
  trending: TrendRow[]
  windowFrom: string | null
  windowTo: string | null
}

export interface EscalationsReportArgs {
  escalations: Escalation[]
  filters: ReportFilters
  now: Date
}

function buildEmptyMatrix(): EscalationMatrix {
  const cells = {
    sales: { critical: 0, high: 0, medium: 0, low: 0 },
    ops: { critical: 0, high: 0, medium: 0, low: 0 },
    finance: { critical: 0, high: 0, medium: 0, low: 0 },
  }
  return { cells, totalOpen: 0 }
}

function escalationInWindow(
  e: Escalation,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true
  return isoInWindow(e.createdAt.slice(0, 10), from, to)
}

function escalationDeptMatches(
  e: Escalation,
  dept: ReportFilters['dept'],
): boolean {
  if (dept === 'All') return true
  return deptOf(e) === dept
}

function closedAtTimestamp(e: Escalation): string | null {
  if (e.status !== 'Closed') return null
  if (e.resolvedAt) return e.resolvedAt
  const log = e.auditLog ?? []
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i]
    if (!entry) continue
    const after = (entry as { after?: Record<string, unknown> }).after
    if (after && (after as { status?: string }).status === 'Closed') {
      return entry.timestamp
    }
  }
  if (log.length > 0) return log[log.length - 1]?.timestamp ?? null
  return null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export function computeEscalationsReport(
  args: EscalationsReportArgs,
): EscalationsReport {
  const { escalations, filters, now } = args
  const { from, to } = resolveReportWindow(filters)

  // Open matrix: every currently-open escalation, regardless of when
  // it was created (operational urgency). Dept filter still applies.
  const matrix = buildEmptyMatrix()
  for (const e of escalations) {
    if (e.status === 'Closed') continue
    if (!escalationDeptMatches(e, filters.dept)) continue
    const dept = deptOf(e)
    matrix.cells[dept][e.severity] += 1
    matrix.totalOpen += 1
  }

  // Closed resolution stats: window applies, dept filter applies.
  const closedDays: number[] = []
  for (const e of escalations) {
    if (e.status !== 'Closed') continue
    if (!escalationInWindow(e, from, to)) continue
    if (!escalationDeptMatches(e, filters.dept)) continue
    const closedTs = closedAtTimestamp(e)
    if (!closedTs) continue
    const created = new Date(e.createdAt).getTime()
    const closed = new Date(closedTs).getTime()
    if (Number.isNaN(created) || Number.isNaN(closed)) continue
    const days = (closed - created) / (1000 * 60 * 60 * 24)
    if (days < 0) continue
    closedDays.push(days)
  }
  const avg =
    closedDays.length > 0
      ? closedDays.reduce((s, n) => s + n, 0) / closedDays.length
      : null
  const med = median(closedDays)

  // Category breakdown.
  const catAcc = new Map<EscalationCategory, { open: number; closed: number }>()
  for (const c of CATEGORIES) catAcc.set(c, { open: 0, closed: 0 })
  for (const e of escalations) {
    if (!escalationDeptMatches(e, filters.dept)) continue
    const cat: EscalationCategory = e.category ?? 'Other'
    const slot = catAcc.get(cat)
    if (!slot) continue
    if (e.status === 'Closed') {
      if (escalationInWindow(e, from, to)) slot.closed += 1
    } else {
      slot.open += 1
    }
  }
  const categories: CategoryRow[] = CATEGORIES.map((c) => ({
    category: c,
    open: catAcc.get(c)!.open,
    closed: catAcc.get(c)!.closed,
  }))

  // Trending: current vs prior equal-length window. When no explicit
  // window is set, use the last 30 days vs the 30 before that.
  const currentFrom = from
  const currentTo = to
  let priorFrom: string | null = null
  let priorTo: string | null = null
  if (currentFrom && currentTo) {
    const ms = new Date(currentTo).getTime() - new Date(currentFrom).getTime()
    if (ms > 0) {
      const pf = new Date(new Date(currentFrom).getTime() - ms - 24 * 60 * 60 * 1000)
      const pt = new Date(new Date(currentFrom).getTime() - 24 * 60 * 60 * 1000)
      priorFrom = pf.toISOString().slice(0, 10)
      priorTo = pt.toISOString().slice(0, 10)
    }
  } else {
    // Fallback: last 30 vs previous 30 ending today.
    const today = now.toISOString().slice(0, 10)
    const thirtyMs = 30 * 24 * 60 * 60 * 1000
    const cFrom = new Date(now.getTime() - thirtyMs).toISOString().slice(0, 10)
    const pFrom = new Date(now.getTime() - 2 * thirtyMs).toISOString().slice(0, 10)
    const pTo = new Date(now.getTime() - thirtyMs - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    priorFrom = pFrom
    priorTo = pTo
    void today
    void cFrom
  }

  const currentByCat = new Map<EscalationCategory, number>()
  const priorByCat = new Map<EscalationCategory, number>()
  for (const c of CATEGORIES) {
    currentByCat.set(c, 0)
    priorByCat.set(c, 0)
  }

  const effectiveCurrentFrom = currentFrom
    ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const effectiveCurrentTo = currentTo ?? now.toISOString().slice(0, 10)

  for (const e of escalations) {
    if (!escalationDeptMatches(e, filters.dept)) continue
    const cat: EscalationCategory = e.category ?? 'Other'
    const iso = e.createdAt.slice(0, 10)
    if (isoInWindow(iso, effectiveCurrentFrom, effectiveCurrentTo)) {
      currentByCat.set(cat, (currentByCat.get(cat) ?? 0) + 1)
    }
    if (priorFrom && priorTo && isoInWindow(iso, priorFrom, priorTo)) {
      priorByCat.set(cat, (priorByCat.get(cat) ?? 0) + 1)
    }
  }

  const trendingAll: TrendRow[] = CATEGORIES.map((c) => {
    const cur = currentByCat.get(c) ?? 0
    const pri = priorByCat.get(c) ?? 0
    const delta = pri > 0 ? ((cur - pri) / pri) * 100 : cur > 0 ? null : 0
    return { category: c, current: cur, prior: pri, deltaPct: delta }
  })
  // Sort biggest % increase first (nulls = new categories ranked first
  // when cur>0); only surface positive trends, top 3.
  const trending = trendingAll
    .filter((t) => t.current > t.prior)
    .sort((a, b) => {
      const aV = a.deltaPct === null ? Infinity : a.deltaPct
      const bV = b.deltaPct === null ? Infinity : b.deltaPct
      return bV - aV
    })
    .slice(0, 3)

  return {
    matrix,
    resolution: {
      avgDays: avg,
      medianDays: med,
      count: closedDays.length,
    },
    categories,
    trending,
    windowFrom: from,
    windowTo: to,
  }
}

export function csvForEscalationsReport(args: EscalationsReportArgs): string {
  const r = computeEscalationsReport(args)
  const header = [
    'Section',
    'Key1',
    'Key2',
    'Open',
    'Closed',
    'Current',
    'Prior',
    'Delta %',
    'Days',
  ]
  const rows: Array<Array<string | number | null>> = []
  for (const dept of DEPTS) {
    for (const sev of SEVERITIES) {
      rows.push([
        'Matrix',
        dept,
        sev,
        r.matrix.cells[dept][sev],
        null,
        null,
        null,
        null,
        null,
      ])
    }
  }
  rows.push([
    'Resolution',
    'Avg',
    null,
    null,
    r.resolution.count,
    null,
    null,
    null,
    r.resolution.avgDays !== null ? Number(r.resolution.avgDays.toFixed(1)) : null,
  ])
  rows.push([
    'Resolution',
    'Median',
    null,
    null,
    r.resolution.count,
    null,
    null,
    null,
    r.resolution.medianDays !== null
      ? Number(r.resolution.medianDays.toFixed(1))
      : null,
  ])
  for (const c of r.categories) {
    rows.push([
      'Category',
      c.category,
      null,
      c.open,
      c.closed,
      null,
      null,
      null,
      null,
    ])
  }
  for (const t of r.trending) {
    rows.push([
      'Trending',
      t.category,
      null,
      null,
      null,
      t.current,
      t.prior,
      t.deltaPct !== null ? Number(t.deltaPct.toFixed(1)) : null,
      null,
    ])
  }
  return buildCsv(header, rows)
}
