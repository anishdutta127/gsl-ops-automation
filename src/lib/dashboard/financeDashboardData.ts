/*
 * Finance dashboard data helpers (Gate 4.95 Step 2 + 2.5).
 *
 * Pure compute functions consumed by /dashboard/finance and its
 * drilldown surfaces (/finance/schools-receipts, /finance/receipts).
 * No I/O, no React. Data files are passed in from the page so the
 * helpers stay testable.
 *
 * Sections this lib powers (in dashboard render order):
 *   Row 1: KPI strip               -> computeKpiStrip
 *   Row 2: High-priority alerts    -> computeHighPriorityAlerts
 *   Row 3.5 L: Top overdue         -> computeTopOverduePayments
 *   Row 3.5 R: Renewal needed      -> computeRenewalNeeded
 *   Row 4: Amount Receipt Summary  -> computeAmountReceiptSummary
 *   Row 5: VEX Kit Orders          -> computeVexKitOrders
 *   Row 6: Programme breakdown     -> computeProgrammeBreakdown
 *
 * Plus filter parsing:
 *   parseFinanceFilters - reads URL search params into FinanceFilters
 *   applyFilters        - applies the filter to mous + payments
 *
 * VEX filter semantics (per Anish, Gate 4.95 Session 2 decision):
 *   The VEX chip is one filter criterion from the user's perspective,
 *   wired as Programme==='VEX' OR productSelection==='VEX'. Neither
 *   value is in the current Programme / ProductSelection enums; the
 *   union check is forward-compatible so the chip starts working when
 *   the enums widen, without further code changes.
 *
 * All currency in rupees; formatting happens at the surface
 * (formatRs in src/lib/format.ts).
 */

import type {
  Escalation,
  MOU,
  Payment,
  Programme,
  School,
  VexDispatch,
  VexPi,
} from '@/lib/types'
import type { SalesChannel } from '@/lib/mouSystem/types'
import { fiscalYearOfIso, priorFy } from './leadershipData'

// ===========================================================================
// Filter parsing + application
// ===========================================================================

/** Programmes available in the filter chip row. VEX widens the canonical
 *  4-value Programme enum because the dashboard surfaces VEX as a
 *  revenue line even though VEX data lives outside the Programme enum. */
export type FinanceFilterProgramme = Programme | 'VEX'

export const FINANCE_FILTER_PROGRAMMES: ReadonlyArray<FinanceFilterProgramme> =
  ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics', 'VEX']

export const FINANCE_FILTER_SALES_CHANNELS: ReadonlyArray<SalesChannel> = [
  'School Programs (Course)',
  'Bootcamps',
  'Partnerships - Govt Projects',
  'Others',
]

export interface FinanceFilters {
  /** Selected programme chips; empty = all programmes. */
  programmes: FinanceFilterProgramme[]
  /** Selected sales channel chips; empty = all channels. */
  salesChannels: SalesChannel[]
  /** Indian FY label e.g. '2026-27'; null = no FY filter (uses from/to or all). */
  fy: string | null
  /** ISO yyyy-mm-dd; overrides FY's auto-window when set. */
  from: string | null
  /** ISO yyyy-mm-dd; overrides FY's auto-window when set. */
  to: string | null
}

export const EMPTY_FILTERS: FinanceFilters = {
  programmes: [],
  salesChannels: [],
  fy: null,
  from: null,
  to: null,
}

