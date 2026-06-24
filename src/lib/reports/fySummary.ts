/*
 * FY summary report compute + CSV (Gate 5A Step 1).
 *
 * Headline FY-level numbers, programme breakdown, last-12-months
 * monthly receipts, and YoY signed-value comparison.
 *
 * The MOU window check is overlap-based when explicit from/to are
 * set; FY-only filtering uses academicYear equality (consistent with
 * leadershipData.computeFinancialHealth).
 */

import type { KitDispatch, MOU, Payment, Programme, School } from '@/lib/types'
import { priorFy } from '@/lib/dashboard/leadershipData'
import { buildCsv } from './csv'
import type { ReportFilters } from './filters'
import { isoInWindow, resolveReportWindow } from './filters'

const PROGRAMME_ORDER: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
]

export interface FyHeadline {
  signedContractValue: number
  received: number
  outstanding: number
  mouCount: number
  schoolCount: number
  dispatchCount: number
}

export interface FyProgrammeRow {
  programme: Programme
  mouCount: number
  studentsActual: number
  contractValue: number
  received: number
  outstanding: number
  receivedPct: number
}

export interface FyMonthlyPoint {
  month: string
  amount: number
}

export interface FyYoYRow {
  priorFy: string | null
  priorSigned: number
  currentSigned: number
  deltaPct: number | null
}

export interface FySummaryArgs {
  mous: MOU[]
  payments: Payment[]
  dispatches: KitDispatch[]
  schools: School[]
  filters: ReportFilters
  now: Date
}

export interface FySummary {
  headline: FyHeadline
  programmes: FyProgrammeRow[]
  monthlyReceipts: FyMonthlyPoint[]
  yoy: FyYoYRow
  windowFrom: string | null
  windowTo: string | null
  effectiveFy: string | null
}

function mouInWindow(
  m: MOU,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true
  const s = m.startDate ?? null
  const e = m.endDate ?? null
  if (!s && !e) return false
  if (to && s && s > to) return false
  if (from && e && e < from) return false
  return true
}

function scopeMous(args: FySummaryArgs): MOU[] {
  const { mous, filters } = args
  // Explicit from/to wins; otherwise FY uses academicYear equality
  // (consistent with leadershipData.computeFinancialHealth).
  if (filters.from || filters.to) {
    const { from, to } = resolveReportWindow(filters)
    return mous.filter((m) => mouInWindow(m, from, to))
  }
  if (filters.fy) return mous.filter((m) => m.academicYear === filters.fy)
  return mous
}

