/*
 * Unit tests for receiptsData lib (Gate 4.95 Session 4).
 */

import { describe, it, expect } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import { EMPTY_FILTERS } from '@/lib/dashboard/financeDashboardData'
import {
  agingBucketFor,
  computeReceipts,
  deriveReceiptStatus,
  isReceiptSortKey,
} from './receiptsData'

function payment(
  over: Partial<Payment> & Pick<Payment, 'id' | 'mouId'>,
): Payment {
  return {
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Q1',
    dueDateRaw: '01-Apr-2026',
    dueDateIso: '2026-04-01',
    expectedAmount: 25000,
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
    ...over,
  } as Payment
}

function mou(over: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...over,
  } as MOU
}

const NOW = new Date('2026-05-12T00:00:00.000Z')

describe('deriveReceiptStatus', () => {
  it('Paid when stored status is Paid', () => {
    const p = payment({ id: 'P', mouId: 'M', status: 'Paid' })
    expect(deriveReceiptStatus(p, NOW)).toBe('Paid')
  })

  it('Paid when receivedAmount fully covers expected', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      expectedAmount: 1000,
      receivedAmount: 1000,
      status: 'Pending',
    })
    expect(deriveReceiptStatus(p, NOW)).toBe('Paid')
  })

  it('Partial when some money received but not all', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      expectedAmount: 1000,
      receivedAmount: 500,
      status: 'Partial',
    })
    expect(deriveReceiptStatus(p, NOW)).toBe('Partial')
  })

  it('Overdue when no money received + due date past', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      receivedAmount: null,
      dueDateIso: '2026-04-01',
    })
    expect(deriveReceiptStatus(p, NOW)).toBe('Overdue')
  })

  it('Pending when no money received + due date future', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      receivedAmount: null,
      dueDateIso: '2026-08-01',
    })
    expect(deriveReceiptStatus(p, NOW)).toBe('Pending')
  })

  it('Pending when no due date set', () => {
    const p = payment({ id: 'P', mouId: 'M', dueDateIso: null })
    expect(deriveReceiptStatus(p, NOW)).toBe('Pending')
  })
})

describe('agingBucketFor', () => {
  it('null when paid', () => {
    const p = payment({ id: 'P', mouId: 'M', status: 'Paid' })
    expect(agingBucketFor(p, NOW)).toBeNull()
  })

  it('null when future-due', () => {
    const p = payment({ id: 'P', mouId: 'M', dueDateIso: '2026-06-01' })
    expect(agingBucketFor(p, NOW)).toBeNull()
  })

  it('today when due exactly today', () => {
    const p = payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-12' })
    expect(agingBucketFor(p, NOW)).toBe('today')
  })

  it('1-3 bucket for 1, 2, 3 days late', () => {
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-11' }),
        NOW,
      ),
    ).toBe('1-3')
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-09' }),
        NOW,
      ),
    ).toBe('1-3')
  })

  it('3-7 bucket for 4-7 days late', () => {
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-08' }),
        NOW,
      ),
    ).toBe('3-7')
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-05' }),
        NOW,
      ),
    ).toBe('3-7')
  })

  it('7-30 bucket for 8-30 days late', () => {
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-05-04' }),
        NOW,
      ),
    ).toBe('7-30')
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-04-12' }),
        NOW,
      ),
    ).toBe('7-30')
  })

  it('30+ bucket for 31+ days late', () => {
    expect(
      agingBucketFor(
        payment({ id: 'P', mouId: 'M', dueDateIso: '2026-04-11' }),
        NOW,
      ),
    ).toBe('30+')
  })

  it('null when no dueDateIso', () => {
    const p = payment({ id: 'P', mouId: 'M', dueDateIso: null })
    expect(agingBucketFor(p, NOW)).toBeNull()
  })
})

