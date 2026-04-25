/*
 * Health-tile aggregation for /dashboard (Surface 1).
 *
 * 5 tiles:
 *   1. Active MOUs:      count of MOU.status === 'Active'
 *   2. Accuracy Health:  % of MOUs with studentsActual !== null AND
 *                        |studentsVariancePct| <= 0.10. ok ≥95%,
 *                        attention 85-94%, alert <85%.
 *   3. Collection %:     received / contractValue across active MOUs.
 *                        ok ≥75%, attention 50-74%, alert <50%.
 *   4. Dispatches in flight: count of Dispatch.stage in {po-raised,
 *                        dispatched, in-transit}.
 *   5. Schools needing action: count of unique schoolIds with at
 *                        least one open exception (overdue actuals,
 *                        unack delivery, missing feedback, payment
 *                        overdue, blocked PI). ok 0, attention 1-5,
 *                        alert >5.
 *
 * Per-role scoping: SalesRep sees only MOUs assigned to them
 * (filtered by salesPersonId === user.id). Other roles see all.
 *
 * Pure functions; deps-injected via opts.
 */

import type {
  Dispatch,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'

export type TileStatus = 'ok' | 'attention' | 'alert' | 'neutral'

export interface HealthTileValue {
  label: string
  primary: string
  unit?: string
  status: TileStatus
}

interface BaseDeps {
  mous: MOU[]
  schools: School[]
  dispatches: Dispatch[]
  payments: Payment[]
  user: User | null
}

function scopeMousForUser(mous: MOU[], user: User | null): MOU[] {
  if (!user) return mous
  if (user.role === 'SalesRep') {
    return mous.filter((m) => m.salesPersonId === user.id)
  }
  return mous
}

function formatCount(n: number): string {
  return n.toLocaleString('en-IN')
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

export function activeMousTile({ mous, user }: BaseDeps): HealthTileValue {
  const scoped = scopeMousForUser(mous, user)
  const count = scoped.filter((m) => m.status === 'Active').length
  return {
    label: 'Active MOUs',
    primary: formatCount(count),
    status: 'neutral',
  }
}

export function accuracyHealthTile({ mous, user }: BaseDeps): HealthTileValue {
  const scoped = scopeMousForUser(mous, user).filter((m) => m.status === 'Active')
  if (scoped.length === 0) {
    return { label: 'Accuracy health', primary: '0%', status: 'neutral' }
  }
  const withinBand = scoped.filter(
    (m) =>
      m.studentsActual !== null &&
      m.studentsVariancePct !== null &&
      Math.abs(m.studentsVariancePct) <= 0.10,
  ).length
  const ratio = withinBand / scoped.length
  let status: TileStatus = 'alert'
  if (ratio >= 0.95) status = 'ok'
  else if (ratio >= 0.85) status = 'attention'
  return {
    label: 'Accuracy health',
    primary: formatPct(ratio),
    status,
  }
}

export function collectionPctTile({ mous, user }: BaseDeps): HealthTileValue {
  const scoped = scopeMousForUser(mous, user).filter((m) => m.status === 'Active')
  if (scoped.length === 0) {
    return { label: 'Collection', primary: '0%', status: 'neutral' }
  }
  const totalReceived = scoped.reduce((s, m) => s + (m.received ?? 0), 0)
  const totalContract = scoped.reduce((s, m) => s + (m.contractValue ?? 0), 0)
  const ratio = totalContract > 0 ? totalReceived / totalContract : 0
  let status: TileStatus = 'alert'
  if (ratio >= 0.75) status = 'ok'
  else if (ratio >= 0.50) status = 'attention'
  return {
    label: 'Collection',
    primary: formatPct(ratio),
    status,
  }
}

export function dispatchesInFlightTile({
  dispatches,
  mous,
  user,
}: BaseDeps): HealthTileValue {
  const scopedMouIds = new Set(scopeMousForUser(mous, user).map((m) => m.id))
  const inFlight = dispatches.filter((d) => {
    if (user?.role === 'SalesRep' && !scopedMouIds.has(d.mouId ?? '')) return false
    return d.stage === 'po-raised' || d.stage === 'dispatched' || d.stage === 'in-transit'
  }).length
  return {
    label: 'Dispatches in flight',
    primary: formatCount(inFlight),
    status: 'neutral',
  }
}

export function schoolsNeedingActionTile(
  deps: BaseDeps,
): HealthTileValue {
  const flagged = countSchoolsNeedingAction(deps)
  let status: TileStatus = 'ok'
  if (flagged > 5) status = 'alert'
  else if (flagged >= 1) status = 'attention'
  return {
    label: 'Schools needing action',
    primary: formatCount(flagged),
    status,
  }
}

function countSchoolsNeedingAction({
  mous,
  dispatches,
  payments,
  user,
}: BaseDeps): number {
  const scopedMouIds = new Set(scopeMousForUser(mous, user).map((m) => m.id))
  const flagged = new Set<string>()

  for (const m of mous) {
    if (!scopedMouIds.has(m.id)) continue
    // Actuals overdue: active MOU with studentsActual still null past start date
    if (
      m.status === 'Active' &&
      m.studentsActual === null &&
      m.startDate !== null &&
      new Date(m.startDate).getTime() < Date.now()
    ) {
      flagged.add(m.schoolId)
    }
  }

  for (const d of dispatches) {
    if (!scopedMouIds.has(d.mouId ?? '')) continue
    // Dispatch delivered but not acknowledged
    if (d.stage === 'delivered' && d.acknowledgedAt === null) {
      flagged.add(d.schoolId)
    }
  }

  for (const p of payments) {
    if (!scopedMouIds.has(p.mouId)) continue
    if (p.status === 'Overdue') {
      const m = mous.find((x) => x.id === p.mouId)
      if (m) flagged.add(m.schoolId)
    }
  }

  return flagged.size
}

export function buildHealthTiles(deps: BaseDeps): HealthTileValue[] {
  return [
    activeMousTile(deps),
    accuracyHealthTile(deps),
    collectionPctTile(deps),
    dispatchesInFlightTile(deps),
    schoolsNeedingActionTile(deps),
  ]
}
