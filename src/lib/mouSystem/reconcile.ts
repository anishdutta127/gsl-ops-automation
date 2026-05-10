/*
 * Payment reconciliation engine.
 *
 * For a given received amount and date, returns the top N candidate Proforma
 * Invoices ranked by confidence. Multi-formula matching: for each unpaid PI
 * we compute several "expected received" variants (full / after 2% TDS /
 * after 10% TDS / cheque-rounded to nearest Rs 10 or 100) and check each
 * against the received amount with tight tolerance. Combined-PI search
 * handles the "school paid two instalments together" case.
 *
 * Pure function (no imports from data.ts). Testable in isolation.
 */

import type { MOU, Payment } from './types'

// ----------------------------------------------------------------------------
// Configuration

const TDS_RATES = [0, 0.02, 0.10] as const
const ROUNDING_GRANULARITIES = [1, 10, 100] as const
const DEFAULT_TOLERANCE_RUPEES = 1
const DATE_WINDOW_DAYS = 90
const COMBINED_PI_LIMIT = 2 // try sums of up to N PIs from the same school

// Score weights
const AMOUNT_WEIGHT = 0.5
const DATE_WEIGHT = 0.3
const NARRATION_WEIGHT = 0.2

// ----------------------------------------------------------------------------
// Public types

export interface CandidateInput {
  receivedAmount: number
  receivedDate: string // ISO YYYY-MM-DD
  bankReference?: string
  tolerance?: number
}

export type CandidateVariant =
  | 'full'
  | 'after_tds_2'
  | 'after_tds_10'
  | 'rounded_10'
  | 'rounded_100'
  | 'after_tds_2_rounded_10'
  | 'after_tds_2_rounded_100'
  | 'after_tds_10_rounded_10'
  | 'after_tds_10_rounded_100'
  | 'combined'

export interface SingleCandidate {
  kind: 'single'
  payment: Payment
  mou: MOU | null
  variant: CandidateVariant
  expectedAmount: number
  diff: number
  daysApart: number
  amountScore: number
  dateScore: number
  narrationScore: number
  confidence: number
  rationale: string
}

export interface CombinedCandidate {
  kind: 'combined'
  primary: Payment
  secondary: Payment
  mou: MOU | null
  variant: 'combined'
  expectedAmount: number
  diff: number
  daysApart: number
  amountScore: number
  dateScore: number
  narrationScore: number
  confidence: number
  rationale: string
}

export type CandidateResult = SingleCandidate | CombinedCandidate

// ----------------------------------------------------------------------------
// Public API

/**
 * Find ranked PI candidates for a received payment.
 *
 * @returns Top N candidates sorted by confidence desc.
 */
export function findCandidates(
  input: CandidateInput,
  payments: Payment[],
  mous: MOU[],
  topN = 5,
): CandidateResult[] {
  if (!Number.isFinite(input.receivedAmount) || input.receivedAmount <= 0) {
    return []
  }

  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE_RUPEES
  const mouById = new Map(mous.map((m) => [m.id, m]))
  const unpaid = payments.filter((p) => p.status === 'Pending' || p.status === 'Overdue' || p.status === 'Partial')

  const candidates: CandidateResult[] = []

  // Single-PI candidates
  for (const pi of unpaid) {
    const variants = computeVariants(pi.expectedAmount)
    let bestVariant: { label: CandidateVariant; value: number; diff: number } | null = null
    for (const v of variants) {
      const diff = Math.abs(input.receivedAmount - v.value)
      if (diff <= tolerance && (!bestVariant || diff < bestVariant.diff)) {
        bestVariant = { label: v.label, value: v.value, diff }
      }
    }
    if (bestVariant) {
      const mou = mouById.get(pi.mouId) ?? null
      candidates.push(
        scoreSingle(pi, mou, bestVariant.label, bestVariant.value, bestVariant.diff, input),
      )
    }
  }

  // Combined-PI candidates: same school, sum of two
  if (COMBINED_PI_LIMIT >= 2) {
    const bySchool = groupBy(unpaid, (p) => mouById.get(p.mouId)?.schoolId ?? p.mouId)
    for (const schoolPis of Array.from(bySchool.values())) {
      if (schoolPis.length < 2) continue
      for (let i = 0; i < schoolPis.length; i++) {
        for (let j = i + 1; j < schoolPis.length; j++) {
          const a = schoolPis[i]!
          const b = schoolPis[j]!
          const combinedBase = a.expectedAmount + b.expectedAmount
          const variants = computeVariants(combinedBase)
          let best: { value: number; diff: number } | null = null
          for (const v of variants) {
            const diff = Math.abs(input.receivedAmount - v.value)
            if (diff <= tolerance && (!best || diff < best.diff)) {
              best = { value: v.value, diff }
            }
          }
          if (best) {
            const mou = mouById.get(a.mouId) ?? null
            candidates.push(scoreCombined(a, b, mou, best.value, best.diff, input))
          }
        }
      }
    }
  }

  return candidates.sort((x, y) => y.confidence - x.confidence).slice(0, topN)
}