describe('computeReceipts', () => {
  it('returns empty rows + zero aging when no payments', () => {
    const result = computeReceipts({
      payments: [],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(result.rows).toHaveLength(0)
    expect(result.aging.total).toBe(0)
  })

  it('builds a row per payment with derived status + balance', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      expectedAmount: 1000,
      receivedAmount: 400,
      status: 'Partial',
      dueDateIso: '2026-04-01',
    })
    const { rows } = computeReceipts({
      payments: [p],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('Partial')
    expect(rows[0]?.balance).toBe(600)
  })

  it('aggregates aging buckets across multiple payments', () => {
    const a = payment({
      id: 'A',
      mouId: 'M',
      dueDateIso: '2026-05-12',
      expectedAmount: 1000,
    }) // today
    const b = payment({
      id: 'B',
      mouId: 'M',
      dueDateIso: '2026-05-11',
      expectedAmount: 2000,
    }) // 1-3
    const c = payment({
      id: 'C',
      mouId: 'M',
      dueDateIso: '2026-04-01',
      expectedAmount: 5000,
    }) // 30+
    const { aging } = computeReceipts({
      payments: [a, b, c],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(aging.total).toBe(3)
    expect(aging.byBucket.today.count).toBe(1)
    expect(aging.byBucket.today.amount).toBe(1000)
    expect(aging.byBucket['1-3'].count).toBe(1)
    expect(aging.byBucket['1-3'].amount).toBe(2000)
    expect(aging.byBucket['30+'].count).toBe(1)
    expect(aging.byBucket['30+'].amount).toBe(5000)
  })

  it('aging amount uses balance, not expected, for partial payments', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      dueDateIso: '2026-04-01',
      expectedAmount: 1000,
      receivedAmount: 250,
      status: 'Partial',
    })
    const { aging } = computeReceipts({
      payments: [p],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(aging.byBucket['30+'].amount).toBe(750)
  })

  it('due-asc sort places earliest due date first', () => {
    const { rows } = computeReceipts({
      payments: [
        payment({ id: 'B', mouId: 'M', dueDateIso: '2026-06-01' }),
        payment({ id: 'A', mouId: 'M', dueDateIso: '2026-05-01' }),
        payment({ id: 'C', mouId: 'M', dueDateIso: '2026-07-01' }),
      ],
      filters: EMPTY_FILTERS,
      now: NOW,
      sortBy: 'due-asc',
    })
    expect(rows.map((r) => r.paymentId)).toEqual(['A', 'B', 'C'])
  })

  it('balance-desc sort places largest balance first', () => {
    const { rows } = computeReceipts({
      payments: [
        payment({
          id: 'small',
          mouId: 'M',
          expectedAmount: 1000,
          receivedAmount: 0,
        }),
        payment({
          id: 'big',
          mouId: 'M',
          expectedAmount: 5000,
          receivedAmount: 0,
        }),
        payment({
          id: 'mid',
          mouId: 'M',
          expectedAmount: 3000,
          receivedAmount: 0,
        }),
      ],
      filters: EMPTY_FILTERS,
      now: NOW,
      sortBy: 'balance-desc',
    })
    expect(rows.map((r) => r.paymentId)).toEqual(['big', 'mid', 'small'])
  })

  it('school-asc sort respects school name then instalment seq', () => {
    const { rows } = computeReceipts({
      payments: [
        payment({
          id: 'P2',
          mouId: 'M',
          schoolName: 'Bravo',
          instalmentSeq: 1,
        }),
        payment({
          id: 'P1',
          mouId: 'M',
          schoolName: 'Alpha',
          instalmentSeq: 2,
        }),
        payment({
          id: 'P3',
          mouId: 'M',
          schoolName: 'Alpha',
          instalmentSeq: 1,
        }),
      ],
      filters: EMPTY_FILTERS,
      now: NOW,
      sortBy: 'school-asc',
    })
    expect(rows.map((r) => r.paymentId)).toEqual(['P3', 'P1', 'P2'])
  })

  it('applies filter through MOU intersection when MOUs are passed', () => {
    const m1 = mou({ id: 'M1', programme: 'STEAM' })
    const m2 = mou({ id: 'M2', programme: 'Robotics' })
    const p1 = payment({ id: 'P1', mouId: 'M1' })
    const p2 = payment({ id: 'P2', mouId: 'M2' })
    const { rows } = computeReceipts({
      mous: [m1, m2],
      payments: [p1, p2],
      filters: { ...EMPTY_FILTERS, programmes: ['STEAM'] },
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.paymentId).toBe('P1')
  })

  it('carries piNumber + dueDateIso + receivedDate onto every row', () => {
    const p = payment({
      id: 'P',
      mouId: 'M',
      piNumber: 'GSL/OPS/26-27/0001',
      receivedDate: '2026-04-10',
    })
    const { rows } = computeReceipts({
      payments: [p],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.piNumber).toBe('GSL/OPS/26-27/0001')
    expect(rows[0]?.receivedDate).toBe('2026-04-10')
  })
})

describe('isReceiptSortKey', () => {
  it('accepts the documented keys', () => {
    expect(isReceiptSortKey('due-asc')).toBe(true)
    expect(isReceiptSortKey('due-desc')).toBe(true)
    expect(isReceiptSortKey('balance-desc')).toBe(true)
    expect(isReceiptSortKey('school-asc')).toBe(true)
  })
  it('rejects unknown values', () => {
    expect(isReceiptSortKey('something-else')).toBe(false)
    expect(isReceiptSortKey(null)).toBe(false)
    expect(isReceiptSortKey(undefined)).toBe(false)
  })
})
