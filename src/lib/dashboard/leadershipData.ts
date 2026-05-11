/*
 * Leadership dashboard data helpers (Gate 3.5 Step 2).
 *
 * Pure compute functions consumed by /dashboard/leadership and the
 * top section of /admin (Step 8). No I/O, no React. Data files are
 * passed in from the page components so the helpers stay testable.
 *
 * The three sections of the Leadership console:
 *   1. Are we making money?     -> computeFinancialHealth
 *   2. Are we delivering?       -> computeDeliveryHealth
 *   3. Needs leadership attention -> computeAttentionItems
 *
 * All currency in rupees; no formatting here (formatRs lives in
 * src/lib/format.ts and renders at the surface).
 */

import type {
  Escalation,
  MOU,
  Payment,
  Programme,
  School,
} from '@/lib/types'
import type { KitDispatch } from '@/lib/types'

// ===========================================================================
// Section 1: Are we making money?
// ===========================================================================

export interface FinancialHealth {
  /** Total signed contract value across all MOUs active in the chosen FY. */
  signedContractValueFy: number
  /** Same metric for the prior FY. */
  signedContractValuePriorFy: number
  /** YoY delta as a percentage (positive = growth). null if priorFy is 0. */
  signedContractValueDeltaPct: number | null
  /** Total received against the chosen-FY MOUs. */
  receivedFy: number
  /** Collection % = receivedFy / signedContractValueFy. */
  collectionPct: number
  /** Outstanding = signedContractValueFy - receivedFy. */
  outstanding: number
  /** Distinct schools with at least one Active MOU in chosen FY. */
  activeSchools: number
  /** Distinct schools with at least one signed MOU ever. */
  signedSchools: number
  /** Monthly receipt totals for the last 12 months, oldest-first. */
  monthlyReceipts: MonthlyReceiptPoint[]
}

export interface MonthlyReceiptPoint {
  /** YYYY-MM key. */
  month: string
  /** Sum of receivedAmount for payments with receivedDate in that month. */
  amount: number
}

/**
 * Indian fiscal year: April year N to March year N+1. fiscalYearLabel
 * is "YYYY-YY" e.g. "2026-27" for April 2026 - March 2027.
 */
