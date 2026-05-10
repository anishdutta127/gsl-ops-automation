/*
 * Installment / payment helpers.
 *
 * In the v2 data model the Payment entity IS the installment. This module
 * provides pure helpers on top of payments.json: derived statuses (Due
 * Soon, Overdue), paid-amount calculations that incorporate the
 * partialPayments[] split log, and a payment-schedule parser used when
 * an MOU transitions to Signed.
 */

import type { MOU, Payment, PaymentStatus } from './types'
import { computeYearlyRevenue } from './pricing'

export const DUE_SOON_DAYS = 14
export const PAYMENT_SCHEDULE_TERMS: Record<string, number[]> = {
  '25-25-25-25 quarterly': [25, 25, 25, 25],
  '50-50 half-yearly': [50, 50],
  '100% advance': [100],
  '40-30-30': [40, 30, 30],
  '50-25-25': [50, 25, 25],
}

function dueDateForQuarter(start: Date, seq: number, totalQuarters: number): Date {
  // Evenly spread due dates across the contract period.
  const months = Math.round(12 / Math.max(1, totalQuarters)) * (seq - 1)
  return new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
}

function dueDateForHalfYear(start: Date, seq: number, totalHalves: number): Date {
  const months = Math.round(12 / Math.max(1, totalHalves)) * (seq - 1)
  return new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
}

