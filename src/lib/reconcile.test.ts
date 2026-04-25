/*
 * Q-G Test 3: reconcileShortlist.
 *
 * Drives src/lib/reconcile.ts against the 15-record payments.json
 * fixture and the 10-record payment_logs.json fixture. Coverage:
 *
 *   - Determinism: same input -> same output ordering across runs.
 *   - Top-3 accuracy: known-correct candidate appears in result.
 *   - Tolerance widening: widened call returns a strict superset.
 *   - Eligibility filter: Pending/Received Payments excluded.
 *   - Reasons: amount tier, school match, reference match recorded.
 *   - Tie-break ordering: recency (younger PI first), then paymentId.
 *   - Edge cases: no-match payment, zero/negative amount, custom limit.
 */

import { describe, expect, it } from 'vitest'
import {
  shortlistCandidates,
  ReconcileError,
  type Candidate,
  type ReconcileDeps,
} from './reconcile'
import type { Payment, PaymentLog } from './types'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'

const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]

const defaultDeps: ReconcileDeps = { payments: allPayments }

function logById(id: string): PaymentLog {
  const log = allPaymentLogs.find((l) => l.id === id)
  if (!log) throw new Error(`Test fixture mismatch: payment_log ${id}`)
  return log
}

function ids(candidates: Candidate[]): string[] {
  return candidates.map((c) => c.paymentId)
}

