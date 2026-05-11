/*
 * Consolidated landing data helpers (Gate 3.6 Step 5).
 *
 * Pure compute functions consumed by `/` (the consolidated landing).
 * No I/O, no React. Data files are passed in from the page so the
 * helpers stay testable. Reuses `leadershipData` helpers where the
 * computation is identical; everything else lives here.
 *
 * Five zones map to five compute groups:
 *   Zone 1: Commercial position    -> computeCommercialPosition
 *   Zone 2: Operational position   -> computeOperationalPosition
 *   Zone 3: Items requiring attention -> computeLandingAttention
 *   Zone 4: Quick actions          -> static action list
 *   Zone 5: Drill-down tile slices -> computeTileSlices
 *
 * All currency in rupees; no formatting here (formatRs lives in
 * src/lib/format.ts and renders at the surface).
 */

import type {
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
} from '@/lib/types'
import {
  fiscalYearOfIso,
  type MonthlyReceiptPoint,
} from './leadershipData'
import { bucketByStage, type LifecycleStage } from '@/lib/statusTracker'

// ===========================================================================
// Zone 1: Commercial position
// ===========================================================================

export interface CommercialPosition {
  /** Sum of contractValue across MOUs in the chosen FY. */
  signedContractValueFy: number
  /** Sum for the prior FY. */
  signedContractValuePriorFy: number
  /** YoY delta as a percentage; null if prior FY had no signed value. */
  signedContractValueDeltaPct: number | null
  /** Sum of receivedAmount across payments tied to chosen-FY MOUs. */
  receivedFy: number
  /** receivedFy / signedContractValueFy as a percentage. */
  collectionPct: number
  /** signedContractValueFy minus receivedFy, floored at zero. */
  outstanding: number
  /** Distinct schools with at least one Active MOU in the chosen FY. */
  activeSchools: number
  /** Monthly receipts over the trailing 12 months, oldest-first. */
  monthlyReceipts: MonthlyReceiptPoint[]
}

function priorFyLabel(fy: string): string | null {
  const m = fy.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const startYear = Number(m[1])
  const endShort = String(startYear % 100).padStart(2, '0')
  return `${startYear - 1}-${endShort}`
}

export function computeCommercialPosition(args: {
  mous: MOU[]
  payments: Payment[]
  fy: string
  now: Date
}): CommercialPosition {
  const { mous, payments, fy, now } = args
  const priorFy = priorFyLabel(fy)

  const fyMous = mous.filter((m) => m.academicYear === fy)
  const priorMous = priorFy
    ? mous.filter((m) => m.academicYear === priorFy)
    : []

  const signedContractValueFy = fyMous.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const signedContractValuePriorFy = priorMous.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const signedContractValueDeltaPct =
    signedContractValuePriorFy > 0
      ? ((signedContractValueFy - signedContractValuePriorFy) /
          signedContractValuePriorFy) *
        100
      : null

  const fyMouIds = new Set(fyMous.map((m) => m.id))
  const fyPayments = payments.filter((p) => fyMouIds.has(p.mouId))
  const receivedFy = fyPayments.reduce(
    (s, p) => s + (p.receivedAmount ?? 0),
    0,
  )
  const collectionPct =
    signedContractValueFy > 0 ? (receivedFy / signedContractValueFy) * 100 : 0
  const outstanding = Math.max(0, signedContractValueFy - receivedFy)

  const activeSchools = new Set(
    fyMous.filter((m) => m.status === 'Active').map((m) => m.schoolId),
  ).size

  const months: string[] = []
  const nowYear = now.getUTCFullYear()
  const nowMonth = now.getUTCMonth() // 0-indexed
  for (let i = 11; i >= 0; i--) {
    // Walk back i months from the current UTC month without relying on
    // local-time Date arithmetic (a local-tz constructor on UTC+x can
    // roll past midnight and shift the bucket label by a month).
    const totalMonths = nowYear * 12 + nowMonth - i
    const y = Math.floor(totalMonths / 12)
    const m = ((totalMonths % 12) + 12) % 12
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
  }
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]))
  for (const p of payments) {
    if (!p.receivedDate || !p.receivedAmount) continue
    const key = p.receivedDate.slice(0, 7)
    if (byMonth.has(key)) {
      byMonth.set(key, (byMonth.get(key) ?? 0) + p.receivedAmount)
    }
  }
  const monthlyReceipts: MonthlyReceiptPoint[] = months.map((m) => ({
    month: m,
    amount: byMonth.get(m) ?? 0,
  }))

  return {
    signedContractValueFy,
    signedContractValuePriorFy,
    signedContractValueDeltaPct,
    receivedFy,
    collectionPct,
    outstanding,
    activeSchools,
    monthlyReceipts,
  }
}

// ===========================================================================
// Zone 2: Operational position
// ===========================================================================