export function computeFySummary(args: FySummaryArgs): FySummary {
  const { mous, payments, dispatches, filters, now } = args
  void args.schools // schools used only for school-count derivation via mou.schoolId
  const { from, to } = resolveReportWindow(filters)

  const scoped = scopeMous(args)
  const scopedIds = new Set(scoped.map((m) => m.id))

  const signedContractValue = scoped.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const scopedPayments = payments.filter((p) => scopedIds.has(p.mouId))
  const received = scopedPayments.reduce(
    (s, p) => s + (p.receivedAmount ?? 0),
    0,
  )
  const outstanding = Math.max(0, signedContractValue - received)
  const schoolCount = new Set(scoped.map((m) => m.schoolId)).size

  const scopedDispatches = dispatches.filter((d) => scopedIds.has(d.mouId))

  const headline: FyHeadline = {
    signedContractValue,
    received,
    outstanding,
    mouCount: scoped.length,
    schoolCount,
    dispatchCount: scopedDispatches.length,
  }

  // Programme breakdown. Keyed by string to tolerate registry product names
  // beyond the canonical four (MOU.programme widened to string); only the four
  // canonical rows are pre-seeded and reported, so behaviour is unchanged.
  const progMap = new Map<
    string,
    {
      mouCount: number
      students: number
      value: number
      received: number
    }
  >()
  for (const p of PROGRAMME_ORDER) {
    progMap.set(p, { mouCount: 0, students: 0, value: 0, received: 0 })
  }
  for (const m of scoped) {
    const slot = progMap.get(m.programme)
    if (!slot) continue
    slot.mouCount += 1
    slot.students += m.studentsActual ?? m.studentsMou ?? 0
    slot.value += m.contractValue ?? 0
  }
  for (const p of scopedPayments) {
    const mou = scoped.find((m) => m.id === p.mouId)
    if (!mou) continue
    const slot = progMap.get(mou.programme)
    if (!slot) continue
    slot.received += p.receivedAmount ?? 0
  }
  const programmes: FyProgrammeRow[] = PROGRAMME_ORDER.map((p) => {
    const slot = progMap.get(p)!
    const out = Math.max(0, slot.value - slot.received)
    const pct = slot.value > 0 ? (slot.received / slot.value) * 100 : 0
    return {
      programme: p,
      mouCount: slot.mouCount,
      studentsActual: slot.students,
      contractValue: slot.value,
      received: slot.received,
      outstanding: out,
      receivedPct: pct,
    }
  })

  // Monthly receipts: 12-month rolling oldest-first.
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    )
    months.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    )
  }
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]))
  for (const p of payments) {
    if (!p.receivedDate || !p.receivedAmount) continue
    const month = p.receivedDate.slice(0, 7)
    if (byMonth.has(month)) {
      byMonth.set(month, (byMonth.get(month) ?? 0) + p.receivedAmount)
    }
  }
  const monthlyReceipts: FyMonthlyPoint[] = months.map((m) => ({
    month: m,
    amount: byMonth.get(m) ?? 0,
  }))

  // YoY comparison: only meaningful when filters.fy is set.
  const fy = filters.fy
  const priorLabel = fy ? priorFy(fy) : null
  const priorMous = priorLabel
    ? mous.filter((m) => m.academicYear === priorLabel)
    : []
  const priorSigned = priorMous.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const currentSigned = fy ? signedContractValue : 0
  const deltaPct =
    priorSigned > 0 ? ((currentSigned - priorSigned) / priorSigned) * 100 : null

  return {
    headline,
    programmes,
    monthlyReceipts,
    yoy: { priorFy: priorLabel, priorSigned, currentSigned, deltaPct },
    windowFrom: from,
    windowTo: to,
    effectiveFy: fy,
  }
}

export function csvForFySummary(args: FySummaryArgs): string {
  const r = computeFySummary(args)
  const header = [
    'Section',
    'Programme',
    'MOU count',
    'Students',
    'Contract value',
    'Received',
    'Outstanding',
    '% Received',
  ]
  const rows: Array<Array<string | number | null>> = []
  rows.push([
    'Headline',
    'All',
    r.headline.mouCount,
    null,
    r.headline.signedContractValue,
    r.headline.received,
    r.headline.outstanding,
    r.headline.signedContractValue > 0
      ? Number(
          ((r.headline.received / r.headline.signedContractValue) * 100).toFixed(2),
        )
      : 0,
  ])
  for (const p of r.programmes) {
    rows.push([
      'Programme',
      p.programme,
      p.mouCount,
      p.studentsActual,
      p.contractValue,
      p.received,
      p.outstanding,
      Number(p.receivedPct.toFixed(2)),
    ])
  }
  for (const m of r.monthlyReceipts) {
    rows.push(['Monthly receipts', m.month, null, null, null, m.amount, null, null])
  }
  if (r.yoy.priorFy) {
    rows.push([
      'YoY',
      r.yoy.priorFy,
      null,
      null,
      r.yoy.priorSigned,
      null,
      null,
      null,
    ])
    rows.push([
      'YoY',
      args.filters.fy ?? 'current',
      null,
      null,
      r.yoy.currentSigned,
      null,
      null,
      r.yoy.deltaPct !== null ? Number(r.yoy.deltaPct.toFixed(2)) : null,
    ])
  }
  // Use payments to satisfy lint when payments unused inside CSV branches.
  void args.payments
  // Helper called for side effect: use ignoreUnused param.
  void isoInWindow
  return buildCsv(header, rows)
}