// ----------------------------------------------------------------------------
// Variant computation

interface Variant {
  label: CandidateVariant
  value: number
}

function computeVariants(baseAmount: number): Variant[] {
  const out: Variant[] = []
  for (const tds of TDS_RATES) {
    const afterTds = baseAmount * (1 - tds)
    for (const granularity of ROUNDING_GRANULARITIES) {
      const rounded = Math.round(afterTds / granularity) * granularity
      out.push({ label: variantLabel(tds, granularity), value: round2(rounded) })
    }
  }
  return out
}

function variantLabel(tds: number, granularity: number): CandidateVariant {
  if (tds === 0) {
    if (granularity === 1) return 'full'
    if (granularity === 10) return 'rounded_10'
    return 'rounded_100'
  }
  if (tds === 0.02) {
    if (granularity === 1) return 'after_tds_2'
    if (granularity === 10) return 'after_tds_2_rounded_10'
    return 'after_tds_2_rounded_100'
  }
  if (granularity === 1) return 'after_tds_10'
  if (granularity === 10) return 'after_tds_10_rounded_10'
  return 'after_tds_10_rounded_100'
}

// ----------------------------------------------------------------------------
// Scoring

function scoreSingle(
  payment: Payment,
  mou: MOU | null,
  variant: CandidateVariant,
  expectedAmount: number,
  diff: number,
  input: CandidateInput,
): SingleCandidate {
  const amountScore = expectedAmount > 0 ? Math.max(0, 1 - diff / expectedAmount) : 0
  const daysApart = paymentDaysApart(payment, input.receivedDate)
  const dateScore = scoreDate(daysApart)
  const narrationScore = scoreNarration(input.bankReference, payment, mou)
  const confidence =
    amountScore * AMOUNT_WEIGHT + dateScore * DATE_WEIGHT + narrationScore * NARRATION_WEIGHT

  return {
    kind: 'single',
    payment,
    mou,
    variant,
    expectedAmount,
    diff: round2(diff),
    daysApart,
    amountScore: round3(amountScore),
    dateScore: round3(dateScore),
    narrationScore: round3(narrationScore),
    confidence: round3(confidence),
    rationale: buildSingleRationale(variant, daysApart, narrationScore, mou),
  }
}

