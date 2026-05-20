/*
 * Phase 6C PI backfill matcher.
 *
 * The Pratik FY 25-26 / Pranav FY 26-27 Excel imports landed ~126 paid
 * payment rows into Ops with the piNumber column blank on the source
 * sheet. The system can still mint fresh PI numbers against these
 * instalments and the counter advances normally; this matcher
 * connects each Ops paid-no-PI row to the corresponding Pratik
 * import instalment by amount + month + school so Pranav can apply
 * fresh PIs with full confidence about which Excel row each PI
 * traces back to.
 *
 * Discipline:
 *   - Pure function; no IO. Apply side is in piBackfillApply.ts.
 *   - Match tolerance: amount within Rs 10, due date within +/- 30
 *     days, school name normalized (case + whitespace).
 *   - Three buckets: auto-matched (exactly 1 candidate), needs-review
 *     (2+ candidates), impossible (0 candidates).
 */

import type { MOU, Payment } from '@/lib/types'
import type { ImportRecord } from './fy2526Import'
import { normalizeSchoolName, parseInstalmentMonth } from './fy2526Import'

const AMOUNT_TOLERANCE_RS = 10
const DAYS_TOLERANCE = 30

export interface BackfillCandidate {
  /** Stable id Pranav can refer to: "<schoolName>::<instalmentNo>::<amount>". */
  candidateId: string
  schoolName: string
  instalmentNo: number
  amountRs: number
  monthRaw: string | null
  monthIso: string | null
}

export type BackfillRow =
  | {
      kind: 'auto-matched'
      payment: Payment
      mouId: string
      candidate: BackfillCandidate
    }
  | {
      kind: 'needs-review'
      payment: Payment
      mouId: string
      candidates: BackfillCandidate[]
    }
  | {
      kind: 'impossible'
      payment: Payment
      mouId: string
      reason: string
    }

export interface BackfillPlan {
  rows: BackfillRow[]
  totals: {
    autoMatched: number
    needsReview: number
    impossible: number
  }
}

function dayDiff(aIso: string | null, bIso: string | null): number | null {
  if (!aIso || !bIso) return null
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.abs((a - b) / 86400000)
}

function asCandidate(
  schoolName: string,
  instalmentNo: number,
  amountRs: number,
  monthRaw: string | null,
): BackfillCandidate {
  const parsed = parseInstalmentMonth(monthRaw)
  return {
    candidateId: `${normalizeSchoolName(schoolName)}::${instalmentNo}::${Math.round(amountRs)}`,
    schoolName,
    instalmentNo,
    amountRs,
    monthRaw: parsed.raw,
    monthIso: parsed.iso,
  }
}

export interface BuildBackfillPlanArgs {
  payments: Payment[]
  mous: MOU[]
  importRecords: ImportRecord[]
}

export function buildBackfillPlan(args: BuildBackfillPlanArgs): BackfillPlan {
  const { payments, mous, importRecords } = args
  const mouById = new Map(mous.map((m) => [m.id, m]))
  // Pre-build per-school candidate lists from Pratik's import.
  const candidatesBySchool = new Map<string, BackfillCandidate[]>()
  for (const rec of importRecords) {
    const norm = normalizeSchoolName(rec.schoolName)
    const cands = candidatesBySchool.get(norm) ?? []
    for (const inst of rec.instalments) {
      cands.push(
        asCandidate(rec.schoolName, inst.instalmentNo, inst.amount, inst.month),
      )
    }
    candidatesBySchool.set(norm, cands)
  }

  const rows: BackfillRow[] = []
  for (const p of payments) {
    // Only paid-no-PI rows qualify.
    if (!((p.receivedAmount ?? 0) > 0)) continue
    if (p.piNumber && String(p.piNumber).trim() !== '') continue
    const schoolKey = normalizeSchoolName(p.schoolName ?? '')
    const pool = candidatesBySchool.get(schoolKey) ?? []
    const matches: BackfillCandidate[] = []
    for (const c of pool) {
      const amountClose =
        Math.abs((p.receivedAmount ?? 0) - c.amountRs) <= AMOUNT_TOLERANCE_RS
      if (!amountClose) continue
      // Date tolerance: prefer p.receivedDate, fall back to dueDateIso.
      const paymentDate = p.receivedDate ?? p.dueDateIso
      const diff = dayDiff(paymentDate, c.monthIso)
      // If either date is missing, accept the amount-only match (better
      // surfaced as a candidate than dropped silently).
      if (diff !== null && diff > DAYS_TOLERANCE) continue
      matches.push(c)
    }
    const mouId = p.mouId
    const mou = mouById.get(mouId)
    if (matches.length === 1) {
      rows.push({
        kind: 'auto-matched',
        payment: p,
        mouId,
        candidate: matches[0]!,
      })
    } else if (matches.length > 1) {
      rows.push({
        kind: 'needs-review',
        payment: p,
        mouId,
        candidates: matches,
      })
    } else {
      rows.push({
        kind: 'impossible',
        payment: p,
        mouId,
        reason: mou
          ? `No Pratik instalment matches amount Rs ${p.receivedAmount?.toLocaleString('en-IN')} for school ${p.schoolName ?? '(unknown)'} within +/- Rs ${AMOUNT_TOLERANCE_RS} and +/- ${DAYS_TOLERANCE} days. Pranav can type a manual PI number.`
          : `MOU ${mouId} not in mous.json (orphan payment row); Pranav can type a manual PI number after creating the missing MOU.`,
      })
    }
  }

  return {
    rows,
    totals: {
      autoMatched: rows.filter((r) => r.kind === 'auto-matched').length,
      needsReview: rows.filter((r) => r.kind === 'needs-review').length,
      impossible: rows.filter((r) => r.kind === 'impossible').length,
    },
  }
}
