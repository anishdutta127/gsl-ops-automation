/*
 * PaymentLog -> Payment reconciliation shortlist (Q-G Test 3).
 *
 * Pure read function. For an unmatched PaymentLog (a bank entry that
 * has not yet been mapped to one or more receivable Payments), returns
 * the top-N candidate Payments ranked by a heuristic score plus a
 * human-readable list of reasons per candidate.
 *
 * Determinism contract:
 *   - Same input -> same output ordering. No Date.now(), no random,
 *     no Math.random(). All recency comparisons use the PaymentLog's
 *     own `date` field as the baseline (NOT current wall-clock).
 *   - Tie-break order is fixed: score desc, then recency-from-
 *     paymentLog-date asc, then paymentId asc. Stable across runs.
 *
 * Heuristic per step 8 spec:
 *   - amount-match: dominant. Tier on |expected - log| / log:
 *       < 1%   -> exact      (+100)
 *       < 5%   -> within 5%  (+60)
 *       < 10%  -> within 10% (+30)
 *       >= 10% -> filtered out (delta > tolerance also filters)
 *   - school-match: secondary. +20 if any 5+-char word from
 *     payment.schoolName appears (case-insensitive substring) in the
 *     paymentLog.narration.
 *   - reference / MOU-match: tertiary. +10 if paymentLog.reference
 *     contains the payment's piNumber (case-insensitive substring).
 *   - recency: TIE-BREAK ONLY. Does not contribute to score; orders
 *     candidates with equal score so the more-recently-issued PI
 *     appears first.
 *
 * Tolerance:
 *   - Default 0.01 (1%). Only "exact" tier survives.
 *   - Widened (e.g. 0.10): the within-5% and within-10% tiers also
 *     survive. The widened result is a strict superset of the default
 *     result over the same fixture.
 *
 * Eligibility:
 *   - Only Payments with status in {'PI Sent', 'Due Soon', 'Overdue'}
 *     AND piNumber !== null are candidates. A Payment with status
 *     'Pending' (no PI generated yet) is not a reconciliation target;
 *     a 'Received' Payment is already reconciled.
 *
 * Testability seam: `deps` parameter accepts an optional
 * { payments: Payment[] } bundle. Defaults to the JSON fixture.
 */

import type { Payment, PaymentLog } from '@/lib/types'
import paymentsJson from '@/data/payments.json'

const ELIGIBLE_STATUSES: ReadonlySet<Payment['status']> = new Set<Payment['status']>([
  'PI Sent',
  'Due Soon',
  'Overdue',
])

const DEFAULT_TOLERANCE = 0.01
const DEFAULT_LIMIT = 3
const SCHOOL_WORD_MIN = 5

function isEligibleCandidate(p: Payment): boolean {
  return ELIGIBLE_STATUSES.has(p.status) && p.piNumber !== null
}

interface AmountTier {
  score: number
  label: 'exact' | 'within-5' | 'within-10' | 'out'
}

function amountTier(delta: number): AmountTier {
  if (delta < 0.01) return { score: 100, label: 'exact' }
  if (delta < 0.05) return { score: 60, label: 'within-5' }
  if (delta < 0.10) return { score: 30, label: 'within-10' }
  return { score: 0, label: 'out' }
}

function schoolNameWords(schoolName: string): string[] {
  return schoolName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= SCHOOL_WORD_MIN)
}

function schoolMatchesNarration(narration: string | null, schoolName: string): boolean {
  if (!narration) return false
  const lower = narration.toLowerCase()
  return schoolNameWords(schoolName).some((w) => lower.includes(w))
}

function referenceMatchesPi(reference: string | null, piNumber: string | null): boolean {
  if (!reference || !piNumber) return false
  return reference.toLowerCase().includes(piNumber.toLowerCase())
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  return Math.round(ms / (24 * 3600 * 1000))
}

export interface Candidate {
  paymentId: string
  score: number
  reasons: string[]
}

export interface ShortlistOptions {
  tolerance?: number
  limit?: number
}

export interface ReconcileDeps {
  payments: Payment[]
}

const defaultDeps: ReconcileDeps = {
  payments: paymentsJson as unknown as Payment[],
}

export class ReconcileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReconcileError'
  }
}

export function shortlistCandidates(
  paymentLog: PaymentLog,
  options: ShortlistOptions = {},
  deps: ReconcileDeps = defaultDeps,
): Candidate[] {
  if (!paymentLog || typeof paymentLog.amount !== 'number' || paymentLog.amount <= 0) {
    throw new ReconcileError(
      'paymentLog.amount must be a positive number; cannot reconcile zero/negative entries',
    )
  }

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
  const limit = options.limit ?? DEFAULT_LIMIT

  const scored: Array<{
    candidate: Candidate
    daysFromLog: number
  }> = []

  for (const payment of deps.payments) {
    if (!isEligibleCandidate(payment)) continue

    const delta = Math.abs(payment.expectedAmount - paymentLog.amount) / paymentLog.amount
    if (delta > tolerance) continue

    const reasons: string[] = []
    let score = 0

    const tier = amountTier(delta)
    if (tier.label === 'exact') reasons.push('amount: exact match')
    else if (tier.label === 'within-5') reasons.push('amount: within 5%')
    else if (tier.label === 'within-10') reasons.push('amount: within 10%')
    score += tier.score

    if (schoolMatchesNarration(paymentLog.narration, payment.schoolName)) {
      score += 20
      reasons.push('school: narration matches school name')
    }

    if (referenceMatchesPi(paymentLog.reference, payment.piNumber)) {
      score += 10
      reasons.push('reference: matches PI number')
    }

    const daysFromLog = payment.piSentDate
      ? daysBetween(paymentLog.date, payment.piSentDate)
      : Number.MAX_SAFE_INTEGER

    scored.push({
      candidate: { paymentId: payment.id, score, reasons },
      daysFromLog,
    })
  }

  scored.sort((a, b) => {
    if (a.candidate.score !== b.candidate.score) {
      return b.candidate.score - a.candidate.score
    }
    if (a.daysFromLog !== b.daysFromLog) {
      return a.daysFromLog - b.daysFromLog
    }
    return a.candidate.paymentId.localeCompare(b.candidate.paymentId)
  })

  return scored.slice(0, limit).map((s) => s.candidate)
}