function parseIsoDate(v: string | string[] | undefined): string | null {
  if (typeof v !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  // Reject impossible months / days (e.g. 2026-13-99); Date round-trips
  // valid dates to the same string when constructed from yyyy-mm-dd.
  const d = new Date(v + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  if (d.toISOString().slice(0, 10) !== v) return null
  return v
}

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  if (Array.isArray(v)) return v.flatMap((s) => s.split(',')).filter(Boolean)
  return v.split(',').filter(Boolean)
}

/**
 * Reads URL search params (the shape Next.js page components receive)
 * into a normalised FinanceFilters. Unknown values are dropped.
 */
export function parseFinanceFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FinanceFilters {
  const rawP = toArray(searchParams.p)
  const programmes = rawP.filter((p): p is FinanceFilterProgramme =>
    FINANCE_FILTER_PROGRAMMES.includes(p as FinanceFilterProgramme),
  )

  const rawSc = toArray(searchParams.sc)
  const salesChannels = rawSc.filter((s): s is SalesChannel =>
    FINANCE_FILTER_SALES_CHANNELS.includes(s as SalesChannel),
  )

  const fyRaw = typeof searchParams.fy === 'string' ? searchParams.fy : null
  const fy = fyRaw && /^\d{4}-\d{2}$/.test(fyRaw) ? fyRaw : null

  const from = parseIsoDate(searchParams.from)
  const to = parseIsoDate(searchParams.to)

  return { programmes, salesChannels, fy, from, to }
}

/** Resolve an Indian FY label to a [start, end] ISO date range (April-March). */
export function fyToRange(fy: string): { from: string; to: string } | null {
  const m = fy.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const startYear = Number(m[1])
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  }
}

/** Distinct FY labels across the MOU set, plus the "now" FY if absent, sorted desc. */
export function fyOptionsList(mous: MOU[], now: Date): string[] {
  const set = new Set<string>()
  for (const m of mous) {
    if (m.academicYear) set.add(m.academicYear)
  }
  const nowFy = fiscalYearOfIso(now.toISOString())
  if (nowFy) set.add(nowFy)
  return Array.from(set).sort().reverse()
}

/** Forward-compatible VEX detection. Today neither check matches any
 *  Phase 1 MOU; future enum widening starts working without code change. */
function isVexMou(m: MOU): boolean {
  const prog = m.programme as unknown as string
  const psel = (m.productSelection as unknown as string) ?? ''
  return prog === 'VEX' || psel === 'VEX'
}

/** The effective [from, to] window the dashboard renders for. Explicit
 *  from/to override FY; FY alone maps to its April-March range; nothing
 *  set yields null (no window filter). */
export function resolveWindow(filters: FinanceFilters): {
  from: string | null
  to: string | null
} {
  if (filters.from || filters.to) {
    return { from: filters.from, to: filters.to }
  }
  if (filters.fy) {
    const r = fyToRange(filters.fy)
    if (r) return r
  }
  return { from: null, to: null }
}

function inWindow(iso: string | null, from: string | null, to: string | null): boolean {
  if (!iso) return false
  if (from && iso < from) return false
  if (to && iso > to) return false
  return true
}

/** MOU passes the date window when [startDate, endDate] overlaps the window. */
function mouOverlapsWindow(
  m: MOU,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true
  const start = m.startDate ?? null
  const end = m.endDate ?? null
  if (!start && !end) return false
  // Overlap: not (end < from) and not (start > to)
  if (to && start && start > to) return false
  if (from && end && end < from) return false
  return true
}

export interface AppliedFilterResult {
  filteredMous: MOU[]
  filteredMouIds: Set<string>
  filteredPayments: Payment[]
  windowFrom: string | null
  windowTo: string | null
}

/**
 * Apply the active filter to MOUs + Payments. MOU window check is overlap-
 * based (MOU's [start, end] crosses the window). Payment inclusion follows
 * the MOU set (a payment is in if its MOU is in).
 */
export function applyFilters(args: {
  mous: MOU[]
  payments: Payment[]
  filters: FinanceFilters
}): AppliedFilterResult {
  const { mous, payments, filters } = args
  const { from, to } = resolveWindow(filters)

  const wantsAllProgrammes = filters.programmes.length === 0
  const wantsAllChannels = filters.salesChannels.length === 0
  const progSet = new Set<FinanceFilterProgramme>(filters.programmes)
  const channelSet = new Set<SalesChannel>(filters.salesChannels)
  const wantsVex = progSet.has('VEX')

  const filteredMous = mous.filter((m) => {
    if (!mouOverlapsWindow(m, from, to)) return false
    if (!wantsAllProgrammes) {
      const isProgrammeMatch = progSet.has(m.programme as FinanceFilterProgramme)
      const isVexMatch = wantsVex && isVexMou(m)
      if (!isProgrammeMatch && !isVexMatch) return false
    }
    if (!wantsAllChannels) {
      const ch = m.salesChannel ?? null
      if (!ch || !channelSet.has(ch)) return false
    }
    return true
  })

  const filteredMouIds = new Set(filteredMous.map((m) => m.id))
  const filteredPayments = payments.filter((p) => filteredMouIds.has(p.mouId))

  return { filteredMous, filteredMouIds, filteredPayments, windowFrom: from, windowTo: to }
}