export function fiscalYearOfIso(isoDate: string): string | null {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0 = Jan
  const startYear = m < 3 ? y - 1 : y
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endYearShort}`
}

export function priorFy(label: string): string | null {
  const match = label.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const startYear = Number(match[1])
  const endYearShort = String((startYear) % 100).padStart(2, '0')
  return `${startYear - 1}-${endYearShort}`
}

export function computeFinancialHealth(args: {
  mous: MOU[]
  payments: Payment[]
  fy: string
  now: Date
}): FinancialHealth {
  const { mous, payments, fy, now } = args
  const priorFyLabel = priorFy(fy)

  const fyMous = mous.filter((m) => m.academicYear === fy)
  const priorMous = priorFyLabel
    ? mous.filter((m) => m.academicYear === priorFyLabel)
    : []

  const signedContractValueFy = fyMous.reduce(
    (sum, m) => sum + (m.contractValue ?? 0),
    0,
  )
  const signedContractValuePriorFy = priorMous.reduce(
    (sum, m) => sum + (m.contractValue ?? 0),
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
    (sum, p) => sum + (p.receivedAmount ?? 0),
    0,
  )

  const collectionPct =
    signedContractValueFy > 0 ? (receivedFy / signedContractValueFy) * 100 : 0
  const outstanding = Math.max(0, signedContractValueFy - receivedFy)

  const activeSchools = new Set(
    fyMous.filter((m) => m.status === 'Active').map((m) => m.schoolId),
  ).size
  const signedSchools = new Set(mous.map((m) => m.schoolId)).size

  // Monthly receipts over the last 12 months, oldest first.
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
    months.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    )
  }
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]))
  for (const p of payments) {
    if (!p.receivedDate || !p.receivedAmount) continue
    const month = p.receivedDate.slice(0, 7) // YYYY-MM
    if (byMonth.has(month)) {
      byMonth.set(month, (byMonth.get(month) ?? 0) + p.receivedAmount)
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
    signedSchools,
    monthlyReceipts,
  }
}

// ===========================================================================
// Section 2: Are we delivering?
// ===========================================================================

export interface DeliveryHealth {
  active: SchoolBucket
  inTrouble: SchoolBucket
  healthy: SchoolBucket
}

export interface SchoolBucket {
  count: number
  /** Programme-wise breakdown for the stacked bar visualisation. */
  byProgramme: Record<Programme, number>
  /** Drill-down query string suffix to append to /schools (e.g. "?status=in-trouble"). */
  hrefQuery: string
}

const PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
]

function emptyByProgramme(): Record<Programme, number> {
  return {
    STEAM: 0,
    'Young Pioneers': 0,
    'Harvard HBPE': 0,
    Robotics: 0,
  }
}

export function computeDeliveryHealth(args: {
  mous: MOU[]
  schools: School[]
  escalations: Escalation[]
  dispatches: KitDispatch[]
  payments: Payment[]
  now: Date
}): DeliveryHealth {
  const { mous, schools, escalations, dispatches, payments, now } = args
  const nowMs = now.getTime()

  // Aggregate per-school signals.
  const escalationOpenBySchool = new Set<string>(
    escalations
      .filter((e) => e.status !== 'Closed')
      .map((e) => e.schoolId)
      .filter((id): id is string => typeof id === 'string'),
  )

  const dispatchStalledBySchool = new Set<string>(
    dispatches
      .filter((d) => {
        if (d.dispatchStatus === 'Delivered') return false
        // Last audit timestamp on the dispatch.
        const lastTs = (d.auditLog?.[d.auditLog.length - 1]?.timestamp) ?? null
        if (!lastTs) return false
        const days = (nowMs - new Date(lastTs).getTime()) / (1000 * 60 * 60 * 24)
        return days > 14
      })
      .map((d) => d.schoolId),
  )

  const overduePaymentBySchool = new Set<string>(
    payments
      .filter((p) => {
        if (p.status === 'Paid') return false
        if (!p.dueDateIso) return false
        const due = new Date(p.dueDateIso).getTime()
        if (Number.isNaN(due)) return false
        const daysOverdue = (nowMs - due) / (1000 * 60 * 60 * 24)
        return daysOverdue > 30
      })
      .map((p) => {
        const mou = mous.find((m) => m.id === p.mouId)
        return mou?.schoolId ?? ''
      })
      .filter(Boolean),
  )

  const idleSignedSchools = new Set<string>(
    mous
      .filter((m) => {
        if (m.status !== 'Active' && m.status !== 'Completed') return false
        const lastAudit =
          m.auditLog?.[m.auditLog.length - 1]?.timestamp ?? m.startDate ?? null
        if (!lastAudit) return false
        const days = (nowMs - new Date(lastAudit).getTime()) / (1000 * 60 * 60 * 24)
        return days > 60
      })
      .map((m) => m.schoolId),
  )

  const activeMous = mous.filter((m) => m.status === 'Active')
  const activeSchoolIds = new Set(activeMous.map((m) => m.schoolId))
  const programmeBySchool = new Map<string, Programme>()
  for (const m of activeMous) {
    if (!programmeBySchool.has(m.schoolId)) {
      programmeBySchool.set(m.schoolId, m.programme)
    }
  }

  const active: SchoolBucket = {
    count: activeSchoolIds.size,
    byProgramme: emptyByProgramme(),
    hrefQuery: '?status=active',
  }
  const inTrouble: SchoolBucket = {
    count: 0,
    byProgramme: emptyByProgramme(),
    hrefQuery: '?status=in-trouble',
  }
  const healthy: SchoolBucket = {
    count: 0,
    byProgramme: emptyByProgramme(),
    hrefQuery: '?status=healthy',
  }

  activeSchoolIds.forEach((schoolId) => {
    const programme = programmeBySchool.get(schoolId) ?? 'STEAM'
    active.byProgramme[programme] += 1

    const isInTrouble =
      escalationOpenBySchool.has(schoolId) ||
      dispatchStalledBySchool.has(schoolId) ||
      overduePaymentBySchool.has(schoolId) ||
      idleSignedSchools.has(schoolId)

    if (isInTrouble) {
      inTrouble.count += 1
      inTrouble.byProgramme[programme] += 1
    } else {
      healthy.count += 1
      healthy.byProgramme[programme] += 1
    }
  })

  // schools file may contain inactive records; not surfaced here.
  void schools

  return { active, inTrouble, healthy }
}

// ===========================================================================
// Section 3: Needs leadership attention
// ===========================================================================

export type AttentionSeverity =
  | 'p0-escalation'
  | 'financial'
  | 'dispatch'
  | 'legal'
  | 'positive'

export interface AttentionItem {
  severity: AttentionSeverity
  description: string
  href: string
  /** Hidden sort key; lower number = higher priority. */
  priority: number
}

const PRIORITY_BY_SEVERITY: Record<AttentionSeverity, number> = {
  'p0-escalation': 1,
  financial: 2,
  dispatch: 3,
  legal: 4,
  positive: 5,
}

export function computeAttentionItems(args: {
  mous: MOU[]
  schools: School[]
  escalations: Escalation[]
  dispatches: KitDispatch[]
  payments: Payment[]
  now: Date
}): AttentionItem[] {
  const { mous, escalations, dispatches, payments, now } = args
  const nowMs = now.getTime()
  const items: AttentionItem[] = []

  // Critical (P0) escalations. EscalationSeverity is the
  // critical/high/medium/low scale per src/lib/types.ts; 'critical'
  // maps to P0 per Gate 1 Step 5.
  const schoolNameById = new Map(args.schools.map((s) => [s.id, s.name]))
  for (const e of escalations) {
    if (e.status === 'Closed') continue
    if (e.severity !== 'critical') continue
    const schoolName = schoolNameById.get(e.schoolId) ?? 'unknown school'
    items.push({
      severity: 'p0-escalation',
      description: `Critical (P0) escalation: ${e.description.slice(0, 60)} (${schoolName})`,
      href: `/escalations/${e.id}`,
      priority: PRIORITY_BY_SEVERITY['p0-escalation'],
    })
  }

  // High-value MOUs with overdue payment.
  const HIGH_VALUE_THRESHOLD = 2_500_000 // Rs 25 lakh
  for (const p of payments) {
    if (p.status === 'Paid') continue
    if (!p.dueDateIso) continue
    const due = new Date(p.dueDateIso).getTime()
    if (Number.isNaN(due)) continue
    const daysOverdue = (nowMs - due) / (1000 * 60 * 60 * 24)
    if (daysOverdue <= 30) continue
    const mou = mous.find((m) => m.id === p.mouId)
    if (!mou || (mou.contractValue ?? 0) < HIGH_VALUE_THRESHOLD) continue
    items.push({
      severity: 'financial',
      description: `Payment overdue ${Math.floor(daysOverdue)}d: ${mou.schoolName} (Rs ${(mou.contractValue / 100000).toFixed(0)} lakh contract)`,
      href: `/mous/${mou.id}`,
      priority: PRIORITY_BY_SEVERITY.financial,
    })
  }

  // Dispatches stalled >14d at same status.
  for (const d of dispatches) {
    if (d.dispatchStatus === 'Delivered') continue
    const lastTs = d.auditLog?.[d.auditLog.length - 1]?.timestamp ?? null
    if (!lastTs) continue
    const days = (nowMs - new Date(lastTs).getTime()) / (1000 * 60 * 60 * 24)
    if (days <= 14) continue
    items.push({
      severity: 'dispatch',
      description: `Dispatch stalled ${Math.floor(days)}d at ${d.dispatchStatus}: ${d.schoolName}`,
      href: `/dispatch/kits/${d.mouId}`,
      priority: PRIORITY_BY_SEVERITY.dispatch,
    })
  }

  // High-value new MOU signed this week (positive surfacing).
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  for (const m of mous) {
    if ((m.contractValue ?? 0) < 5_000_000) continue // Rs 50 lakh+
    if (!m.generatedAt) continue
    const ts = new Date(m.generatedAt).getTime()
    if (Number.isNaN(ts)) continue
    if (nowMs - ts > SEVEN_DAYS_MS) continue
    items.push({
      severity: 'positive',
      description: `High-value MOU signed this week: ${m.schoolName} (Rs ${(m.contractValue / 100000).toFixed(0)} lakh)`,
      href: `/mous/${m.id}`,
      priority: PRIORITY_BY_SEVERITY.positive,
    })
  }

  // Legal-flag schools: scan school auditLog for action='legal-flag' or
  // similar. The current AuditAction union does not include a legal
  // action; this branch returns empty until such an action is added in
  // a future gate. Documented in STEP3_5_QUESTIONS.md.

  items.sort((a, b) => a.priority - b.priority)
  return items.slice(0, 5)
}

// ===========================================================================
// Helpers shared across surfaces
// ===========================================================================

/** Programme palette for stacked bars + cards. Tailwind classes. */
export const PROGRAMME_PALETTE: Record<Programme, string> = {
  STEAM: 'bg-brand-teal',
  'Young Pioneers': 'bg-amber-500',
  'Harvard HBPE': 'bg-violet-500',
  Robotics: 'bg-slate-500',
}

export const PROGRAMME_ORDER = PROGRAMMES
