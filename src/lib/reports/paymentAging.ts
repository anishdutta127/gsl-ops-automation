/*
 * Payment aging report compute + CSV (Gate 5A Step 1).
 *
 * Aging buckets (0-30, 31-60, 61-90, 90+ days overdue) for unpaid
 * instalments, school-level rollups for accounts more than 30 days
 * overdue, and the PIs-issued-but-unpaid surface.
 */

import type { MOU, Payment } from '@/lib/types'
import { buildCsv } from './csv'
import type { ReportFilters } from './filters'
import { resolveReportWindow } from './filters'

export interface AgingBucket {
  label: string
  count: number
  totalAmount: number
}

export interface OverdueSchoolRow {
  schoolName: string
  mouId: string
  totalOverdue: number
  maxDaysOverdue: number
  overdueCount: number
}

export interface UnpaidPiRow {
  paymentId: string
  piNumber: string | null
  schoolName: string
  mouId: string
  instalmentLabel: string
  daysSincePi: number
  expectedAmount: number
}

export interface PaymentAging {
  buckets: AgingBucket[]
  overdueSchools: OverdueSchoolRow[]
  unpaidPis: UnpaidPiRow[]
  topTen: OverdueSchoolRow[]
  windowFrom: string | null
  windowTo: string | null
}

export interface PaymentAgingArgs {
  payments: Payment[]
  mous: MOU[]
  filters: ReportFilters
  now: Date
}

function isOpenPayment(p: Payment): boolean {
  if (p.status === 'Paid' || p.status === 'Received') return false
  const expected = p.expectedAmount ?? 0
  const received = p.receivedAmount ?? 0
  return expected - received > 0
}

function balance(p: Payment): number {
  return Math.max(0, (p.expectedAmount ?? 0) - (p.receivedAmount ?? 0))
}

function daysOverdue(p: Payment, now: Date): number | null {
  if (!p.dueDateIso) return null
  const due = new Date(p.dueDateIso).getTime()
  if (Number.isNaN(due)) return null
  const days = (now.getTime() - due) / (1000 * 60 * 60 * 24)
  return days
}

function inFy(p: Payment, mous: MOU[], fy: string): boolean {
  const m = mous.find((x) => x.id === p.mouId)
  return m?.academicYear === fy
}