// ===========================================================================
// Row 1: KPI strip
// ===========================================================================

/**
 * Headline KPI strip data (Gate 5A.7 Step 4 rebuild).
 *
 * Ameet's "overall first, action second" framing: lead with the commercial
 * position (contract value), then progress (collected), then commitment
 * (outstanding), then the operator's queue (needs attention).
 *
 * Active MOUs and Open Alerts were on the headline strip before Gate 5A.7
 * and have been dropped. Both remain visible elsewhere on the dashboard
 * (Active MOUs in the programme breakdown row count; Open Alerts in the
 * HighPriorityAlertsPanel section below the strip).
 */
export interface KpiStripData {
  /** Total contract value (Rs) across the filtered MOU set. */
  contractValue: number
  /** Distinct schools backing the contract value figure. */
  schoolsCount: number
  /** Sum of receivedAmount across filtered payments. */
  collectedAmount: number
  /** collectedAmount / contractValue * 100 (0 when contractValue is 0). */
  collectedPct: number
  /** max(0, contractValue - collectedAmount). */
  outstandingAmount: number
  /** Distinct schools whose total contract value exceeds total collected. */
  outstandingSchoolsCount: number
  /** Distinct payments that are overdue or have a stalled PI (each item
   *  counts at most once even if it triggers both rules). */
  needsAttentionCount: number
  /** Payments past dueDateIso with balance > 0 (independent count; can
   *  overlap with stalledPiCount). */
  overduePaymentsCount: number
  /** PIs raised > 30 days ago, payment not received (independent count;
   *  can overlap with overduePaymentsCount). */
  stalledPiCount: number
}

const STALLED_PI_DAYS = 30

export function computeKpiStrip(args: {
  filteredMous: MOU[]
  filteredPayments: Payment[]
  filteredMouIds: Set<string>
  now: Date
}): KpiStripData {
  const { filteredMous, filteredPayments, now } = args

  const schoolsCount = new Set(filteredMous.map((m) => m.schoolId)).size
  const contractValue = filteredMous.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const collectedAmount = filteredPayments.reduce(
    (s, p) => s + (p.receivedAmount ?? 0),
    0,
  )
  const collectedPct =
    contractValue > 0 ? (collectedAmount / contractValue) * 100 : 0
  const outstandingAmount = Math.max(0, contractValue - collectedAmount)

  // Schools with balance: sum contract value vs sum collected per school.
  const perSchoolContract = new Map<string, number>()
  for (const m of filteredMous) {
    perSchoolContract.set(
      m.schoolId,
      (perSchoolContract.get(m.schoolId) ?? 0) + (m.contractValue ?? 0),
    )
  }
  const schoolIdByMouId = new Map(filteredMous.map((m) => [m.id, m.schoolId]))
  const perSchoolCollected = new Map<string, number>()
  for (const p of filteredPayments) {
    const sid = schoolIdByMouId.get(p.mouId)
    if (!sid) continue
    perSchoolCollected.set(
      sid,
      (perSchoolCollected.get(sid) ?? 0) + (p.receivedAmount ?? 0),
    )
  }
  let outstandingSchoolsCount = 0
  for (const [sid, contract] of Array.from(perSchoolContract.entries())) {
    const collected = perSchoolCollected.get(sid) ?? 0
    if (contract > collected) outstandingSchoolsCount += 1
  }

  // Needs attention: payments that are overdue OR have a PI raised more than
  // 30 days ago without payment. Each payment is counted at most once in
  // needsAttentionCount (a payment that's both overdue + stalled is still
  // one item on the operator's queue); the per-bucket subcounts are
  // independent and may overlap.
  const nowMs = now.getTime()
  let overduePaymentsCount = 0
  let stalledPiCount = 0
  let needsAttentionCount = 0
  for (const p of filteredPayments) {
    const balance = (p.expectedAmount ?? 0) - (p.receivedAmount ?? 0)
    const isReceived = p.status === 'Paid' || p.status === 'Received'

    let isOverdue = false
    if (!isReceived && balance > 0 && p.dueDateIso) {
      const dueMs = new Date(p.dueDateIso).getTime()
      if (!Number.isNaN(dueMs) && dueMs < nowMs) {
        isOverdue = true
        overduePaymentsCount += 1
      }
    }

    let isStalled = false
    if (
      !isReceived
      && p.piGeneratedAt
      && p.receivedDate === null
    ) {
      const piMs = new Date(p.piGeneratedAt).getTime()
      if (!Number.isNaN(piMs)) {
        const daysSincePi = (nowMs - piMs) / (1000 * 60 * 60 * 24)
        if (daysSincePi >= STALLED_PI_DAYS) {
          isStalled = true
          stalledPiCount += 1
        }
      }
    }

    if (isOverdue || isStalled) needsAttentionCount += 1
  }

  return {
    contractValue,
    schoolsCount,
    collectedAmount,
    collectedPct,
    outstandingAmount,
    outstandingSchoolsCount,
    needsAttentionCount,
    overduePaymentsCount,
    stalledPiCount,
  }
}