export interface OperationalPosition {
  /** Kit dispatches not yet Delivered. */
  activeDispatches: number
  /** Of those, count currently In Transit. */
  inTransit: number
  /** MOUs signed (Active) without a KitDispatch record or without
   *  any grade-wise allocation captured yet. */
  pendingAllocation: number
  /** Gate 4 Step 1: MOU counts by lifecycle stage (boardroom-level
   *  view of pipeline health). Replaces the old programme-wise
   *  breakdown on the landing Zone 2 first column. */
  byStage: Record<LifecycleStage, number>
}

export function computeOperationalPosition(args: {
  mous: MOU[]
  dispatches: KitDispatch[]
  payments: Payment[]
  now: Date
}): OperationalPosition {
  const { mous, dispatches, payments, now } = args

  const activeDispatchRecords = dispatches.filter(
    (d) => d.dispatchStatus !== 'Delivered',
  )
  const activeDispatches = activeDispatchRecords.length
  const inTransit = activeDispatchRecords.filter(
    (d) => d.dispatchStatus === 'In Transit',
  ).length

  // Pending allocation: an Active MOU that has no KitDispatch record OR
  // has a KitDispatch with zero allocation rows. The gradewiseDistribution
  // on the MOU itself is a Sales-time draft; the canonical allocation
  // lives on the KitDispatch.
  const mouIdsWithDispatch = new Set(dispatches.map((d) => d.mouId))
  const mouIdsWithAllocations = new Set(
    dispatches
      .filter((d) => (d.allocations?.length ?? 0) > 0)
      .map((d) => d.mouId),
  )
  let pendingAllocation = 0
  for (const m of mous) {
    if (m.status !== 'Active') continue
    if (!mouIdsWithDispatch.has(m.id) || !mouIdsWithAllocations.has(m.id)) {
      pendingAllocation += 1
    }
  }

  const byStage = bucketByStage({ mous, payments, dispatches, now })

  return {
    activeDispatches,
    inTransit,
    pendingAllocation,
    byStage,
  }
}

// ===========================================================================
// Zone 3: Items requiring attention (top 5)
// ===========================================================================

export type LandingAttentionSeverity = 'p0' | 'p1' | 'info'

export interface LandingAttentionItem {
  severity: LandingAttentionSeverity
  description: string
  href: string
  /** Hidden priority; lower number = higher priority. */
  priority: number
}

const HIGH_VALUE_OVERDUE_RS = 2_500_000 // Rs 25 lakh
const HIGH_VALUE_RECENT_RS = 5_000_000 // Rs 50 lakh

/**
 * Gate 4.7 Step 3: last-24h critical changes can interleave with
 * attention items at priority 1.5 (after P0 escalations, before
 * other attention items). The page composes the critical-changes
 * list separately and passes it in so this lib stays free of audit
 * log iteration.
 */
export interface LandingCriticalChange {
  description: string
  href: string
  timestamp: string
}