function scoreCombined(
  primary: Payment,
  secondary: Payment,
  mou: MOU | null,
  expectedAmount: number,
  diff: number,
  input: CandidateInput,
): CombinedCandidate {
  const amountScore = expectedAmount > 0 ? Math.max(0, 1 - diff / expectedAmount) : 0
  const earlier = pickEarlier(primary, secondary)
  const daysApart = paymentDaysApart(earlier, input.receivedDate)
  const dateScore = scoreDate(daysApart)
  const narrationScore = Math.max(
    scoreNarration(input.bankReference, primary, mou),
    scoreNarration(input.bankReference, secondary, mou),
  )
  // Combined gets a small confidence penalty since it is more speculative.
  const confidence =
    (amountScore * AMOUNT_WEIGHT + dateScore * DATE_WEIGHT + narrationScore * NARRATION_WEIGHT) *
    0.9

  return {
    kind: 'combined',
    primary,
    secondary,
    mou,
    variant: 'combined',
    expectedAmount,
    diff: round2(diff),
    daysApart,
    amountScore: round3(amountScore),
    dateScore: round3(dateScore),
    narrationScore: round3(narrationScore),
    confidence: round3(confidence),
    rationale: `Combined ${primary.instalmentLabel} + ${secondary.instalmentLabel} for ${mou?.schoolName ?? 'this school'}`,
  }
}

function paymentDaysApart(payment: Payment, receivedIso: string): number {
  if (!payment.dueDateIso) return Number.POSITIVE_INFINITY
  return Math.abs(daysBetween(receivedIso, payment.dueDateIso))
}

function pickEarlier(a: Payment, b: Payment): Payment {
  if (!a.dueDateIso) return b
  if (!b.dueDateIso) return a
  return a.dueDateIso <= b.dueDateIso ? a : b
}

function scoreDate(daysApart: number): number {
  if (!Number.isFinite(daysApart)) return 0
  return Math.max(0, 1 - daysApart / DATE_WINDOW_DAYS)
}

function scoreNarration(ref: string | undefined, payment: Payment, mou: MOU | null): number {
  if (!ref) return 0
  const refLower = ref.toLowerCase()

  if (payment.piNumber && refLower.includes(payment.piNumber.toLowerCase())) return 1.0

  if (payment.piNumber) {
    const lastSegment = payment.piNumber.split('/').pop()?.trim()
    if (lastSegment && lastSegment.length >= 2 && refLower.includes(lastSegment.toLowerCase())) {
      return 0.4
    }
  }

  const schoolName = mou?.schoolName ?? payment.schoolName
  if (schoolName && fuzzyContains(refLower, schoolName.toLowerCase())) return 0.7

  return 0
}

function fuzzyContains(haystack: string, needle: string): boolean {
  // Tokenise the needle on whitespace and punctuation; require >=50% of
  // tokens of length >= 3 to appear in the haystack.
  const tokens = needle
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3)
  if (tokens.length === 0) return false
  let hit = 0
  for (const t of tokens) {
    if (haystack.includes(t)) hit++
  }
  return hit / tokens.length >= 0.5
}

function buildSingleRationale(
  variant: CandidateVariant,
  daysApart: number,
  narrationScore: number,
  _mou: MOU | null,
): string {
  const parts: string[] = []
  if (variant === 'full') parts.push('Exact match')
  else if (variant === 'after_tds_2') parts.push('Exact match minus 2% TDS')
  else if (variant === 'after_tds_10') parts.push('Exact match minus 10% TDS')
  else if (variant.startsWith('after_tds_2_rounded')) parts.push('Match after 2% TDS, cheque-rounded')
  else if (variant.startsWith('after_tds_10_rounded')) parts.push('Match after 10% TDS, cheque-rounded')
  else if (variant.startsWith('rounded')) parts.push('Match cheque-rounded')

  if (Number.isFinite(daysApart)) {
    if (daysApart === 0) parts.push('due today')
    else if (daysApart <= 7) parts.push(`due ${daysApart} days off`)
    else parts.push(`${daysApart} days from due`)
  }

  if (narrationScore >= 1.0) parts.push('PI number in narration')
  else if (narrationScore >= 0.7) parts.push('school name in narration')
  else if (narrationScore >= 0.4) parts.push('PI suffix in narration')

  return parts.join(', ')
}

// ----------------------------------------------------------------------------
// Helpers

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.round((a - b) / (1000 * 60 * 60 * 24))
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of arr) {
    const key = keyFn(item)
    const list = out.get(key)
    if (list) list.push(item)
    else out.set(key, [item])
  }
  return out
}
