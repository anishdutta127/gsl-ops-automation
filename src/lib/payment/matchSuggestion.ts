/*
 * Bank-statement match suggestion (Phase 4 Step 5, 2026-05-19).
 *
 * Pranav's batch entry totals (Rs 4.5L over 3 instalments) ought to
 * line up against an existing unmatched PaymentLog row (the bank
 * narration was parked because the auto-matcher could not pin it to
 * any single instalment). This helper closes the loop: given a batch
 * total + optional bank reference, surface the unmatched PaymentLog
 * row(s) that are likely the same money.
 *
 * The suggestion is **non-blocking**. The batch form shows it as a
 * banner with a single "Confirm match" CTA; the operator can ignore
 * and the batch saves anyway.
 *
 * Heuristics (lowest-cost match wins):
 *   1. Exact bank-reference equality (case-insensitive trim).
 *   2. Exact amount equality + within 14 days of receivedDate.
 *   3. Amount within 1 Rs tolerance + within 14 days.
 *
 * Returns at most 3 candidates so the banner stays compact.
 */

import type { PaymentLog } from '@/lib/types'

export interface MatchSuggestionArgs {
  /** Sum of bankAmount across the batch rows (TDS is school-deducted, not bank-side). */
  totalBankAmount: number
  /** Optional UTR / cheque ref entered on the batch header. */
  bankReference: string | null
  /** ISO yyyy-mm-dd of the batch payment date. */
  receivedDate: string
  /** PaymentLog candidates - typically every row with unmatched=true. */
  candidates: PaymentLog[]
}

export interface MatchSuggestion {
  paymentLog: PaymentLog
  reason: 'reference-match' | 'amount-and-date' | 'amount-only'
  daysApart: number
}

const FOURTEEN_DAYS_MS = 14 * 86400 * 1000

function daysApart(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.abs(a - b) / 86400000
}

export function suggestMatches(args: MatchSuggestionArgs): MatchSuggestion[] {
  const out: MatchSuggestion[] = []
  const seen = new Set<string>()
  const ref = (args.bankReference ?? '').trim().toLowerCase()

  // Tier 1: exact bank-reference equality.
  if (ref !== '') {
    for (const pl of args.candidates) {
      if (!pl.unmatched) continue
      const plRef = (pl.reference ?? '').trim().toLowerCase()
      if (plRef !== '' && plRef === ref && !seen.has(pl.id)) {
        out.push({
          paymentLog: pl,
          reason: 'reference-match',
          daysApart: daysApart(pl.date, args.receivedDate),
        })
        seen.add(pl.id)
      }
    }
  }

  // Tier 2: exact amount equality + within 14 days.
  for (const pl of args.candidates) {
    if (!pl.unmatched || seen.has(pl.id)) continue
    if (pl.amount === args.totalBankAmount) {
      const d = daysApart(pl.date, args.receivedDate)
      if (d <= 14) {
        out.push({ paymentLog: pl, reason: 'amount-and-date', daysApart: d })
        seen.add(pl.id)
      }
    }
  }

  // Tier 3: amount within 1 Rs tolerance + within 14 days.
  for (const pl of args.candidates) {
    if (!pl.unmatched || seen.has(pl.id)) continue
    if (Math.abs(pl.amount - args.totalBankAmount) <= 1) {
      const d = daysApart(pl.date, args.receivedDate)
      if (d <= 14) {
        out.push({ paymentLog: pl, reason: 'amount-only', daysApart: d })
        seen.add(pl.id)
      }
    }
  }

  return out.slice(0, 3)
}

// Re-export the millisecond constant so tests can assert the window
// stays at 14 days without parsing the inline literal.
export const MATCH_WINDOW_MS = FOURTEEN_DAYS_MS