// ===========================================================================
// Row 2: High-priority alerts panel
// ===========================================================================

export type AlertSeverity = 'critical' | 'high' | 'medium'

export interface HighPriorityAlert {
  id: string
  severity: AlertSeverity
  type: string
  schoolName: string
  description: string
  href: string
}

export function computeHighPriorityAlerts(args: {
  escalations: Escalation[]
  schools: School[]
  filteredMouIds: Set<string>
  limit?: number
}): HighPriorityAlert[] {
  const { escalations, schools, filteredMouIds } = args
  const limit = args.limit ?? 4
  const schoolNameById = new Map(schools.map((s) => [s.id, s.name]))

  const ranked: HighPriorityAlert[] = []
  for (const e of escalations) {
    if (e.status === 'Closed') continue
    if (e.severity !== 'critical' && e.severity !== 'high') continue
    if (e.mouId && !filteredMouIds.has(e.mouId)) continue
    const schoolName = schoolNameById.get(e.schoolId) ?? 'Unknown school'
    ranked.push({
      id: e.id,
      severity: e.severity === 'critical' ? 'critical' : 'high',
      type: e.category ?? 'Other',
      schoolName,
      description: e.description.slice(0, 140),
      href: `/escalations/${e.id}`,
    })
  }
  // Critical before high; within tier, leave incoming order.
  ranked.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'critical' ? -1 : 1
  })
  return ranked.slice(0, limit)
}

// ===========================================================================
// Row 3.5 L: Top overdue payments
// ===========================================================================

export interface TopOverdueRow {
  paymentId: string
  mouId: string
  schoolName: string
  /** Any registry product name (Payment.programme widened to string). */
  programme: string
  piNumber: string | null
  instalmentLabel: string
  description: string
  dueDateRaw: string | null
  balance: number
  daysOverdue: number
}

export function computeTopOverduePayments(args: {
  filteredPayments: Payment[]
  now: Date
  limit?: number
}): TopOverdueRow[] {
  const { filteredPayments, now } = args
  const limit = args.limit ?? 5
  const nowMs = now.getTime()
  const rows: TopOverdueRow[] = []
  for (const p of filteredPayments) {
    if (p.status === 'Paid' || p.status === 'Received') continue
    if (!p.dueDateIso) continue
    const dueMs = new Date(p.dueDateIso).getTime()
    if (Number.isNaN(dueMs)) continue
    if (dueMs >= nowMs) continue // not yet overdue
    const balance = (p.expectedAmount ?? 0) - (p.receivedAmount ?? 0)
    if (balance <= 0) continue
    const daysOverdue = Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24))
    rows.push({
      paymentId: p.id,
      mouId: p.mouId,
      schoolName: p.schoolName,
      programme: p.programme,
      piNumber: p.piNumber,
      instalmentLabel: p.instalmentLabel,
      description: p.description,
      dueDateRaw: p.dueDateRaw,
      balance,
      daysOverdue,
    })
  }
  rows.sort((a, b) => b.balance - a.balance)
  return rows.slice(0, limit)
}

