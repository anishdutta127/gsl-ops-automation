/*
 * Schools + receipts drilldown lib (Gate 4.95 Session 4).
 *
 * Pure compute powering /finance/schools-receipts. Aggregates the
 * filter-narrowed MOUs + payments + schools into per-school rows with
 * contract value, received amount, outstanding, % received, last
 * payment date, next instalment due, and a healthy/at-risk/overdue/
 * closed status pill.
 *
 * Filter application lives in financeDashboardData.applyFilters so this
 * lib expects the already-narrowed MOU + payment sets. School inclusion
 * is derived from the narrowed MOU set: a school only surfaces when at
 * least one of its MOUs passed the filter.
 */

import type { MOU, Payment, Programme, School } from '@/lib/types'
import {
  applyFilters,
  type FinanceFilters,
} from '@/lib/dashboard/financeDashboardData'

export type SchoolReceiptStatus = 'Healthy' | 'At Risk' | 'Overdue' | 'Closed'

export interface SchoolReceiptRow {
  schoolId: string
  schoolName: string
  region: string
  programmes: Programme[]
  totalContractValue: number
  receivedAmount: number
  outstanding: number
  receivedPct: number
  lastPaymentDate: string | null
  nextInstalmentDue: { dueDateIso: string; amount: number } | null
  status: SchoolReceiptStatus
  /** Underlying MOU ids; useful for downstream links. */
  mouIds: string[]
}

export type SchoolReceiptSortKey =
  | 'contract-desc'
  | 'outstanding-desc'
  | 'received-asc'
  | 'last-payment-desc'
  | 'name-asc'

const ALL_SORT_KEYS: SchoolReceiptSortKey[] = [
  'contract-desc',
  'outstanding-desc',
  'received-asc',
  'last-payment-desc',
  'name-asc',
]

export function isSchoolReceiptSortKey(
  v: string | null | undefined,
): v is SchoolReceiptSortKey {
  return v !== null && v !== undefined && (ALL_SORT_KEYS as string[]).includes(v)
}

function isPaid(p: Payment): boolean {
  return p.status === 'Paid' || p.status === 'Received'
}

function statusFor(args: {
  mous: MOU[]
  payments: Payment[]
  receivedPct: number
  now: Date
}): SchoolReceiptStatus {
  const { mous, payments, receivedPct, now } = args

  // Closed: every MOU is Completed or Expired.
  const allClosed =
    mous.length > 0 &&
    mous.every((m) => m.status === 'Completed' || m.status === 'Expired')
  if (allClosed) return 'Closed'

  // Overdue: at least one unpaid payment with dueDateIso strictly in the past.
  const nowMs = now.getTime()
  const anyOverdue = payments.some((p) => {
    if (isPaid(p)) return false
    if (!p.dueDateIso) return false
    const ms = new Date(p.dueDateIso + 'T00:00:00Z').getTime()
    if (Number.isNaN(ms)) return false
    return ms < nowMs
  })
  if (anyOverdue) return 'Overdue'

  const hasActive = mous.some((m) => m.status === 'Active')

  if (receivedPct < 50 && hasActive) return 'At Risk'
  return 'Healthy'
}

export function computeSchoolReceipts(args: {
  mous: MOU[]
  payments: Payment[]
  schools: School[]
  filters: FinanceFilters
  now: Date
  sortBy?: SchoolReceiptSortKey
}): SchoolReceiptRow[] {
  const { schools, filters, now } = args
  const sortBy = args.sortBy ?? 'name-asc'

  const { filteredMous, filteredPayments } = applyFilters({
    mous: args.mous,
    payments: args.payments,
    filters,
  })

  // Group MOUs + payments by schoolId.
  const mouBySchool = new Map<string, MOU[]>()
  for (const m of filteredMous) {
    const arr = mouBySchool.get(m.schoolId) ?? []
    arr.push(m)
    mouBySchool.set(m.schoolId, arr)
  }

  const mouIdToSchool = new Map<string, string>()
  for (const m of filteredMous) mouIdToSchool.set(m.id, m.schoolId)

  const paymentsBySchool = new Map<string, Payment[]>()
  for (const p of filteredPayments) {
    const schoolId = mouIdToSchool.get(p.mouId)
    if (!schoolId) continue
    const arr = paymentsBySchool.get(schoolId) ?? []
    arr.push(p)
    paymentsBySchool.set(schoolId, arr)
  }

  const schoolById = new Map(schools.map((s) => [s.id, s]))
  const rows: SchoolReceiptRow[] = []
  const nowMs = now.getTime()

  for (const [schoolId, mous] of Array.from(mouBySchool.entries())) {
    const school = schoolById.get(schoolId)
    const pays = paymentsBySchool.get(schoolId) ?? []

    const totalContractValue = mous.reduce(
      (s, m) => s + (m.contractValue ?? 0),
      0,
    )
    const receivedAmount = pays.reduce(
      (s, p) => s + (p.receivedAmount ?? 0),
      0,
    )
    const outstanding = Math.max(0, totalContractValue - receivedAmount)
    const receivedPct =
      totalContractValue > 0
        ? (receivedAmount / totalContractValue) * 100
        : 0

    // Last payment date: most-recent receivedDate (ISO sort).
    let lastPaymentDate: string | null = null
    for (const p of pays) {
      if (!p.receivedDate) continue
      if (!lastPaymentDate || p.receivedDate > lastPaymentDate) {
        lastPaymentDate = p.receivedDate
      }
    }

    // Next instalment due: earliest unpaid payment with dueDateIso >= now.
    let nextInstalmentDue: { dueDateIso: string; amount: number } | null = null
    for (const p of pays) {
      if (isPaid(p)) continue
      if (!p.dueDateIso) continue
      const ms = new Date(p.dueDateIso + 'T00:00:00Z').getTime()
      if (Number.isNaN(ms) || ms < nowMs) continue
      if (
        nextInstalmentDue === null ||
        p.dueDateIso < nextInstalmentDue.dueDateIso
      ) {
        nextInstalmentDue = {
          dueDateIso: p.dueDateIso,
          amount: p.expectedAmount ?? 0,
        }
      }
    }

    const programmes = Array.from(
      new Set(mous.map((m) => m.programme)),
    ) as Programme[]

    rows.push({
      schoolId,
      schoolName: school?.name ?? mous[0]?.schoolName ?? 'Unknown school',
      region: school?.region ?? '-',
      programmes,
      totalContractValue,
      receivedAmount,
      outstanding,
      receivedPct,
      lastPaymentDate,
      nextInstalmentDue,
      status: statusFor({ mous, payments: pays, receivedPct, now }),
      mouIds: mous.map((m) => m.id),
    })
  }

  rows.sort((a, b) => compareRows(a, b, sortBy))
  return rows
}

function compareRows(
  a: SchoolReceiptRow,
  b: SchoolReceiptRow,
  sortBy: SchoolReceiptSortKey,
): number {
  switch (sortBy) {
    case 'contract-desc':
      return b.totalContractValue - a.totalContractValue
    case 'outstanding-desc':
      return b.outstanding - a.outstanding
    case 'received-asc':
      return a.receivedPct - b.receivedPct
    case 'last-payment-desc': {
      // null treated as oldest (sorts to the bottom of a desc list).
      const aDate = a.lastPaymentDate ?? ''
      const bDate = b.lastPaymentDate ?? ''
      if (aDate === bDate) return a.schoolName.localeCompare(b.schoolName)
      return bDate.localeCompare(aDate)
    }
    case 'name-asc':
    default:
      return a.schoolName.localeCompare(b.schoolName)
  }
}
