/*
 * Dispatch performance report compute + CSV (Gate 5A Step 1).
 *
 * Turnaround analytics over KitDispatch:
 *   - Avg days from MOU signed (mou.startDate) -> dispatch created
 *     (kitDispatch.createdAt).
 *   - Avg days from dispatch raised -> Delivered (POD upload audit
 *     entry or status flip to 'Delivered').
 *   - Stalled dispatches: > 14 days since last audit timestamp, NOT
 *     Delivered.
 *
 * Programme attribution comes from the parent MOU lookup.
 */

import type { KitDispatch, MOU, Programme } from '@/lib/types'
import { buildCsv } from './csv'
import type { ReportFilters } from './filters'
import { isoInWindow, resolveReportWindow } from './filters'

const PROGRAMME_ORDER: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
]

const STALLED_THRESHOLD_DAYS = 14

function daysBetween(a: string, b: string): number | null {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return (tb - ta) / (1000 * 60 * 60 * 24)
}

function lastAuditTs(d: KitDispatch): string | null {
  const log = d.auditLog ?? []
  if (log.length === 0) return d.createdAt ?? null
  return log[log.length - 1]?.timestamp ?? d.createdAt ?? null
}

function deliveredAuditTs(d: KitDispatch): string | null {
  const log = d.auditLog ?? []
  // Scan oldest -> newest; first entry that lands the dispatch in
  // 'Delivered' wins. Audit action verbs vary so we look at the
  // `after.dispatchStatus` field where present, then fall back to
  // the last audit entry timestamp when the dispatch is already
  // Delivered.
  for (const e of log) {
    const after = (e as { after?: Record<string, unknown> }).after
    if (after && (after as { dispatchStatus?: string }).dispatchStatus === 'Delivered') {
      return e.timestamp
    }
  }
  if (d.dispatchStatus === 'Delivered') {
    return lastAuditTs(d)
  }
  return null
}

export interface DispatchHeadline {
  avgDaysSignToDispatch: number | null
  avgDaysDispatchToDelivered: number | null
  dispatchCount: number
  deliveredCount: number
}

export interface DispatchProgrammeRow {
  programme: Programme
  count: number
  avgDaysSignToDispatch: number | null
  avgDaysDispatchToDelivered: number | null
}

export interface StalledDispatchRow {
  dispatchId: string
  mouId: string
  schoolName: string
  dispatchStatus: KitDispatch['dispatchStatus']
  daysAtStatus: number
  lastActivity: string | null
}

export interface DispatchPerformance {
  headline: DispatchHeadline
  programmes: DispatchProgrammeRow[]
  stalled: StalledDispatchRow[]
  windowFrom: string | null
  windowTo: string | null
}

export interface DispatchPerformanceArgs {
  dispatches: KitDispatch[]
  mous: MOU[]
  filters: ReportFilters
  now: Date
}

function dispatchInWindow(
  d: KitDispatch,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true
  if (!d.createdAt) return false
  const iso = d.createdAt.slice(0, 10)
  return isoInWindow(iso, from, to)
}