// ===========================================================================
// Row 3.5 R: Renewal needed
// ===========================================================================

export interface RenewalRow {
  mouId: string
  schoolName: string
  /** Any registry product name (MOU.programme widened to string). */
  programme: string
  status: MOU['status']
  endDate: string | null
  daysToExpiry: number | null
  isExpired: boolean
  contractValue: number
}

const RENEWAL_WINDOW_DAYS = 30

export function computeRenewalNeeded(args: {
  filteredMous: MOU[]
  now: Date
  limit?: number
}): { rows: RenewalRow[]; expiredCount: number; expiringSoonCount: number } {
  const { filteredMous, now } = args
  const limit = args.limit ?? 5
  const nowMs = now.getTime()

  const candidates: RenewalRow[] = []
  for (const m of filteredMous) {
    if (!m.endDate) continue
    const endMs = new Date(m.endDate).getTime()
    if (Number.isNaN(endMs)) continue
    const days = Math.floor((endMs - nowMs) / (1000 * 60 * 60 * 24))
    const isExpired = endMs < nowMs
    const expiringSoon = !isExpired && days <= RENEWAL_WINDOW_DAYS
    if (!isExpired && !expiringSoon) continue
    if (m.status === 'Renewed' || m.status === 'Completed') continue
    candidates.push({
      mouId: m.id,
      schoolName: m.schoolName,
      programme: m.programme,
      status: m.status,
      endDate: m.endDate,
      daysToExpiry: days,
      isExpired,
      contractValue: m.contractValue ?? 0,
    })
  }

  const expiredCount = candidates.filter((c) => c.isExpired).length
  const expiringSoonCount = candidates.length - expiredCount

  // Most-expired first (smallest daysToExpiry comes first since it'll be
  // the most-negative number).
  candidates.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
  return {
    rows: candidates.slice(0, limit),
    expiredCount,
    expiringSoonCount,
  }
}

// ===========================================================================
// Row 4: Amount Receipt Summary
// ===========================================================================

export interface AmountReceiptSummary {
  schoolsCount: number
  totalDue: number
  received: number
  pending: number
  /** Positive when receipts exceed dues for the period; surfaces as a
   *  warning so excess credits can be drilled into. */
  excessAmount: number
}

export function computeAmountReceiptSummary(args: {
  filteredPayments: Payment[]
  windowFrom: string | null
  windowTo: string | null
}): AmountReceiptSummary {
  const { filteredPayments, windowFrom, windowTo } = args

  let totalDue = 0
  let received = 0
  const schools = new Set<string>()
  for (const p of filteredPayments) {
    if (inWindow(p.dueDateIso, windowFrom, windowTo)) {
      totalDue += p.expectedAmount ?? 0
      schools.add(p.schoolName)
    }
    if (inWindow(p.receivedDate, windowFrom, windowTo)) {
      received += p.receivedAmount ?? 0
    }
  }
  const pending = Math.max(0, totalDue - received)
  const excessAmount = Math.max(0, received - totalDue)
  return {
    schoolsCount: schools.size,
    totalDue,
    received,
    pending,
    excessAmount,
  }
}

// ===========================================================================
// Row 5: VEX Kit Orders
// ===========================================================================

export interface VexKitOrdersData {
  vexSchools: number
  piCount: number
  totalPipeline: number
  pendingDispatch: number
  salesInvoiceAmount: number
}

/**
 * Aggregate VEX data for the period. Distinct from the main MOU/Payment
 * flow because VEX has its own PI + dispatch ledgers (vex_pis.json +
 * vex_dispatches.json). The dashboard scopes by issueDate falling inside
 * the window.
 */
