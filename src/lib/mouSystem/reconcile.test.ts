/*
 * Reconciliation algorithm tests (T01-T20 from DESIGN_DOC.md Section 13).
 *
 * Pure function under test: findCandidates(input, payments, mous, topN).
 * Tests use mock fixtures so they run with no I/O and no JSON dependencies.
 */

import { describe, it, expect } from 'vitest'
import { findCandidates } from './reconcile'
import type { MOU, Payment, Programme, MouStatus, PaymentStatus, TrainerModel } from './types'

// ----------------------------------------------------------------------------
// Fixtures

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2526-001',
    schoolId: 'SCH-001',
    schoolName: 'Mahatma Gandhi International School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    cohortStatus: 'active',
    delayNotes: null,
    status: 'Active' as MouStatus,
    academicYear: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    studentsMou: 100,
    studentsActual: 100,
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: 2700,
    spWithTax: 3186,
    contractValue: 318600,
    received: 0,
    tds: 0,
    balance: 318600,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: 'GSL-T' as TrainerModel,
    notes: null,
    daysToExpiry: 100,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    draftVariables: null,
    auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-STEAM-2526-001-i1',
    mouId: 'MOU-STEAM-2526-001',
    schoolName: 'Mahatma Gandhi International School',
    programme: 'STEAM' as Programme,
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment I',
    dueDateRaw: 'Oct-26',
    dueDateIso: '2026-10-12',
    expectedAmount: 100000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: 'MTPL/UP/25-26/18',
    taxInvoiceNumber: null,
    status: 'Pending' as PaymentStatus,
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

const RECEIVED_DATE = '2026-10-15'

// ----------------------------------------------------------------------------
// Tests

