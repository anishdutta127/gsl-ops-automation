/*
 * Sales-person KPI helpers.
 *
 * Pure functions over the typed data snapshots in src/data/*.json.
 * Consumers (Sales Team pages, Console rules) pass the arrays they
 * already loaded; these helpers do no IO.
 */

import type { MOU, Payment, SalesPerson } from './types'

export interface SalesPersonKpis {
  salesPersonId: string
  activeMouCount: number
  pipelineValue: number             // contractValue sum across active + pending
  collectedValue: number            // received sum
  collectionRate: number            // 0-100
  overdueCount: number              // payments with status Overdue
  trend: number[]                   // last 3 months collection amount, oldest first
}

export interface UnassignedKpis {
  unassignedCount: number           // MOUs with salesPersonId === null
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)             // "2026-03"
}

function lastThreeMonthKeys(today: Date): string[] {
  const out: string[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    out.push(
      `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}`,
    )
  }
  return out
}

export function computeSalesPersonKpis(
  salesPersonId: string,
  mous: MOU[],
  payments: Payment[],
  today: Date = new Date(),
): SalesPersonKpis {
  const owned = mous.filter((m) => m.salesPersonId === salesPersonId)
  const active = owned.filter((m) => m.status === 'Active' || m.status === 'Pending Signature')
  const ownedIds = new Set(owned.map((m) => m.id))

  const pipeline = active.reduce((s, m) => s + (m.contractValue || 0), 0)
  const collected = owned.reduce((s, m) => s + (m.received || 0), 0)
  const rate = pipeline > 0 ? Math.round((collected / pipeline) * 100) : 0

  const ownedPayments = payments.filter((p) => ownedIds.has(p.mouId))
  const overdue = ownedPayments.filter((p) => p.status === 'Overdue').length

  const months = lastThreeMonthKeys(today)
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]))
  for (const p of ownedPayments) {
    if (!p.receivedDate || !p.receivedAmount) continue
    const key = monthKey(p.receivedDate)
    if (byMonth.has(key)) {
      byMonth.set(key, (byMonth.get(key) ?? 0) + p.receivedAmount)
    }
  }

  return {
    salesPersonId,
    activeMouCount: active.length,
    pipelineValue: Math.round(pipeline),
    collectedValue: Math.round(collected),
    collectionRate: rate,
    overdueCount: overdue,
    trend: months.map((m) => Math.round(byMonth.get(m) ?? 0)),
  }
}

export function countUnassigned(mous: MOU[]): number {
  return mous.filter((m) => m.salesPersonId == null).length
}

export function rankLeaderboard(
  salesTeam: SalesPerson[],
  mous: MOU[],
  payments: Payment[],
  today: Date = new Date(),
): Array<SalesPerson & { kpis: SalesPersonKpis }> {
  const enriched = salesTeam.map((sp) => ({
    ...sp,
    kpis: computeSalesPersonKpis(sp.id, mous, payments, today),
  }))
  return enriched.sort((a, b) => {
    // Active people first, then by collectionRate desc, then by pipeline desc
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.kpis.collectionRate !== b.kpis.collectionRate) {
      return b.kpis.collectionRate - a.kpis.collectionRate
    }
    return b.kpis.pipelineValue - a.kpis.pipelineValue
  })
}