export function computeDispatchPerformance(
  args: DispatchPerformanceArgs,
): DispatchPerformance {
  const { dispatches, mous, filters, now } = args
  const { from, to } = resolveReportWindow(filters)
  const mouById = new Map(mous.map((m) => [m.id, m]))

  // Scope dispatches: window via createdAt, OR FY via parent MOU
  // academicYear when no explicit window.
  const scoped = dispatches.filter((d) => {
    if (filters.from || filters.to) return dispatchInWindow(d, from, to)
    if (filters.fy) {
      const m = mouById.get(d.mouId)
      return m?.academicYear === filters.fy
    }
    return true
  })

  let signToDispatchSum = 0
  let signToDispatchCount = 0
  let dispatchToDeliveredSum = 0
  let dispatchToDeliveredCount = 0
  let deliveredCount = 0

  const progAcc = new Map<
    Programme,
    {
      count: number
      sSum: number
      sCount: number
      dSum: number
      dCount: number
    }
  >()
  for (const p of PROGRAMME_ORDER) {
    progAcc.set(p, { count: 0, sSum: 0, sCount: 0, dSum: 0, dCount: 0 })
  }

  for (const d of scoped) {
    const m = mouById.get(d.mouId)
    const prog = m?.programme ?? null
    const progSlot = prog ? progAcc.get(prog) : null
    if (progSlot) progSlot.count += 1

    if (m?.startDate && d.createdAt) {
      const days = daysBetween(m.startDate, d.createdAt)
      if (days !== null && days >= 0) {
        signToDispatchSum += days
        signToDispatchCount += 1
        if (progSlot) {
          progSlot.sSum += days
          progSlot.sCount += 1
        }
      }
    }

    if (d.dispatchStatus === 'Delivered') deliveredCount += 1
    const deliveredAt = deliveredAuditTs(d)
    if (d.createdAt && deliveredAt) {
      const days = daysBetween(d.createdAt, deliveredAt)
      if (days !== null && days >= 0) {
        dispatchToDeliveredSum += days
        dispatchToDeliveredCount += 1
        if (progSlot) {
          progSlot.dSum += days
          progSlot.dCount += 1
        }
      }
    }
  }

  const headline: DispatchHeadline = {
    avgDaysSignToDispatch:
      signToDispatchCount > 0 ? signToDispatchSum / signToDispatchCount : null,
    avgDaysDispatchToDelivered:
      dispatchToDeliveredCount > 0
        ? dispatchToDeliveredSum / dispatchToDeliveredCount
        : null,
    dispatchCount: scoped.length,
    deliveredCount,
  }

  const programmes: DispatchProgrammeRow[] = PROGRAMME_ORDER.map((p) => {
    const slot = progAcc.get(p)!
    return {
      programme: p,
      count: slot.count,
      avgDaysSignToDispatch: slot.sCount > 0 ? slot.sSum / slot.sCount : null,
      avgDaysDispatchToDelivered: slot.dCount > 0 ? slot.dSum / slot.dCount : null,
    }
  })

  // Stalled list: every dispatch (not just scoped) is candidate;
  // include the dispatch when last activity > threshold days ago AND
  // status is not Delivered. Stalled is operational urgency so we do
  // NOT date-scope it; users want to see active rot regardless of
  // when the dispatch was raised.
  const nowMs = now.getTime()
  const stalled: StalledDispatchRow[] = []
  for (const d of dispatches) {
    if (d.dispatchStatus === 'Delivered') continue
    const last = lastAuditTs(d)
    if (!last) continue
    const lastMs = new Date(last).getTime()
    if (Number.isNaN(lastMs)) continue
    const daysAt = (nowMs - lastMs) / (1000 * 60 * 60 * 24)
    if (daysAt <= STALLED_THRESHOLD_DAYS) continue
    stalled.push({
      dispatchId: d.id,
      mouId: d.mouId,
      schoolName: d.schoolName,
      dispatchStatus: d.dispatchStatus,
      daysAtStatus: Math.floor(daysAt),
      lastActivity: last,
    })
  }
  stalled.sort((a, b) => b.daysAtStatus - a.daysAtStatus)

  return {
    headline,
    programmes,
    stalled,
    windowFrom: from,
    windowTo: to,
  }
}

export function csvForDispatchPerformance(args: DispatchPerformanceArgs): string {
  const r = computeDispatchPerformance(args)
  const header = [
    'Section',
    'Key',
    'Count',
    'Avg days sign-to-dispatch',
    'Avg days dispatch-to-delivered',
    'Delivered count',
    'Days at status',
    'Last activity',
    'Dispatch status',
  ]
  const rows: Array<Array<string | number | null>> = []
  rows.push([
    'Headline',
    'All',
    r.headline.dispatchCount,
    r.headline.avgDaysSignToDispatch !== null
      ? Number(r.headline.avgDaysSignToDispatch.toFixed(1))
      : null,
    r.headline.avgDaysDispatchToDelivered !== null
      ? Number(r.headline.avgDaysDispatchToDelivered.toFixed(1))
      : null,
    r.headline.deliveredCount,
    null,
    null,
    null,
  ])
  for (const p of r.programmes) {
    rows.push([
      'Programme',
      p.programme,
      p.count,
      p.avgDaysSignToDispatch !== null
        ? Number(p.avgDaysSignToDispatch.toFixed(1))
        : null,
      p.avgDaysDispatchToDelivered !== null
        ? Number(p.avgDaysDispatchToDelivered.toFixed(1))
        : null,
      null,
      null,
      null,
      null,
    ])
  }
  for (const s of r.stalled) {
    rows.push([
      'Stalled',
      `${s.schoolName} (${s.mouId})`,
      null,
      null,
      null,
      null,
      s.daysAtStatus,
      s.lastActivity,
      s.dispatchStatus,
    ])
  }
  return buildCsv(header, rows)
}
