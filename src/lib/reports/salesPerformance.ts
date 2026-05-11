/*
 * Sales performance report compute + CSV (Gate 5A Step 1).
 *
 * Per-rep MOU count, total contract value, average MOU size, average
 * payment lag (days between PI generation and first receipt). Top 5
 * + bottom 5 derive from the same per-rep aggregate.
 */

import type { MOU, Payment } from '@/lib/types'
import { buildCsv } from './csv'
import type { ReportFilters } from './filters'
import { resolveReportWindow } from './filters'

interface SalesTeamLike {
  id: string
  name: string
  email?: string
  active?: boolean
}

export interface SalesPerformanceRow {
  repId: string
  repName: string
  mouCount: number
  totalContractValue: number
  averageMouSize: number
  averagePaymentLagDays: number | null
}

export interface SalesPerformance {
  rows: SalesPerformanceRow[]
  top5: SalesPerformanceRow[]
  bottom5: SalesPerformanceRow[]
  windowFrom: string | null
  windowTo: string | null
}

export interface SalesPerformanceArgs {
  mous: MOU[]
  payments: Payment[]
  salesTeam: SalesTeamLike[]
  filters: ReportFilters
  now: Date
}

function mouOverlapsWindow(
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

function daysBetween(a: string, b: string): number | null {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.floor((tb - ta) / (1000 * 60 * 60 * 24))
}

export function computeSalesPerformance(
  args: SalesPerformanceArgs,
): SalesPerformance {
  const { mous, payments, salesTeam, filters } = args
  const { from, to } = resolveReportWindow(filters)

  // Scope MOUs by window OR by FY (academicYear equality when no explicit window).
  const scoped = mous.filter((m) => {
    if (filters.from || filters.to) return mouOverlapsWindow(m, from, to)
    if (filters.fy) return m.academicYear === filters.fy
    return true
  })

  // Build payment lookup keyed by MOU id.
  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of payments) {
    const arr = paymentsByMou.get(p.mouId) ?? []
    arr.push(p)
    paymentsByMou.set(p.mouId, arr)
  }

  // Aggregate per rep id.
  const byRep = new Map<
    string,
    {
      mouCount: number
      total: number
      lagSum: number
      lagCount: number
    }
  >()
  for (const m of scoped) {
    const rid = m.salesPersonId ?? 'unassigned'
    const slot = byRep.get(rid) ?? { mouCount: 0, total: 0, lagSum: 0, lagCount: 0 }
    slot.mouCount += 1
    slot.total += m.contractValue ?? 0
    const ps = paymentsByMou.get(m.id) ?? []
    for (const p of ps) {
      if (!p.piGeneratedAt || !p.receivedDate) continue
      const d = daysBetween(p.piGeneratedAt, p.receivedDate)
      if (d === null || d < 0) continue
      slot.lagSum += d
      slot.lagCount += 1
    }
    byRep.set(rid, slot)
  }

  // Name lookup for repId -> name; reps in sales_team.json + unassigned bucket.
  const nameById = new Map<string, string>()
  for (const r of salesTeam) nameById.set(r.id, r.name)

  const rows: SalesPerformanceRow[] = Array.from(byRep.entries())
    .map(([repId, slot]) => ({
      repId,
      repName: repId === 'unassigned' ? 'Unassigned' : nameById.get(repId) ?? repId,
      mouCount: slot.mouCount,
      totalContractValue: slot.total,
      averageMouSize: slot.mouCount > 0 ? slot.total / slot.mouCount : 0,
      averagePaymentLagDays:
        slot.lagCount > 0 ? slot.lagSum / slot.lagCount : null,
    }))
    .sort((a, b) => b.totalContractValue - a.totalContractValue)

  // Top 5 + bottom 5 exclude reps with 0 MOUs at bottom (per brief).
  const top5 = rows.slice(0, 5)
  const bottom5 = rows
    .filter((r) => r.mouCount > 0)
    .slice()
    .sort((a, b) => a.totalContractValue - b.totalContractValue)
    .slice(0, 5)

  return { rows, top5, bottom5, windowFrom: from, windowTo: to }
}

export function csvForSalesPerformance(args: SalesPerformanceArgs): string {
  const r = computeSalesPerformance(args)
  const header = [
    'Rep ID',
    'Rep name',
    'MOUs signed',
    'Total contract value',
    'Average MOU size',
    'Average payment lag (days)',
  ]
  const rows: Array<Array<string | number | null>> = r.rows.map((row) => [
    row.repId,
    row.repName,
    row.mouCount,
    row.totalContractValue,
    Math.round(row.averageMouSize),
    row.averagePaymentLagDays !== null
      ? Number(row.averagePaymentLagDays.toFixed(1))
      : null,
  ])
  return buildCsv(header, rows)
}