export function computePaymentAging(args: PaymentAgingArgs): PaymentAging {
  const { payments, mous, filters, now } = args
  const { from, to } = resolveReportWindow(filters)

  // Scope: explicit window applies to dueDateIso; FY-only filtering
  // delegates to parent MOU academicYear so overdue items from MOUs
  // in the chosen FY surface even when their due date sits outside
  // the strict April-March bounds.
  const scoped = payments.filter((p) => {
    if (!isOpenPayment(p)) return false
    if (filters.from || filters.to) {
      if (!p.dueDateIso) return false
      if (filters.from && p.dueDateIso < filters.from) return false
      if (filters.to && p.dueDateIso > filters.to) return false
      return true
    }
    if (filters.fy) return inFy(p, mous, filters.fy)
    return true
  })

  const buckets: AgingBucket[] = [
    { label: '0-30 days', count: 0, totalAmount: 0 },
    { label: '31-60 days', count: 0, totalAmount: 0 },
    { label: '61-90 days', count: 0, totalAmount: 0 },
    { label: '90+ days', count: 0, totalAmount: 0 },
  ]

  // Per-school accumulators for the >30d table.
  const schoolAcc = new Map<
    string,
    {
      schoolName: string
      mouId: string
      total: number
      maxDays: number
      count: number
    }
  >()

  for (const p of scoped) {
    const d = daysOverdue(p, now)
    if (d === null) continue
    const bal = balance(p)
    if (bal <= 0) continue
    // Bucket assignment: 0-30 is "currently overdue but fresh"; we
    // count items as overdue once due date has passed (d >= 0). A
    // negative-day item (not yet due) is excluded from aging.
    if (d < 0) continue
    if (d <= 30) {
      buckets[0]!.count += 1
      buckets[0]!.totalAmount += bal
    } else if (d <= 60) {
      buckets[1]!.count += 1
      buckets[1]!.totalAmount += bal
    } else if (d <= 90) {
      buckets[2]!.count += 1
      buckets[2]!.totalAmount += bal
    } else {
      buckets[3]!.count += 1
      buckets[3]!.totalAmount += bal
    }

    if (d > 30) {
      const key = `${p.schoolName}__${p.mouId}`
      const slot = schoolAcc.get(key) ?? {
        schoolName: p.schoolName,
        mouId: p.mouId,
        total: 0,
        maxDays: 0,
        count: 0,
      }
      slot.total += bal
      slot.maxDays = Math.max(slot.maxDays, Math.floor(d))
      slot.count += 1
      schoolAcc.set(key, slot)
    }
  }

  const overdueSchools: OverdueSchoolRow[] = Array.from(schoolAcc.values())
    .map((s) => ({
      schoolName: s.schoolName,
      mouId: s.mouId,
      totalOverdue: s.total,
      maxDaysOverdue: s.maxDays,
      overdueCount: s.count,
    }))
    .sort((a, b) => b.totalOverdue - a.totalOverdue)

  const topTen = overdueSchools.slice(0, 10)

  // PIs issued but unpaid - regardless of due date.
  const unpaidPis: UnpaidPiRow[] = []
  const nowMs = now.getTime()
  for (const p of payments) {
    if (!p.piGeneratedAt) continue
    if (p.status === 'Paid' || p.status === 'Received') continue
    if ((p.receivedAmount ?? 0) >= (p.expectedAmount ?? 0)) continue
    if (filters.fy && !inFy(p, mous, filters.fy) && !(filters.from || filters.to))
      continue
    if ((filters.from || filters.to) && p.piGeneratedAt) {
      const iso = p.piGeneratedAt.slice(0, 10)
      if (filters.from && iso < filters.from) continue
      if (filters.to && iso > filters.to) continue
    }
    const ts = new Date(p.piGeneratedAt).getTime()
    if (Number.isNaN(ts)) continue
    const days = Math.floor((nowMs - ts) / (1000 * 60 * 60 * 24))
    unpaidPis.push({
      paymentId: p.id,
      piNumber: p.piNumber,
      schoolName: p.schoolName,
      mouId: p.mouId,
      instalmentLabel: p.instalmentLabel,
      daysSincePi: days,
      expectedAmount: p.expectedAmount ?? 0,
    })
  }
  unpaidPis.sort((a, b) => b.daysSincePi - a.daysSincePi)

  return {
    buckets,
    overdueSchools,
    unpaidPis,
    topTen,
    windowFrom: from,
    windowTo: to,
  }
}

export function csvForPaymentAging(args: PaymentAgingArgs): string {
  const r = computePaymentAging(args)
  const header = [
    'Section',
    'Key',
    'School',
    'MOU id',
    'Count',
    'Amount',
    'Max days overdue',
    'Days since PI',
    'Instalment',
    'PI number',
  ]
  const rows: Array<Array<string | number | null>> = []
  for (const b of r.buckets) {
    rows.push([
      'Bucket',
      b.label,
      null,
      null,
      b.count,
      b.totalAmount,
      null,
      null,
      null,
      null,
    ])
  }
  for (const s of r.overdueSchools) {
    rows.push([
      'Overdue school',
      null,
      s.schoolName,
      s.mouId,
      s.overdueCount,
      s.totalOverdue,
      s.maxDaysOverdue,
      null,
      null,
      null,
    ])
  }
  for (const p of r.unpaidPis) {
    rows.push([
      'Unpaid PI',
      p.paymentId,
      p.schoolName,
      p.mouId,
      null,
      p.expectedAmount,
      null,
      p.daysSincePi,
      p.instalmentLabel,
      p.piNumber,
    ])
  }
  return buildCsv(header, rows)
}
