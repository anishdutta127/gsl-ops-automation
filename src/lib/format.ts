/*
 * Locale and format helpers for GSL MOU.
 *
 * - Money: Indian comma placement (Rs 1,50,000), with optional compact form
 *   (Rs 1.50 L, Rs 7.05 Cr) for tight spaces.
 * - Dates: DD-MMM-YYYY (15-Apr-2026), never the ambiguous MM/DD/YYYY.
 * - Relative: "3 days ago", "in 18 days" via date-fns.
 */

import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

const INDIAN_LOCALE = 'en-IN'

export interface MoneyOptions {
  /** Number of decimals to display (default 0). */
  decimals?: number
  /** When true, render as Rs 4.20 L / Rs 7.05 Cr instead of full digits. */
  compact?: boolean
  /** When true, omit the "Rs" prefix (use for table cells with a column header). */
  bare?: boolean
}

export function formatRs(amount: number | null | undefined, opts: MoneyOptions = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return opts.bare ? '-' : 'Rs -'
  }

  if (opts.compact) {
    return formatCompactRs(amount, opts.bare ?? false)
  }

  const decimals = opts.decimals ?? 0
  const formatted = amount.toLocaleString(INDIAN_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return opts.bare ? formatted : `Rs ${formatted}`
}

function formatCompactRs(amount: number, bare: boolean): string {
  const abs = Math.abs(amount)
  const prefix = bare ? '' : 'Rs '
  if (abs >= 1e7) {
    return `${prefix}${(amount / 1e7).toFixed(2)} Cr`
  }
  if (abs >= 1e5) {
    return `${prefix}${(amount / 1e5).toFixed(2)} L`
  }
  if (abs >= 1e3) {
    return `${prefix}${(amount / 1e3).toFixed(1)}K`
  }
  return formatRs(amount, { bare })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return format(parseISO(iso), 'dd-MMM-yyyy')
  } catch {
    return iso
  }
}

export interface RelativeOptions {
  /** Default true. When false, returns "3 days" rather than "3 days ago". */
  addSuffix?: boolean
}

export function formatRelative(
  iso: string | null | undefined,
  opts: RelativeOptions = {},
): string {
  if (!iso) return '-'
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: opts.addSuffix ?? true })
  } catch {
    return iso
  }
}

/**
 * Convert decimal percent (0.118) or whole percent (11.8) to display string.
 * Pass `decimal: true` for the former, default is whole-number input.
 */
export function formatPct(
  value: number | null | undefined,
  opts: { decimals?: number; decimal?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  const whole = opts.decimal ? value * 100 : value
  return `${whole.toFixed(opts.decimals ?? 1)}%`
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return n.toLocaleString(INDIAN_LOCALE)
}

/**
 * Days-to-expiry colour bucket: green > 90, amber 30-90, red < 30.
 * Returns one of 'success' | 'warning' | 'danger' | 'neutral'.
 */
export function daysBucket(days: number | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (days === null || days === undefined || !Number.isFinite(days)) return 'neutral'
  if (days < 30) return 'danger'
  if (days < 90) return 'warning'
  return 'success'
}

/**
 * Days-overdue from a relative count.
 * Negative days-to-expiry means already expired.
 */
export function expiryLabel(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '-'
  if (days < 0) return `expired ${Math.abs(days)}d ago`
  if (days === 0) return 'expires today'
  return `${days}d`
}