export function computeVexKitOrders(args: {
  vexPis: VexPi[]
  vexDispatches: VexDispatch[]
  windowFrom: string | null
  windowTo: string | null
}): VexKitOrdersData {
  const { vexPis, vexDispatches, windowFrom, windowTo } = args
  const inPeriod = vexPis.filter((pi) =>
    inWindow(pi.issueDate, windowFrom, windowTo),
  )
  const piIdsInPeriod = new Set(inPeriod.map((pi) => pi.id))
  const vexSchools = new Set(inPeriod.map((pi) => pi.schoolName)).size
  const piCount = inPeriod.length
  const totalPipeline = inPeriod.reduce((s, pi) => s + (pi.total ?? 0), 0)

  // Pending to dispatch: PI has payment received but no Shipped dispatch.
  const shippedPiIds = new Set(
    vexDispatches
      .filter((d) => d.status === 'Shipped')
      .map((d) => d.piId),
  )
  let pendingDispatch = 0
  for (const pi of inPeriod) {
    if ((pi.paymentReceivedAmount ?? 0) <= 0) continue
    if (shippedPiIds.has(pi.id)) continue
    pendingDispatch += 1
  }

  // Sales invoice amount: dispatches that are Invoiced or Shipped,
  // tied to PIs issued in the period.
  let salesInvoiceAmount = 0
  for (const d of vexDispatches) {
    if (d.status !== 'Invoiced' && d.status !== 'Shipped') continue
    if (!piIdsInPeriod.has(d.piId)) continue
    const pi = inPeriod.find((p) => p.id === d.piId)
    if (!pi) continue
    salesInvoiceAmount += pi.total ?? 0
  }

  return {
    vexSchools,
    piCount,
    totalPipeline,
    pendingDispatch,
    salesInvoiceAmount,
  }
}

// ===========================================================================
// Row 6: Programme breakdown
// ===========================================================================

export interface ProgrammeBreakdownRow {
  /** Any registry product name (MOU.programme widened to string). */
  programme: string
  mouCount: number
  studentsCount: number
  contractValue: number
  /** Relative width 0..100, computed against the max MOU count in the row set. */
  barPct: number
}

export function computeProgrammeBreakdown(
  filteredMous: MOU[],
): ProgrammeBreakdownRow[] {
  // Iterate the DISTINCT programmes actually present in the passed-in MOUs
  // so new registry products (e.g. "Bootcamps (general)", "AIQ") appear in
  // the breakdown, rather than a fixed 4-value list.
  const counts = new Map<string, { mouCount: number; students: number; value: number }>()
  for (const m of filteredMous) {
    const key = m.programme || 'Unspecified'
    let slot = counts.get(key)
    if (!slot) {
      slot = { mouCount: 0, students: 0, value: 0 }
      counts.set(key, slot)
    }
    slot.mouCount += 1
    slot.students += m.studentsActual ?? m.studentsMou ?? 0
    slot.value += m.contractValue ?? 0
  }
  let maxCount = 0
  for (const slot of Array.from(counts.values())) {
    if (slot.mouCount > maxCount) maxCount = slot.mouCount
  }
  const rows: ProgrammeBreakdownRow[] = []
  for (const [programme, slot] of Array.from(counts.entries())) {
    rows.push({
      programme,
      mouCount: slot.mouCount,
      studentsCount: slot.students,
      contractValue: slot.value,
      barPct: maxCount > 0 ? Math.round((slot.mouCount / maxCount) * 100) : 0,
    })
  }
  // Most MOUs first, then alphabetically for a stable order across new
  // products with equal counts.
  rows.sort((a, b) => (b.mouCount - a.mouCount) || a.programme.localeCompare(b.programme))
  return rows
}

// ===========================================================================
// Misc surface helpers
// ===========================================================================

/** Pretty-print the active filter for the header subtitle. */
export function filterSubtitle(filters: FinanceFilters, now: Date): string {
  const parts: string[] = []
  if (filters.programmes.length > 0) parts.push(filters.programmes.join(' / '))
  if (filters.salesChannels.length > 0) parts.push(filters.salesChannels.join(' / '))
  if (filters.from || filters.to) {
    parts.push(`${filters.from ?? '...'} to ${filters.to ?? '...'}`)
  } else if (filters.fy) {
    parts.push(`FY ${filters.fy}`)
  }
  if (parts.length === 0) {
    return `As of ${now.toISOString().slice(0, 10)}`
  }
  return `Filtered view: ${parts.join(' · ')}`
}

/** Re-export for callers that want to look up the prior FY. */
export { priorFy }
