/*
 * Unit tests for schoolsReceiptsData lib (Gate 4.95 Session 4).
 */

import { describe, it, expect } from 'vitest'
import type { MOU, Payment, School } from '@/lib/types'
import { EMPTY_FILTERS } from '@/lib/dashboard/financeDashboardData'
import {
  computeSchoolReceipts,
  isSchoolReceiptSortKey,
} from './schoolsReceiptsData'

function mou(over: Partial<MOU> & Pick<MOU, 'id' | 'schoolId'>): MOU {
  return {
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

function school(
  over: Partial<School> & Pick<School, 'id' | 'name'>,
): School {
  return {
    legalEntity: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    region: 'West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '',
    auditLog: [],
    ...over,
  } as School
}

const NOW = new Date('2026-05-12T00:00:00.000Z')

describe('computeSchoolReceipts - basic row composition', () => {
  it('returns empty array when no MOUs match filter', () => {
    const rows = computeSchoolReceipts({
      mous: [],
      payments: [],
      schools: [],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('builds one row per school with contract + received + outstanding sums', () => {
    const m1 = mou({
      id: 'M1',
      schoolId: 'SCH-A',
      contractValue: 100000,
    })
    const m2 = mou({
      id: 'M2',
      schoolId: 'SCH-A',
      contractValue: 50000,
      programme: 'Robotics',
    })
    const p1 = payment({
      id: 'M1-i1',
      mouId: 'M1',
      receivedAmount: 25000,
      receivedDate: '2026-04-10',
      status: 'Paid',
    })
    const p2 = payment({
      id: 'M2-i1',
      mouId: 'M2',
      receivedAmount: 10000,
      receivedDate: '2026-04-20',
      status: 'Partial',
      expectedAmount: 25000,
    })
    const s = school({ id: 'SCH-A', name: 'Alpha School' })

    const rows = computeSchoolReceipts({
      mous: [m1, m2],
      payments: [p1, p2],
      schools: [s],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.totalContractValue).toBe(150000)
    expect(rows[0]?.receivedAmount).toBe(35000)
    expect(rows[0]?.outstanding).toBe(115000)
    expect(rows[0]?.receivedPct).toBeCloseTo((35000 / 150000) * 100)
    expect(rows[0]?.programmes.sort()).toEqual(['Robotics', 'STEAM'])
  })

  it('outstanding floors at zero when received exceeds contract', () => {
    const m = mou({ id: 'M', schoolId: 'SCH', contractValue: 50000 })
    const p = payment({
      id: 'P',
      mouId: 'M',
      receivedAmount: 60000,
      status: 'Paid',
    })
    const rows = computeSchoolReceipts({
      mous: [m],
      payments: [p],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.outstanding).toBe(0)
  })

  it('uses school.name when present, else MOU.schoolName fallback', () => {
    const m = mou({ id: 'M', schoolId: 'SCH-MISSING', schoolName: 'Fallback' })
    const rows = computeSchoolReceipts({
      mous: [m],
      payments: [],
      schools: [],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.schoolName).toBe('Fallback')
  })

  it('picks most-recent receivedDate for lastPaymentDate', () => {
    const m = mou({ id: 'M', schoolId: 'SCH' })
    const rows = computeSchoolReceipts({
      mous: [m],
      payments: [
        payment({
          id: 'P1',
          mouId: 'M',
          receivedDate: '2026-04-01',
          status: 'Paid',
        }),
        payment({
          id: 'P2',
          mouId: 'M',
          receivedDate: '2026-04-15',
          status: 'Paid',
        }),
      ],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.lastPaymentDate).toBe('2026-04-15')
  })

  it('picks earliest future-due unpaid for nextInstalmentDue', () => {
    const m = mou({ id: 'M', schoolId: 'SCH' })
    const rows = computeSchoolReceipts({
      mous: [m],
      payments: [
        payment({
          id: 'P1',
          mouId: 'M',
          dueDateIso: '2026-06-01',
          expectedAmount: 5000,
          status: 'Pending',
        }),
        payment({
          id: 'P2',
          mouId: 'M',
          dueDateIso: '2026-07-01',
          expectedAmount: 6000,
          status: 'Pending',
        }),
      ],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.nextInstalmentDue).toEqual({
      dueDateIso: '2026-06-01',
      amount: 5000,
    })
  })
})

describe('computeSchoolReceipts - status pill thresholds', () => {
  it('Closed: every MOU Completed or Expired', () => {
    const rows = computeSchoolReceipts({
      mous: [
        mou({ id: 'M1', schoolId: 'SCH', status: 'Completed' }),
        mou({ id: 'M2', schoolId: 'SCH', status: 'Expired' }),
      ],
      payments: [],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.status).toBe('Closed')
  })

  it('Overdue: at least one payment past due unpaid', () => {
    const rows = computeSchoolReceipts({
      mous: [mou({ id: 'M', schoolId: 'SCH' })],
      payments: [
        payment({
          id: 'P',
          mouId: 'M',
          dueDateIso: '2026-04-01',
          status: 'Pending',
        }),
      ],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.status).toBe('Overdue')
  })

  it('At Risk: receivedPct < 50, nothing overdue, at least one active', () => {
    const rows = computeSchoolReceipts({
      mous: [
        mou({ id: 'M', schoolId: 'SCH', contractValue: 100000 }),
      ],
      payments: [
        payment({
          id: 'P',
          mouId: 'M',
          receivedAmount: 25000,
          status: 'Paid',
          dueDateIso: '2026-04-01',
        }),
      ],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.status).toBe('At Risk')
  })

  it('Healthy: receivedPct >= 50, nothing overdue', () => {
    const rows = computeSchoolReceipts({
      mous: [
        mou({ id: 'M', schoolId: 'SCH', contractValue: 100000 }),
      ],
      payments: [
        payment({
          id: 'P',
          mouId: 'M',
          receivedAmount: 75000,
          status: 'Paid',
          dueDateIso: '2026-04-01',
        }),
      ],
      schools: [school({ id: 'SCH', name: 'S' })],
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows[0]?.status).toBe('Healthy')
  })
})

describe('computeSchoolReceipts - sort', () => {
  function fixtureRows() {
    return [
      mou({ id: 'M-A', schoolId: 'SCH-A', contractValue: 200000 }),
      mou({ id: 'M-B', schoolId: 'SCH-B', contractValue: 50000 }),
      mou({ id: 'M-C', schoolId: 'SCH-C', contractValue: 100000 }),
    ]
  }
  const schoolFixtures = [
    school({ id: 'SCH-A', name: 'Alpha' }),
    school({ id: 'SCH-B', name: 'Bravo' }),
    school({ id: 'SCH-C', name: 'Charlie' }),
  ]

  it('contract-desc sorts largest contract first', () => {
    const rows = computeSchoolReceipts({
      mous: fixtureRows(),
      payments: [],
      schools: schoolFixtures,
      filters: EMPTY_FILTERS,
      now: NOW,
      sortBy: 'contract-desc',
    })
    expect(rows.map((r) => r.schoolId)).toEqual(['SCH-A', 'SCH-C', 'SCH-B'])
  })

  it('name-asc is default and sorts alphabetically', () => {
    const rows = computeSchoolReceipts({
      mous: fixtureRows(),
      payments: [],
      schools: schoolFixtures,
      filters: EMPTY_FILTERS,
      now: NOW,
    })
    expect(rows.map((r) => r.schoolName)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('outstanding-desc sorts largest outstanding first', () => {
    const rows = computeSchoolReceipts({
      mous: fixtureRows(),
      payments: [
        payment({
          id: 'P',
          mouId: 'M-A',
          receivedAmount: 180000,
          status: 'Paid',
        }),
      ],
      schools: schoolFixtures,
      filters: EMPTY_FILTERS,
      now: NOW,
      sortBy: 'outstanding-desc',
    })
    // SCH-B (50k), SCH-C (100k), SCH-A (20k after the 180k payment).
    expect(rows.map((r) => r.schoolId)).toEqual(['SCH-C', 'SCH-B', 'SCH-A'])
  })
})

describe('computeSchoolReceipts - filter intersection', () => {
  it('drops schools whose MOUs are filtered out', () => {
    const m1 = mou({ id: 'M1', schoolId: 'SCH-A', programme: 'STEAM' })
    const m2 = mou({ id: 'M2', schoolId: 'SCH-B', programme: 'Robotics' })
    const rows = computeSchoolReceipts({
      mous: [m1, m2],
      payments: [],
      schools: [
        school({ id: 'SCH-A', name: 'Alpha' }),
        school({ id: 'SCH-B', name: 'Bravo' }),
      ],
      filters: { ...EMPTY_FILTERS, programmes: ['STEAM'] },
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.schoolId).toBe('SCH-A')
  })
})

describe('isSchoolReceiptSortKey', () => {
  it('accepts valid keys', () => {
    expect(isSchoolReceiptSortKey('contract-desc')).toBe(true)
    expect(isSchoolReceiptSortKey('name-asc')).toBe(true)
    expect(isSchoolReceiptSortKey('received-asc')).toBe(true)
  })
  it('rejects unknown strings + null + undefined', () => {
    expect(isSchoolReceiptSortKey('bogus')).toBe(false)
    expect(isSchoolReceiptSortKey(null)).toBe(false)
    expect(isSchoolReceiptSortKey(undefined)).toBe(false)
  })
})
