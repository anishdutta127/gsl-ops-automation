/*
 * Q-G Test 3: reconcileShortlist.
 *
 * Drives src/lib/reconcile.ts against synthetic inline Payment +
 * PaymentLog fixtures. Decoupled from disk state so the suite is
 * stable across fixture refreshes (W3-A.2 refactor: post-import
 * payments.json carries 197 records with a different shape and the
 * old identity-coupled assertions did not survive). The reconcile
 * lib's logic is what is being verified; fixture data is just input.
 *
 * Coverage:
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

// ----------------------------------------------------------------------------
// Synthetic fixture factory
// ----------------------------------------------------------------------------

function payment(overrides: Partial<Payment> & Pick<Payment, 'id' | 'mouId'>): Payment {
  return {
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 100000,
    receivedAmount: null,
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
    partialPayments: null,
    auditLog: null,
    ...overrides,
  }
}

function paymentLog(overrides: Partial<PaymentLog> & Pick<PaymentLog, 'id' | 'amount'>): PaymentLog {
  return {
    date: '2026-04-25',
    mode: 'Bank Transfer',
    reference: null,
    narration: null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: true,
    loggedBy: 'shubhangi.g',
    loggedAt: '2026-04-25T10:00:00Z',
    notes: null,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Canonical synthetic dataset
// ----------------------------------------------------------------------------

const greenfieldI1 = payment({
  id: 'TEST-GREEN-i1', mouId: 'TEST-GREEN', schoolName: 'Greenfield Academy',
  expectedAmount: 250000, status: 'Received', piNumber: 'GSL/OPS/26-27/0001',
})
const greenfieldI2 = payment({
  id: 'TEST-GREEN-i2', mouId: 'TEST-GREEN', schoolName: 'Greenfield Academy',
  expectedAmount: 250000, status: 'PI Sent',
  piNumber: 'GSL/OPS/26-27/0002', piSentDate: '2026-04-15',
})
const greenfieldI3 = payment({
  id: 'TEST-GREEN-i3', mouId: 'TEST-GREEN', schoolName: 'Greenfield Academy',
  expectedAmount: 250000, status: 'PI Sent',
  piNumber: 'GSL/OPS/26-27/0003', piSentDate: '2026-04-22',
})
const greenfieldI4 = payment({
  id: 'TEST-GREEN-i4', mouId: 'TEST-GREEN', schoolName: 'Greenfield Academy',
  expectedAmount: 250000, status: 'Pending',
})
const oakwoodTinkI1 = payment({
  id: 'TEST-OAK-TINK-i1', mouId: 'TEST-OAK-TINK', schoolName: 'Oakwood Senior Secondary',
  expectedAmount: 750000, status: 'PI Sent',
  piNumber: 'GSL/OPS/26-27/0010', piSentDate: '2026-04-18',
})
const narayanaI2 = payment({
  id: 'TEST-NARAYANA-i2', mouId: 'TEST-NARAYANA', schoolName: 'Narayana ASN',
  expectedAmount: 1500000, status: 'PI Sent',
  piNumber: 'GSL/OPS/26-27/0007', piSentDate: '2026-04-20',
})
const springwoodI1 = payment({
  id: 'TEST-SPRING-i1', mouId: 'TEST-SPRING', schoolName: 'Springwood',
  expectedAmount: 1350000, status: 'Received', piNumber: 'GSL/OPS/26-27/0005',
})
const mapleLeafI1 = payment({
  id: 'TEST-MAPLE-i1', mouId: 'TEST-MAPLE', schoolName: 'Maple Leaf Public School',
  expectedAmount: 125000, status: 'Pending',
})
const mapleLeafI2 = payment({
  id: 'TEST-MAPLE-i2', mouId: 'TEST-MAPLE', schoolName: 'Maple Leaf Public School',
  expectedAmount: 125000, status: 'Pending',
})

const allPayments: Payment[] = [
  greenfieldI1, greenfieldI2, greenfieldI3, greenfieldI4,
  oakwoodTinkI1, narayanaI2, springwoodI1, mapleLeafI1, mapleLeafI2,
]

const PL_001 = paymentLog({
  id: 'PL-001', amount: 250000,
  narration: 'Greenfield Academy Q2 payment',
  reference: 'UTR-GSL/OPS/26-27/0002-XYZ',
})
const PL_002 = paymentLog({
  id: 'PL-002', amount: 750000,
  narration: 'Oakwood Tink kit payment',
  reference: 'UTR-GSL/OPS/26-27/0010',
})
const PL_003 = paymentLog({
  id: 'PL-003', amount: 1500000,
  narration: 'Narayana ASN Q2',
})
const PL_004 = paymentLog({
  id: 'PL-004', amount: 262500, // 5% over Greenfield's 250000
  narration: 'Greenfield Academy',
})
const PL_006 = paymentLog({
  id: 'PL-006', amount: 250000, // ambiguous: matches both Greenfield i2 + i3
  narration: '',
  reference: '',
})
const PL_007 = paymentLog({
  id: 'PL-007', amount: 99999, // no match anywhere
  narration: 'unknown random transaction',
})
const PL_008 = paymentLog({
  id: 'PL-008', amount: 262500, // 5% over Greenfield's 250000 (within-5% tier)
  narration: 'Greenfield',
})

const defaultDeps: ReconcileDeps = { payments: allPayments }

const allPaymentLogs: PaymentLog[] = [PL_001, PL_002, PL_003, PL_004, PL_006, PL_007, PL_008]

function ids(candidates: Candidate[]): string[] {
  return candidates.map((c) => c.paymentId)
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('Q-G Test 3: shortlistCandidates', () => {
  describe('determinism', () => {
    it('returns identical ranked output across repeated calls (same input)', () => {
      const a = shortlistCandidates(PL_006, {}, defaultDeps)
      const b = shortlistCandidates(PL_006, {}, defaultDeps)
      expect(a).toEqual(b)
    })

    it('determinism holds across all synthetic payment logs', () => {
      for (const log of allPaymentLogs) {
        const a = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
        const b = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
        expect(a).toEqual(b)
      }
    })
  })

  describe('top-3 accuracy', () => {
    it('PL-001 (Greenfield Q2 with reference) ranks Greenfield-i2 first', () => {
      const result = shortlistCandidates(PL_001, {}, defaultDeps)
      expect(ids(result)).toContain('TEST-GREEN-i2')
      const winner = result[0]
      expect(winner?.paymentId).toBe('TEST-GREEN-i2')
      expect(winner?.reasons).toEqual(
        expect.arrayContaining([
          'amount: exact match',
          'school: narration matches school name',
          'reference: matches PI number',
        ]),
      )
    })

    it('PL-002 (Oakwood Tink with reference) ranks Oakwood-Tink-i1 first', () => {
      const result = shortlistCandidates(PL_002, {}, defaultDeps)
      expect(result[0]?.paymentId).toBe('TEST-OAK-TINK-i1')
      expect(result[0]?.reasons).toContain('reference: matches PI number')
    })

    it('PL-003 (Narayana 1.5M) ranks Narayana-i2 first', () => {
      const result = shortlistCandidates(PL_003, {}, defaultDeps)
      expect(result[0]?.paymentId).toBe('TEST-NARAYANA-i2')
    })
  })

  describe('tolerance widening (strict superset)', () => {
    it('PL-004 (5% over Greenfield) returns no candidates at default 1% tolerance', () => {
      const result = shortlistCandidates(PL_004, {}, defaultDeps)
      expect(result).toEqual([])
    })

    it('PL-004 returns Greenfield candidates at widened 10% tolerance', () => {
      const result = shortlistCandidates(PL_004, { tolerance: 0.10 }, defaultDeps)
      expect(ids(result)).toEqual(
        expect.arrayContaining(['TEST-GREEN-i2', 'TEST-GREEN-i3']),
      )
      expect(result[0]?.reasons).toContain('amount: within 5%')
    })

    it('widened call is a strict superset of default call (same fixture)', () => {
      const defaultResult = shortlistCandidates(PL_008, {}, defaultDeps)
      const widenedResult = shortlistCandidates(PL_008, { tolerance: 0.10 }, defaultDeps)
      const widenedIds = ids(widenedResult)
      for (const id of ids(defaultResult)) expect(widenedIds).toContain(id)
    })
  })

  describe('eligibility', () => {
    it('excludes Pending payments (no PI generated yet)', () => {
      const log = paymentLog({
        id: 'PL-PENDING', amount: 125000,
        narration: 'Maple Leaf Public School',
      })
      const result = shortlistCandidates(log, {}, defaultDeps)
      // Maple Leaf instalments are all Pending; even an exact-amount + school
      // match should yield no candidates.
      expect(ids(result)).not.toContain('TEST-MAPLE-i1')
      expect(ids(result)).not.toContain('TEST-MAPLE-i2')
    })

    it('excludes Received payments (already reconciled)', () => {
      const log = paymentLog({
        id: 'PL-RECV', amount: 1350000,
        narration: 'Springwood',
      })
      const result = shortlistCandidates(log, {}, defaultDeps)
      expect(ids(result)).not.toContain('TEST-SPRING-i1')
    })

    it('PL-007 (no clear match, 99999) returns empty result', () => {
      const result = shortlistCandidates(PL_007, {}, defaultDeps)
      expect(result).toEqual([])
    })
  })

  describe('tie-break ordering', () => {
    it('PL-006 (250000 ambiguous, no narration, no reference) prefers more recent PI', () => {
      const result = shortlistCandidates(PL_006, {}, defaultDeps)
      // Both i2 (PI sent 2026-04-15) and i3 (PI sent 2026-04-22) qualify.
      // PaymentLog.date = 2026-04-25.
      // i3 is 3 days from log; i2 is 10 days. i3 wins tie-break.
      expect(result[0]?.paymentId).toBe('TEST-GREEN-i3')
      expect(result[1]?.paymentId).toBe('TEST-GREEN-i2')
      expect(result[0]?.score).toBe(100)
      expect(result[1]?.score).toBe(100)
    })

    it('alphabetical paymentId tiebreaks when score AND recency tie', () => {
      const synthetic: Payment[] = [
        { ...greenfieldI2, id: 'PMT-Z', piSentDate: '2026-04-15', expectedAmount: 1500000 },
        { ...greenfieldI2, id: 'PMT-A', piSentDate: '2026-04-15', expectedAmount: 1500000 },
      ]
      const log = paymentLog({ id: 'PL-TIE', amount: 1500000 })
      const result = shortlistCandidates(log, {}, { payments: synthetic })
      expect(result[0]?.paymentId).toBe('PMT-A')
      expect(result[1]?.paymentId).toBe('PMT-Z')
    })
  })

  describe('options', () => {
    it('limit option caps candidate count', () => {
      const result = shortlistCandidates(PL_006, { limit: 1 }, defaultDeps)
      expect(result.length).toBeLessThanOrEqual(1)
    })

    it('limit=10 returns all qualifying candidates', () => {
      const result = shortlistCandidates(PL_006, { limit: 10 }, defaultDeps)
      // Only Greenfield i2 + i3 are 250k PI-issued; i1 is Received and i4 is Pending.
      expect(result).toHaveLength(2)
    })

    it('tolerance=0 still matches truly identical amounts (delta=0)', () => {
      const result = shortlistCandidates(PL_001, { tolerance: 0 }, defaultDeps)
      expect(result.length).toBeGreaterThan(0)
      expect(ids(result)).toContain('TEST-GREEN-i2')
    })

    it('tolerance=0 excludes near-but-not-identical amounts', () => {
      const log = paymentLog({ ...PL_001, amount: 250001 })
      const result = shortlistCandidates(log, { tolerance: 0 }, defaultDeps)
      expect(result).toEqual([])
    })
  })

  describe('reasons surfaced for traceability', () => {
    it('exact match + reference + school all surface in reasons', () => {
      const result = shortlistCandidates(PL_001, {}, defaultDeps)
      const winner = result[0]
      expect(winner?.reasons.length).toBeGreaterThanOrEqual(3)
      expect(winner?.reasons).toContain('amount: exact match')
      expect(winner?.reasons).toContain('school: narration matches school name')
      expect(winner?.reasons).toContain('reference: matches PI number')
    })

    it('within-5% tier surfaces "amount: within 5%" reason', () => {
      const result = shortlistCandidates(PL_008, { tolerance: 0.10 }, defaultDeps)
      const winner = result[0]
      expect(winner?.reasons).toContain('amount: within 5%')
    })

    it('within-10% tier surfaces "amount: within 10%" reason', () => {
      const log = paymentLog({
        id: 'PL-NEAR-10', amount: 270000, // 8% over 250000
        narration: 'Greenfield Academy',
      })
      const result = shortlistCandidates(log, { tolerance: 0.10 }, defaultDeps)
      const winner = result[0]
      expect(winner?.reasons).toContain('amount: within 10%')
    })
  })

  describe('input validation', () => {
    it('throws ReconcileError on zero amount', () => {
      const log = paymentLog({ id: 'PL-ZERO', amount: 0 })
      expect(() => shortlistCandidates(log, {}, defaultDeps)).toThrow(ReconcileError)
    })

    it('throws ReconcileError on negative amount', () => {
      const log = paymentLog({ id: 'PL-NEG', amount: -100 })
      expect(() => shortlistCandidates(log, {}, defaultDeps)).toThrow(/positive/)
    })
  })
})