export function computeLandingAttention(args: {
  mous: MOU[]
  schools: School[]
  escalations: Escalation[]
  dispatches: KitDispatch[]
  payments: Payment[]
  now: Date
  /** Gate 4.7 Step 3: recent critical changes to interleave at priority 1.5. */
  recentCriticalChanges?: LandingCriticalChange[]
}): LandingAttentionItem[] {
  const {
    mous,
    schools,
    escalations,
    dispatches,
    payments,
    now,
    recentCriticalChanges = [],
  } = args
  const nowMs = now.getTime()
  const items: LandingAttentionItem[] = []
  const schoolNameById = new Map(schools.map((s) => [s.id, s.name]))
  const mouById = new Map(mous.map((m) => [m.id, m]))

  // Gate 4.7 Step 3: critical changes in the last 24h slot in at
  // priority 1.5 (between P0 escalations and the existing P1 items).
  // Sorted newest-first within the bucket so the top change wins ties.
  const sorted = [...recentCriticalChanges].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  )
  sorted.forEach((c, idx) => {
    items.push({
      severity: 'info',
      description: c.description,
      href: c.href,
      // Stagger priority within the bucket so newer changes outrank
      // older ones; cap below the P1 floor (priority 2).
      priority: 1.5 + idx * 0.001,
    })
  })

  // (1) Open P0 escalations.
  for (const e of escalations) {
    if (e.status === 'Closed') continue
    if (e.severity !== 'critical') continue
    const schoolName = schoolNameById.get(e.schoolId) ?? 'unknown school'
    items.push({
      severity: 'p0',
      description: `P0 escalation: ${schoolName}: ${e.description.slice(0, 80)}`,
      href: `/escalations/${e.id}`,
      priority: 1,
    })
  }

  // (2) High-value MOUs (Rs 25 lakh+) with payment overdue 30+ days.
  for (const p of payments) {
    if (p.status === 'Paid') continue
    if (!p.dueDateIso) continue
    const due = new Date(p.dueDateIso).getTime()
    if (Number.isNaN(due)) continue
    const daysOverdue = (nowMs - due) / (1000 * 60 * 60 * 24)
    if (daysOverdue <= 30) continue
    const mou = mouById.get(p.mouId)
    if (!mou || (mou.contractValue ?? 0) < HIGH_VALUE_OVERDUE_RS) continue
    const lakh = ((p.expectedAmount ?? 0) / 100000).toFixed(1)
    items.push({
      severity: 'p1',
      description: `${mou.schoolName}: payment overdue ${Math.floor(daysOverdue)} days, Rs ${lakh} lakh`,
      href: `/mous/${mou.id}`,
      priority: 2 + Math.max(0, 100 - Math.floor(daysOverdue) / 10),
    })
  }

  // (3) Dispatches stalled 14+ days at the same status.
  for (const d of dispatches) {
    if (d.dispatchStatus === 'Delivered') continue
    const lastTs = d.auditLog?.[d.auditLog.length - 1]?.timestamp ?? null
    if (!lastTs) continue
    const days = (nowMs - new Date(lastTs).getTime()) / (1000 * 60 * 60 * 24)
    if (days <= 14) continue
    items.push({
      severity: 'p1',
      description: `${d.schoolName}: dispatch stalled ${Math.floor(days)} days at ${d.dispatchStatus}`,
      href: `/dispatch/kits/${d.mouId}`,
      priority: 3 + Math.max(0, 100 - Math.floor(days) / 5),
    })
  }

  // (4) Schools idle 60+ days post-MOU-sign (Active MOUs).
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000
  for (const m of mous) {
    if (m.status !== 'Active') continue
    const lastAudit =
      m.auditLog?.[m.auditLog.length - 1]?.timestamp ?? m.startDate ?? null
    if (!lastAudit) continue
    const ts = new Date(lastAudit).getTime()
    if (Number.isNaN(ts)) continue
    if (nowMs - ts <= SIXTY_DAYS_MS) continue
    items.push({
      severity: 'p1',
      description: `${m.schoolName}: no activity ${Math.floor(
        (nowMs - ts) / (1000 * 60 * 60 * 24),
      )} days post-sign`,
      href: `/mous/${m.id}`,
      priority: 4,
    })
  }

  // (5) High-value MOU (Rs 50 lakh+) signed this week (informational).
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  for (const m of mous) {
    if ((m.contractValue ?? 0) < HIGH_VALUE_RECENT_RS) continue
    if (!m.generatedAt) continue
    const ts = new Date(m.generatedAt).getTime()
    if (Number.isNaN(ts)) continue
    if (nowMs - ts > SEVEN_DAYS_MS) continue
    const lakh = (m.contractValue / 100000).toFixed(0)
    items.push({
      severity: 'info',
      description: `${m.schoolName}: high-value MOU signed this week, Rs ${lakh} lakh`,
      href: `/mous/${m.id}`,
      priority: 5,
    })
  }

  // Sort by priority then by recency (description equality fallback) and
  // cap at 5 items. Lower priority value renders first.
  items.sort((a, b) => a.priority - b.priority)
  return items.slice(0, 5)
}

// ===========================================================================
// Zone 5: Drill-down tile slices
// ===========================================================================

export interface FinanceTileKpis {
  outstanding: number
  pisAwaitingPayment: number
  unmatchedPayments: number
}

export interface OpsTileKpis {
  activeDispatches: number
  pendingAllocation: number
  openEscalations: number
}

export interface LeadershipTileKpis {
  activeSchools: number
  collectionPct: number
  openP0Escalations: number
}

export function computeTileSlices(args: {
  mous: MOU[]
  payments: Payment[]
  paymentLogs: PaymentLog[]
  escalations: Escalation[]
  dispatches: KitDispatch[]
  commercial: CommercialPosition
  operational: OperationalPosition
}): {
  finance: FinanceTileKpis
  ops: OpsTileKpis
  leadership: LeadershipTileKpis
} {
  const { payments, paymentLogs, escalations, commercial, operational } = args

  const outstanding = commercial.outstanding
  const pisAwaitingPayment = payments.filter(
    (p) => p.piGeneratedAt !== null && p.receivedDate === null,
  ).length
  const unmatchedPayments = paymentLogs.filter(
    (pl) => pl.unmatched || (pl.matchedInstallmentIds ?? []).length === 0,
  ).length

  const openEscalations = escalations.filter((e) => e.status !== 'Closed').length
  const openP0Escalations = escalations.filter(
    (e) => e.status !== 'Closed' && e.severity === 'critical',
  ).length

  return {
    finance: {
      outstanding,
      pisAwaitingPayment,
      unmatchedPayments,
    },
    ops: {
      activeDispatches: operational.activeDispatches,
      pendingAllocation: operational.pendingAllocation,
      openEscalations,
    },
    leadership: {
      activeSchools: commercial.activeSchools,
      collectionPct: commercial.collectionPct,
      openP0Escalations,
    },
  }
}

// ===========================================================================
// Misc helpers
// ===========================================================================

/**
 * Resolves the current Indian fiscal year for "today". Wraps the
 * leadershipData helper so callers do not need to import both files.
 */
export function currentFiscalYear(now: Date): string {
  return fiscalYearOfIso(now.toISOString()) ?? '2026-27'
}