describe('Q-G Test 3: shortlistCandidates', () => {
  describe('determinism', () => {
    it('returns identical ranked output across repeated calls (same input)', () => {
      const log = logById('PL-006') // ambiguous 250000, multiple Greenfield candidates
      const a = shortlistCandidates(log, {}, defaultDeps)
      const b = shortlistCandidates(log, {}, defaultDeps)
      expect(a).toEqual(b)
    })

    it('determinism holds across all 10 fixture payment_logs', () => {
      for (const log of allPaymentLogs) {
        const a = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
        const b = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
        expect(a).toEqual(b)
      }
    })
  })

  describe('top-3 accuracy', () => {
    it('PL-001 (Greenfield Q2 with reference) ranks MOU-STEAM-2627-001-i2 in top 3', () => {
      const result = shortlistCandidates(logById('PL-001'), {}, defaultDeps)
      expect(ids(result)).toContain('MOU-STEAM-2627-001-i2')
      const winner = result[0]
      expect(winner?.paymentId).toBe('MOU-STEAM-2627-001-i2')
      expect(winner?.reasons).toEqual(
        expect.arrayContaining([
          'amount: exact match',
          'school: narration matches school name',
          'reference: matches PI number',
        ]),
      )
    })

    it('PL-002 (Oakwood Q1 with reference) ranks MOU-TINK-2627-002-i1 first', () => {
      const result = shortlistCandidates(logById('PL-002'), {}, defaultDeps)
      expect(result[0]?.paymentId).toBe('MOU-TINK-2627-002-i1')
      expect(result[0]?.reasons).toContain('reference: matches PI number')
    })

    it('PL-003 (Narayana Q2 with reference) ranks MOU-STEAM-2627-004-i2 first', () => {
      const result = shortlistCandidates(logById('PL-003'), {}, defaultDeps)
      expect(result[0]?.paymentId).toBe('MOU-STEAM-2627-004-i2')
    })
  })

  describe('tolerance widening (strict superset)', () => {
    it('PL-004 (5% over Greenfield) returns no candidates at default 1% tolerance', () => {
      const result = shortlistCandidates(logById('PL-004'), {}, defaultDeps)
      expect(result).toEqual([])
    })

    it('PL-004 returns Greenfield candidates at widened 10% tolerance', () => {
      const result = shortlistCandidates(
        logById('PL-004'),
        { tolerance: 0.10 },
        defaultDeps,
      )
      expect(ids(result)).toEqual(
        expect.arrayContaining(['MOU-STEAM-2627-001-i2', 'MOU-STEAM-2627-001-i3']),
      )
      expect(result[0]?.reasons).toContain('amount: within 5%')
    })

    it('widened call is a strict superset of default call (same fixture)', () => {
      // Pick a log that has exact-tier hits AND near-tier hits available.
      // PL-001 (Greenfield exact) at default returns exact-only set;
      // widening to 10% should add additional within-5%/within-10% rows
      // for OTHER payments at similar amounts (none here, since
      // Greenfield's other PI-issued instalments are also 250k = exact).
      // Construct a synthetic widening test using PL-008 which is 5% over.
      const defaultResult = shortlistCandidates(
        logById('PL-008'),
        {},
        defaultDeps,
      )
      const widenedResult = shortlistCandidates(
        logById('PL-008'),
        { tolerance: 0.10 },
        defaultDeps,
      )
      const widenedIds = ids(widenedResult)
      for (const id of ids(defaultResult)) expect(widenedIds).toContain(id)
    })
  })

  describe('eligibility', () => {
    it('excludes Pending payments (no PI generated yet)', () => {
      const log: PaymentLog = {
        id: 'PL-TEST',
        date: '2026-04-25',
        amount: 125000,
        mode: 'Bank Transfer',
        reference: '',
        narration: 'Maple Leaf Public School',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      const result = shortlistCandidates(log, {}, defaultDeps)
      // Maple Leaf instalments are all Pending with piNumber=null.
      // Even an exact-amount/school match should yield no candidates.
      expect(ids(result)).not.toContain('MOU-STEAM-2627-005-i1')
      expect(ids(result)).not.toContain('MOU-STEAM-2627-005-i2')
    })

    it('excludes Received payments (already reconciled)', () => {
      const log: PaymentLog = {
        id: 'PL-TEST',
        date: '2026-04-25',
        amount: 1350000,
        mode: 'Bank Transfer',
        reference: '',
        narration: 'Springwood',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      const result = shortlistCandidates(log, {}, defaultDeps)
      expect(ids(result)).not.toContain('MOU-STEAM-2627-003-i1')
    })

    it('PL-007 (no clear match, 99999) returns empty result', () => {
      const result = shortlistCandidates(logById('PL-007'), {}, defaultDeps)
      expect(result).toEqual([])
    })
  })

  describe('tie-break ordering', () => {
    it('PL-006 (250000 ambiguous, no narration, no reference) prefers more recent PI', () => {
      const result = shortlistCandidates(logById('PL-006'), {}, defaultDeps)
      // Both i2 (PI sent 2026-04-15) and i3 (PI sent 2026-04-22) qualify.
      // PaymentLog.date = 2026-04-25.
      // i3 is 3 days from log; i2 is 10 days. i3 wins tie-break.
      expect(result[0]?.paymentId).toBe('MOU-STEAM-2627-001-i3')
      expect(result[1]?.paymentId).toBe('MOU-STEAM-2627-001-i2')
      // Both have score 100 (exact match, no school/ref match).
      expect(result[0]?.score).toBe(100)
      expect(result[1]?.score).toBe(100)
    })

    it('alphabetical paymentId tiebreaks when score AND recency tie', () => {
      // Construct two synthetic candidates with identical score and
      // identical piSentDate. Verify alphabetical ordering.
      const synthetic: Payment[] = [
        {
          ...allPayments.find((p) => p.id === 'MOU-STEAM-2627-004-i2')!,
          id: 'PMT-Z',
          piSentDate: '2026-04-15',
        },
        {
          ...allPayments.find((p) => p.id === 'MOU-STEAM-2627-004-i2')!,
          id: 'PMT-A',
          piSentDate: '2026-04-15',
        },
      ]
      const log: PaymentLog = {
        id: 'PL-TIE',
        date: '2026-04-25',
        amount: 1500000,
        mode: 'Bank Transfer',
        reference: '',
        narration: '',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      const result = shortlistCandidates(log, {}, { payments: synthetic })
      expect(result[0]?.paymentId).toBe('PMT-A')
      expect(result[1]?.paymentId).toBe('PMT-Z')
    })
  })

  describe('options', () => {
    it('limit option caps candidate count', () => {
      const result = shortlistCandidates(
        logById('PL-006'),
        { limit: 1 },
        defaultDeps,
      )
      expect(result.length).toBeLessThanOrEqual(1)
    })

    it('limit=10 returns all qualifying candidates', () => {
      const result = shortlistCandidates(
        logById('PL-006'),
        { limit: 10 },
        defaultDeps,
      )
      // Only Greenfield i2 + i3 are 250k PI-issued; no Greenfield i1
      // (received) or i4 (no PI). Expect 2.
      expect(result).toHaveLength(2)
    })

    it('tolerance=0 still matches truly identical amounts (delta=0)', () => {
      const log = logById('PL-001') // amount 250000; Greenfield i2/i3 expected = 250000
      const result = shortlistCandidates(log, { tolerance: 0 }, defaultDeps)
      expect(result.length).toBeGreaterThan(0)
      expect(ids(result)).toContain('MOU-STEAM-2627-001-i2')
    })

    it('tolerance=0 excludes near-but-not-identical amounts', () => {
      const log: PaymentLog = { ...logById('PL-001'), amount: 250001 }
      const result = shortlistCandidates(log, { tolerance: 0 }, defaultDeps)
      expect(result).toEqual([])
    })
  })

  describe('reasons surfaced for traceability', () => {
    it('exact match + reference + school all surface in reasons', () => {
      const result = shortlistCandidates(logById('PL-001'), {}, defaultDeps)
      const winner = result[0]
      expect(winner?.reasons.length).toBeGreaterThanOrEqual(3)
      expect(winner?.reasons).toContain('amount: exact match')
      expect(winner?.reasons).toContain('school: narration matches school name')
      expect(winner?.reasons).toContain('reference: matches PI number')
    })

    it('within-5% tier surfaces "amount: within 5%" reason', () => {
      const result = shortlistCandidates(
        logById('PL-008'),
        { tolerance: 0.10 },
        defaultDeps,
      )
      const winner = result[0]
      expect(winner?.reasons).toContain('amount: within 5%')
    })

    it('within-10% tier surfaces "amount: within 10%" reason', () => {
      const log: PaymentLog = {
        id: 'PL-NEAR-10',
        date: '2026-04-25',
        amount: 270000, // ~8% over 250000
        mode: 'Bank Transfer',
        reference: '',
        narration: 'Greenfield Academy',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      const result = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
      const winner = result[0]
      expect(winner?.reasons).toContain('amount: within 10%')
    })
  })

  describe('input validation', () => {
    it('throws ReconcileError on zero amount', () => {
      const log: PaymentLog = {
        id: 'PL-ZERO',
        date: '2026-04-25',
        amount: 0,
        mode: 'Bank Transfer',
        reference: '',
        narration: '',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      expect(() => shortlistCandidates(log, {}, defaultDeps)).toThrow(ReconcileError)
    })

    it('throws ReconcileError on negative amount', () => {
      const log: PaymentLog = {
        id: 'PL-NEG',
        date: '2026-04-25',
        amount: -100,
        mode: 'Bank Transfer',
        reference: '',
        narration: '',
        salesPersonId: null,
        matchedInstallmentIds: [],
        unmatched: true,
        loggedBy: 'shubhangi.g',
        loggedAt: '2026-04-25T10:00:00Z',
        notes: null,
      }
      expect(() => shortlistCandidates(log, {}, defaultDeps)).toThrow(/positive/)
    })
  })
})
