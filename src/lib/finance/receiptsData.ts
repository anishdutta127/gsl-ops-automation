/*
 * Receipts drilldown lib (Gate 4.95 Session 4).
 *
 * Pure compute powering /finance/receipts. Instalment-level rows with
 * derived Paid / Partial / Pending / Overdue status, aging buckets for
 * unpaid past-due payments, and sort options.
 *
 * Filter application is delegated to financeDashboardData.applyFilters
 * (window / programme / sales channel narrowing). The aging buckets are
 * computed against `now` for the unpaid + past-due subset; payments that
 * are paid or due in the future do not surface in aging.
 */

import type { Payment } from '@/lib/types'
import {
  applyFilters,
  type FinanceFilters,
} from '@/lib/dashboard/financeDashboardData'

export type ReceiptStatus = 'Paid' | 'Partial' | 'Pending' | 'Overdue'

export interface ReceiptRow {
  paymentId: string
  mouId: string
  schoolName: string
  /** Any registry product name (Payment.programme widened to string). */
  programme: string
  instalmentLabel: string
  instalmentSeq: number
  expectedAmount: number
  receivedAmount: number
  balance: number
  dueDateIso: string | null
  receivedDate: string | null
  status: ReceiptStatus
  piNumber: string | null
}

export type AgingBucket = 'today' | '1-3' | '3-7' | '7-30' | '30+'

export interface AgingSummary {
  total: number
  byBucket: Record<AgingBucket, { count: number; amount: number }>
}

export type ReceiptSortKey =
  | 'due-asc'
  | 'due-desc'
  | 'balance-desc'
  | 'school-asc'

const ALL_SORT_KEYS: ReceiptSortKey[] = [
  'due-asc',
  'due-desc',
  'balance-desc',
  'school-asc',
]

export function isReceiptSortKey(
  v: string | null | undefined,
): v is ReceiptSortKey {
  return v !== null && v !== undefined && (ALL_SORT_KEYS as string[]).includes(v)
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function isPaidStatus(p: Payment): boolean {
  return p.status === 'Paid' || p.status === 'Received'
}

/**
 * Status derivation reads the Payment fields, NOT the stored status,
 * because the stored value is sometimes stale (e.g., 'PI Sent' on a row
 * the operator has since reconciled). The expected vs received numbers
 * are the source of truth on the receipts drilldown.
 */
export function deriveReceiptStatus(p: Payment, now: Date): ReceiptStatus {
  const expected = p.expectedAmount ?? 0
  const received = p.receivedAmount ?? 0
  if (isPaidStatus(p) || (expected > 0 && received >= expected)) return 'Paid'
  if (received > 0) return 'Partial'

  if (p.dueDateIso) {
    const ms = new Date(p.dueDateIso + 'T00:00:00Z').getTime()
    if (!Number.isNaN(ms) && ms < now.getTime()) return 'Overdue'
  }
  return 'Pending'
}

export function agingBucketFor(
  p: Payment,
  now: Date,
): AgingBucket | null {
  if (isPaidStatus(p)) return null
  const expected = p.expectedAmount ?? 0
  const received = p.receivedAmount ?? 0
  if (expected > 0 && received >= expected) return null
  if (!p.dueDateIso) return null
  const dueMs = new Date(p.dueDateIso + 'T00:00:00Z').getTime()
  if (Number.isNaN(dueMs)) return null
  const days = Math.floor((now.getTime() - dueMs) / MS_PER_DAY)
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days <= 3) return '1-3'
  if (days <= 7) return '3-7'
  if (days <= 30) return '7-30'
  return '30+'
}

export function computeReceipts(args: {
  payments: Payment[]
  filters: FinanceFilters
  now: Date
  /** MOUs are accepted so the filter applies to the same MOU set the
   *  dashboard uses. Optional: when omitted only the payment-side
   *  filter (window via dueDateIso) is applied. */
  mous?: Parameters<typeof applyFilters>[0]['mous']
  sortBy?: ReceiptSortKey
}): { rows: ReceiptRow[]; aging: AgingSummary } {
  const { filters, now } = args
  const sortBy = args.sortBy ?? 'due-asc'

  let filteredPayments: Payment[]
  if (args.mous) {
    const result = applyFilters({
      mous: args.mous,
      payments: args.payments,
      filters,
    })
    filteredPayments = result.filteredPayments
  } else {
    filteredPayments = args.payments
  }

  const rows: ReceiptRow[] = filteredPayments.map((p) => {
    const expected = p.expectedAmount ?? 0
    const received = p.receivedAmount ?? 0
    return {
      paymentId: p.id,
      mouId: p.mouId,
      schoolName: p.schoolName,
      programme: p.programme,
      instalmentLabel: p.instalmentLabel,
      instalmentSeq: p.instalmentSeq,
      expectedAmount: expected,
      receivedAmount: received,
      balance: Math.max(0, expected - received),
      dueDateIso: p.dueDateIso,
      receivedDate: p.receivedDate,
      status: deriveReceiptStatus(p, now),
      piNumber: p.piNumber,
    }
  })

  rows.sort((a, b) => compareRows(a, b, sortBy))

  // Aging buckets are computed off the source Payment objects (so the
  // amount uses expectedAmount - receivedAmount, capturing partial pays).
  const byBucket: Record<AgingBucket, { count: number; amount: number }> = {
    today: { count: 0, amount: 0 },
    '1-3': { count: 0, amount: 0 },
    '3-7': { count: 0, amount: 0 },
    '7-30': { count: 0, amount: 0 },
    '30+': { count: 0, amount: 0 },
  }
  let total = 0
  for (const p of filteredPayments) {
    const bucket = agingBucketFor(p, now)
    if (bucket === null) continue
    const expected = p.expectedAmount ?? 0
    const received = p.receivedAmount ?? 0
    const balance = Math.max(0, expected - received)
    byBucket[bucket].count += 1
    byBucket[bucket].amount += balance
    total += 1
  }

  return { rows, aging: { total, byBucket } }
}

function compareRows(
  a: ReceiptRow,
  b: ReceiptRow,
  sortBy: ReceiptSortKey,
): number {
  switch (sortBy) {
    case 'due-asc': {
      const ax = a.dueDateIso ?? '9999-12-31'
      const bx = b.dueDateIso ?? '9999-12-31'
      if (ax !== bx) return ax.localeCompare(bx)
      return a.schoolName.localeCompare(b.schoolName)
    }
    case 'due-desc': {
      const ax = a.dueDateIso ?? '0000-01-01'
      const bx = b.dueDateIso ?? '0000-01-01'
      if (ax !== bx) return bx.localeCompare(ax)
      return a.schoolName.localeCompare(b.schoolName)
    }
    case 'balance-desc':
      if (a.balance !== b.balance) return b.balance - a.balance
      return a.schoolName.localeCompare(b.schoolName)
    case 'school-asc':
    default:
      if (a.schoolName !== b.schoolName)
        return a.schoolName.localeCompare(b.schoolName)
      return a.instalmentSeq - b.instalmentSeq
  }
}