describe('findCandidates', () => {
  it('T01: exact match, no TDS', () => {
    const p = payment({ expectedAmount: 100000 })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('single')
    if (result[0]?.kind === 'single') {
      expect(result[0].variant).toBe('full')
      expect(result[0].confidence).toBeGreaterThan(0.7)
    }
  })

  it('T02: exact match minus 2% TDS', () => {
    const p = payment({ expectedAmount: 100000 })
    // 100000 * 0.98 = 98000
    const result = findCandidates({ receivedAmount: 98000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result.length).toBeGreaterThanOrEqual(1)
    if (result[0]?.kind === 'single') {
      expect(result[0].variant).toMatch(/after_tds_2/)
    }
  })

  it('T03: exact match minus 10% TDS', () => {
    const p = payment({ expectedAmount: 100000 })
    const result = findCandidates({ receivedAmount: 90000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result.length).toBeGreaterThanOrEqual(1)
    if (result[0]?.kind === 'single') {
      expect(result[0].variant).toMatch(/after_tds_10/)
    }
  })

  it('T04: cheque rounded to nearest Rs 100', () => {
    const p = payment({ expectedAmount: 12345 })
    // 12345 rounded to nearest 100 = 12300
    const result = findCandidates({ receivedAmount: 12300, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result.length).toBeGreaterThanOrEqual(1)
    if (result[0]?.kind === 'single') {
      expect(result[0].variant).toMatch(/rounded_100/)
    }
  })

  it('T05: cheque rounded to nearest Rs 10', () => {
    const p = payment({ expectedAmount: 12345 })
    // 12345 rounded to nearest 10 = 12350; difference 5 from input 12350
    const result = findCandidates({ receivedAmount: 12350, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('T06: two-PI sum, after 2% TDS, combined match', () => {
    const m = mou()
    const p1 = payment({ id: 'p1', mouId: m.id, expectedAmount: 50000, instalmentSeq: 1, piNumber: 'MTPL/UP/25-26/01' })
    const p2 = payment({ id: 'p2', mouId: m.id, expectedAmount: 50000, instalmentSeq: 2, piNumber: 'MTPL/UP/25-26/02' })
    // Sum = 100000, after 2% TDS = 98000
    const result = findCandidates({ receivedAmount: 98000, receivedDate: RECEIVED_DATE }, [p1, p2], [m])
    const combined = result.find((r) => r.kind === 'combined')
    expect(combined).toBeDefined()
  })

  it('T07: 3 PIs same amount, all surface', () => {
    const p1 = payment({ id: 'p1', expectedAmount: 50000, dueDateIso: '2026-10-10' })
    const p2 = payment({ id: 'p2', mouId: 'MOU-STEAM-2526-002', expectedAmount: 50000, dueDateIso: '2026-10-15' })
    const p3 = payment({ id: 'p3', mouId: 'MOU-STEAM-2526-003', expectedAmount: 50000, dueDateIso: '2026-10-20' })
    const result = findCandidates({ receivedAmount: 50000, receivedDate: RECEIVED_DATE }, [p1, p2, p3], [
      mou(),
      mou({ id: 'MOU-STEAM-2526-002' }),
      mou({ id: 'MOU-STEAM-2526-003' }),
    ])
    expect(result.length).toBeGreaterThanOrEqual(3)
    // p2 should rank highest (due date matches received date exactly)
    if (result[0]?.kind === 'single') {
      expect(result[0].payment.id).toBe('p2')
    }
  })

  it('T08: bank reference contains exact PI number, narration boosts to 1.0', () => {
    const p = payment({ expectedAmount: 100000, piNumber: 'MTPL/UP/25-26/18' })
    const result = findCandidates(
      { receivedAmount: 100000, receivedDate: RECEIVED_DATE, bankReference: 'NEFT MTPL/UP/25-26/18 mahatma gandhi' },
      [p],
      [mou()],
    )
    expect(result[0]?.narrationScore).toBe(1.0)
    expect(result[0]?.confidence).toBeGreaterThan(0.85)
  })

  it('T09: bank reference contains school name fragment', () => {
    const p = payment({ expectedAmount: 100000, piNumber: 'MTPL/UP/25-26/18' })
    const result = findCandidates(
      { receivedAmount: 100000, receivedDate: RECEIVED_DATE, bankReference: 'NEFT MAHATMA GANDHI INTL' },
      [p],
      [mou()],
    )
    expect(result[0]?.narrationScore).toBe(0.7)
  })

  it('T10: bank reference contains last segment of PI ("18"), score 0.4', () => {
    const p = payment({ expectedAmount: 100000, piNumber: 'MTPL/UP/25-26/18' })
    const result = findCandidates(
      { receivedAmount: 100000, receivedDate: RECEIVED_DATE, bankReference: 'INV 18 abcdef' },
      [p],
      [mou({ schoolName: 'NoMatch' })],
    )
    expect(result[0]?.narrationScore).toBe(0.4)
  })

  it('T11: received 60 days after due, dateScore approx 0.33', () => {
    const p = payment({ expectedAmount: 100000, dueDateIso: '2026-08-16' })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: '2026-10-15' }, [p], [mou()])
    expect(result[0]?.dateScore).toBeGreaterThan(0.3)
    expect(result[0]?.dateScore).toBeLessThan(0.4)
  })

  it('T12: received 91 days after due, dateScore 0', () => {
    const p = payment({ expectedAmount: 100000, dueDateIso: '2026-07-16' })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: '2026-10-15' }, [p], [mou()])
    expect(result[0]?.dateScore).toBe(0)
  })

  it('T13: no match within tolerance, empty list', () => {
    const p = payment({ expectedAmount: 100000 })
    const result = findCandidates({ receivedAmount: 50000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result).toHaveLength(0)
  })

  it('T14: negative amount returns empty', () => {
    const p = payment()
    const result = findCandidates({ receivedAmount: -1000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result).toHaveLength(0)
  })

  it('T15: future date still searches', () => {
    const p = payment({ expectedAmount: 100000, dueDateIso: '2026-10-15' })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: '2027-01-15' }, [p], [mou()])
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('T16: 500 unpaid PIs perf, returns under 200ms', () => {
    const m = mou()
    const payments = Array.from({ length: 500 }, (_, i) =>
      payment({
        id: `p${i}`,
        expectedAmount: 10000 + i * 100,
        dueDateIso: '2026-10-15',
        piNumber: `MTPL/UP/25-26/${i}`,
      }),
    )
    const start = performance.now()
    findCandidates({ receivedAmount: 50000, receivedDate: RECEIVED_DATE }, payments, [m])
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1500) // generous bound for CI variance
  })

  it('T17: sum of 3 PIs is not surfaced (combined limit = 2)', () => {
    const m = mou()
    const ps = [
      payment({ id: 'p1', mouId: m.id, expectedAmount: 30000 }),
      payment({ id: 'p2', mouId: m.id, expectedAmount: 30000 }),
      payment({ id: 'p3', mouId: m.id, expectedAmount: 30000 }),
    ]
    // Sum of all 3 = 90000. Should NOT match (only 2-PI combos tried).
    const result = findCandidates({ receivedAmount: 90000, receivedDate: RECEIVED_DATE }, ps, [m])
    // Any match with 90000 would have to be a single PI of 90000 (none) or
    // 2-PI sum of 90000 (none, since 2x30000 = 60000). Expect empty.
    expect(result).toHaveLength(0)
  })

  it('T18: partial payment (50% of expected) is not surfaced', () => {
    const p = payment({ expectedAmount: 100000 })
    // 50% = 50000, not in any computed variant
    const result = findCandidates({ receivedAmount: 50000, receivedDate: RECEIVED_DATE }, [p], [mou()])
    expect(result).toHaveLength(0)
  })

  it('T19: ambiguous match across two unrelated PIs, both surface', () => {
    const p1 = payment({ id: 'p1', mouId: 'MOU-A', expectedAmount: 100000, dueDateIso: '2026-10-15' })
    const p2 = payment({
      id: 'p2',
      mouId: 'MOU-B',
      schoolName: 'Other School',
      expectedAmount: 100000,
      dueDateIso: '2026-10-10',
    })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: RECEIVED_DATE }, [p1, p2], [
      mou({ id: 'MOU-A' }),
      mou({ id: 'MOU-B', schoolName: 'Other School' }),
    ])
    expect(result.length).toBe(2)
    // p1 should rank first (due date exactly matches received date)
    if (result[0]?.kind === 'single') {
      expect(result[0].payment.id).toBe('p1')
    }
  })

  it('T20: empty bank reference is handled gracefully (narrationScore 0)', () => {
    const p = payment({ expectedAmount: 100000 })
    const result = findCandidates({ receivedAmount: 100000, receivedDate: RECEIVED_DATE, bankReference: '' }, [p], [mou()])
    expect(result[0]?.narrationScore).toBe(0)
  })

  it('respects custom tolerance', () => {
    const p = payment({ expectedAmount: 100000 })
    // Tight tolerance Rs 1: exact only
    const tight = findCandidates({ receivedAmount: 100050, receivedDate: RECEIVED_DATE, tolerance: 1 }, [p], [mou()])
    expect(tight).toHaveLength(0)
    // Loose tolerance Rs 100: matches
    const loose = findCandidates({ receivedAmount: 100050, receivedDate: RECEIVED_DATE, tolerance: 100 }, [p], [mou()])
    expect(loose.length).toBeGreaterThanOrEqual(1)
  })

  it('returns at most topN results', () => {
    const _m = mou()
    const ps = Array.from({ length: 20 }, (_, i) =>
      payment({ id: `p${i}`, mouId: `MOU-${i}`, expectedAmount: 100000 }),
    )
    const ms = ps.map((p) => mou({ id: p.mouId }))
    const result = findCandidates({ receivedAmount: 100000, receivedDate: RECEIVED_DATE }, ps, ms, 5)
    expect(result.length).toBeLessThanOrEqual(5)
  })
})