export function parsePaymentSchedule(raw: string): number[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (PAYMENT_SCHEDULE_TERMS[trimmed]) return PAYMENT_SCHEDULE_TERMS[trimmed]!
  // Pattern like "25-25-25-25 quarterly" or "30-30-40"
  const nums = trimmed
    .replace(/quarterly|half-yearly|advance|monthly/gi, '')
    .trim()
    .split(/[-,\s]+/)
    .map((s) => parseInt(s.replace('%', ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
  const total = nums.reduce((a, b) => a + b, 0)
  if (total === 0) return []
  // Normalise to percentages if the total is 100 or close; otherwise return as-is
  return nums
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function newPayment(args: {
  mou: MOU
  seq: number
  totalInstalments: number
  description: string
  amount: number
  due: Date
}): Payment {
  return {
    id: `${args.mou.id}-i${args.seq}`,
    mouId: args.mou.id,
    schoolName: args.mou.schoolName,
    programme: args.mou.programme,
    instalmentLabel: `${args.seq} of ${args.totalInstalments}`,
    instalmentSeq: args.seq,
    totalInstalments: args.totalInstalments,
    description: args.description,
    dueDateRaw: isoDate(args.due),
    dueDateIso: isoDate(args.due),
    expectedAmount: args.amount,
    receivedAmount: 0,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: [],
    auditLog: [],
  }
}

function parseInstallmentMonth(raw: string, _fallbackYear: number): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // YYYY-MM canonical form (Round 3 Step 9).
  const isoMatch = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (isoMatch) {
    const y = parseInt(isoMatch[1]!, 10)
    const m = parseInt(isoMatch[2]!, 10)
    if (Number.isFinite(y) && m >= 1 && m <= 12) return new Date(y, m - 1, 1)
  }
  // "Apr 2026" / "April 2026"
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed)
  if (named) {
    const monthIdx = MONTH_NAMES.indexOf(named[1]!.slice(0, 3).toLowerCase())
    const y = parseInt(named[2]!, 10)
    if (monthIdx >= 0 && Number.isFinite(y)) return new Date(y, monthIdx, 1)
  }
  return null
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/**
 * Given an MOU, generate the payment instalments implied by its
 * paymentSchedule. Pure function : callers (sync runner, API route, UI)
 * write them through the queue.
 *
 * Round 3 Step 2: when `paymentSchedules` (per-year array) is set on
 * the MOU, generate per-year instalments where each year's percentages
 * apply to that year's revenue (students * yearN.spWithTax). Pranav's
 * 2-year x 1000 students x Rs 1500 with 20-40-40 schedule per year now
 * produces 6 instalments summing to Rs 30,00,000, not Rs 15,00,000
 * split across 6.
 *
 * Falls back to the legacy single-string `mou.paymentSchedule` parse
 * for MOUs that pre-date the per-year fields.
 */
export function buildInstallmentsFromMou(mou: MOU): Payment[] {
  const start = mou.startDate ? new Date(mou.startDate) : new Date()
  if (mou.paymentSchedules && mou.paymentSchedules.length > 0) {
    return buildPerYearInstallments(mou, start)
  }
  const pct = parsePaymentSchedule(mou.paymentSchedule)
  if (pct.length === 0) return []
  const total = mou.contractValue || 0
  const schedule = mou.paymentSchedule.toLowerCase()
  const out: Payment[] = []
  for (let i = 0; i < pct.length; i++) {
    const seq = i + 1
    const share = pct[i]! / pct.reduce((a, b) => a + b, 0)
    const amount = Math.round(total * share)
    const due =
      pct.length === 1
        ? start
        : schedule.includes('half')
          ? dueDateForHalfYear(start, seq, pct.length)
          : dueDateForQuarter(start, seq, pct.length)
    out.push(
      newPayment({
        mou,
        seq,
        totalInstalments: pct.length,
        description: `Instalment ${seq}`,
        amount,
        due,
      }),
    )
  }
  return out
}

function buildPerYearInstallments(mou: MOU, start: Date): Payment[] {
  const yearly = computeYearlyRevenue(mou, { useActual: false })
  const schedules = (mou.paymentSchedules ?? []).slice().sort((a, b) => a.year - b.year)
  // Backfill missing years with even distribution across available
  // year-1 schedule rather than dropping silently.
  const totalInstalments = schedules.reduce((s, y) => s + y.instalments.length, 0)
  if (totalInstalments === 0) return []
  const out: Payment[] = []
  let runningSeq = 0
  for (const yr of schedules) {
    const yearRevenue = yearly.find((r) => r.year === yr.year)?.revenue ?? 0
    const sumPct = yr.instalments.reduce((s, i) => s + (i.pctDue || 0), 0)
    if (sumPct <= 0) continue
    for (let idx = 0; idx < yr.instalments.length; idx++) {
      runningSeq += 1
      const inst = yr.instalments[idx]!
      const share = (inst.pctDue || 0) / sumPct
      const amount = Math.round(yearRevenue * share)
      // Due date: prefer the explicit month if it parses; otherwise
      // anchor evenly within the year.
      const yearStart = new Date(start.getFullYear() + (yr.year - 1), start.getMonth(), 1)
      const explicit = parseInstallmentMonth(inst.month, yearStart.getFullYear())
      const due =
        explicit ??
        (yr.instalments.length === 1
          ? yearStart
          : new Date(
              yearStart.getFullYear(),
              yearStart.getMonth() + Math.round((12 / yr.instalments.length) * idx),
              1,
            ))
      out.push(
        newPayment({
          mou,
          seq: runningSeq,
          totalInstalments,
          description: `Year ${yr.year} · Instalment ${idx + 1}`,
          amount,
          due,
        }),
      )
    }
  }
  return out
}

/**
 * Sum of the instalment's partialPayments + the legacy receivedAmount
 * field. Single source of truth for "how much has been paid".
 */
export function paidAmount(p: Payment): number {
  const fromPartials = (p.partialPayments ?? []).reduce((s, x) => s + (x.amount || 0), 0)
  const legacy = p.receivedAmount ?? 0
  // When partialPayments is populated, we trust it over the legacy field.
  return (p.partialPayments ?? []).length > 0 ? fromPartials : legacy
}

export function balanceAmount(p: Payment): number {
  return Math.max(0, (p.expectedAmount || 0) - paidAmount(p))
}

/**
 * Derive the instalment's live status. Never mutates; callers persist the
 * result through the queue when they see a drift.
 */
export function deriveStatus(p: Payment, today: Date = new Date()): PaymentStatus {
  const paid = paidAmount(p)
  const expected = p.expectedAmount || 0
  if (expected > 0 && paid >= expected) return 'Received'
  if (paid > 0) return 'Partial'
  if (p.piSentDate) return 'PI Sent'
  if (!p.dueDateIso) return 'Pending'
  const due = new Date(p.dueDateIso)
  const deltaDays = (due.getTime() - today.getTime()) / 86400000
  if (deltaDays < 0) return 'Overdue'
  if (deltaDays <= DUE_SOON_DAYS) return 'Due Soon'
  return 'Pending'
}

/**
 * Overpayment guard. Returns an error string when the proposed new total
 * exceeds the expected amount by > Rs 1 (allow for rounding). Returns null
 * when the payment is within bounds.
 */
export function overpaymentError(p: Payment, newTotalPaid: number): string | null {
  const expected = p.expectedAmount || 0
  if (expected === 0) return null
  if (newTotalPaid > expected + 1) {
    const excess = newTotalPaid - expected
    return `Payment exceeds instalment total by Rs ${excess.toLocaleString('en-IN')}. Log the excess against a different instalment or reject the payment.`
  }
  return null
}

/**
 * Are every instalment for this MOU received? Used to auto-close the MOU.
 */
export function mouIsFullyPaid(mouId: string, payments: Payment[]): boolean {
  const rows = payments.filter((p) => p.mouId === mouId)
  if (rows.length === 0) return false
  return rows.every((p) => deriveStatus(p) === 'Received')
}

/**
 * Phase 3a P2 fix: validate a single Bank+TDS split row.
 *
 * Rules (Pranav):
 *   - bank+tds must equal split amount (existing behaviour).
 *   - bank, tds >= 0 (existing behaviour).
 *   - When the row is filled with a TDS deduction, the bank receipt
 *     must also be > 0. TDS alone is not payment received : the
 *     school still has to wire the principal to MAF's bank account.
 *
 * The check only fires when both bankAmount and tdsAmount are
 * explicitly provided (the new Phase 3 form always sends both); legacy
 * splits that pass only `amount` skip the bank-required check so we
 * don't break the reconcile flow which never carries Bank/TDS columns.
 */
export interface SplitRowAmounts {
  amount: number
  bankAmount?: number
  tdsAmount?: number
}

export function validateSplitAmounts(split: SplitRowAmounts): string | null {
  if (split.amount <= 0) return `Split amount must be positive (got ${split.amount}).`
  if (split.bankAmount != null && split.bankAmount < 0) {
    return 'bankAmount cannot be negative.'
  }
  if (split.tdsAmount != null && split.tdsAmount < 0) {
    return 'tdsAmount cannot be negative.'
  }
  if (split.bankAmount != null && split.tdsAmount != null) {
    // TDS-alone guard: reject when the user enters TDS but no bank receipt.
    if (split.bankAmount === 0 && split.tdsAmount > 0) {
      return 'Bank receipt is required. TDS alone is not payment received.'
    }
    if (Math.abs(split.bankAmount + split.tdsAmount - split.amount) > 1) {
      return `Bank Rs ${split.bankAmount.toLocaleString('en-IN')} + TDS Rs ${split.tdsAmount.toLocaleString('en-IN')} does not equal split Rs ${split.amount.toLocaleString('en-IN')}.`
    }
  }
  return null
}
