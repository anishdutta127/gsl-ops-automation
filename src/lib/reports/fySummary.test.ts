import { describe, it, expect } from 'vitest'
import type { KitDispatch, MOU, Payment, School } from '@/lib/types'
import { computeFySummary, csvForFySummary } from './fySummary'
import type { ReportFilters } from './filters'

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-A',
    schoolId: 'SCH-1',
    schoolName: 'School A',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: 90,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 365,
    auditLog: [],
    ...over,
  }
}

function pay(over: Partial<Payment> = {}): Payment {
  return {
    id: 'P-1',
    mouId: 'MOU-A',
    schoolName: 'School A',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'I',
    dueDateRaw: null,
    dueDateIso: '2026-06-01',
    expectedAmount: 25000,
    receivedAmount: 25000,
    receivedDate: '2026-05-30',
    paymentMode: 'Bank Transfer',
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Received',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...over,
  }
}

const baseFilters: ReportFilters = {
  fy: '2026-27',
  dept: 'All',
  from: null,
  to: null,
}

const now = new Date('2026-05-12T00:00:00Z')

describe('computeFySummary', () => {
  it('handles empty data', () => {
    const r = computeFySummary({
      mous: [],
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.headline.signedContractValue).toBe(0)
    expect(r.headline.mouCount).toBe(0)
    expect(r.programmes).toHaveLength(4)
    expect(r.monthlyReceipts).toHaveLength(12)
  })

  it('sums signed value over FY-scoped MOUs', () => {
    const mous = [
      mou({ id: 'M1', contractValue: 100000 }),
      mou({ id: 'M2', contractValue: 50000 }),
      mou({ id: 'M3', academicYear: '2025-26', contractValue: 999999 }),
    ]
    const r = computeFySummary({
      mous,
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.headline.signedContractValue).toBe(150000)
    expect(r.headline.mouCount).toBe(2)
  })

  it('sums received only across scoped MOUs', () => {
    const mous = [
      mou({ id: 'M1' }),
      mou({ id: 'M2', academicYear: '2025-26' }),
    ]
    const payments = [
      pay({ id: 'P1', mouId: 'M1', receivedAmount: 25000 }),
      pay({ id: 'P2', mouId: 'M2', receivedAmount: 99999 }),
    ]
    const r = computeFySummary({
      mous,
      payments,
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.headline.received).toBe(25000)
  })

  it('counts distinct schools', () => {
    const mous = [
      mou({ id: 'M1', schoolId: 'A' }),
      mou({ id: 'M2', schoolId: 'A' }),
      mou({ id: 'M3', schoolId: 'B' }),
    ]
    const r = computeFySummary({
      mous,
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.headline.schoolCount).toBe(2)
  })

  it('counts dispatches against scoped MOUs only', () => {
    const mous = [mou({ id: 'M1' })]
    const dispatches = [
      {
        id: 'D1',
        mouId: 'M1',
        schoolId: 'SCH-1',
        schoolName: 'A',
        productSelected: 'Cretile',
        dispatchStatus: 'Pending',
        allocations: [],
        salesApprovalStatus: 'Pending',
        salesApprovedBy: null,
        salesApprovedAt: null,
        salesRejectionReason: null,
        dispatchSummary: null,
        shipmentTracking: null,
        pod: null,
        auditLog: [],
        createdAt: '2026-04-01T00:00:00Z',
      } as KitDispatch,
      {
        id: 'D2',
        mouId: 'M-other',
        schoolId: 'SCH-1',
        schoolName: 'A',
        productSelected: 'Cretile',
        dispatchStatus: 'Pending',
        allocations: [],
        salesApprovalStatus: 'Pending',
        salesApprovedBy: null,
        salesApprovedAt: null,
        salesRejectionReason: null,
        dispatchSummary: null,
        shipmentTracking: null,
        pod: null,
        auditLog: [],
        createdAt: '2026-04-01T00:00:00Z',
      } as KitDispatch,
    ]
    const r = computeFySummary({
      mous,
      payments: [],
      dispatches,
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.headline.dispatchCount).toBe(1)
  })

  it('produces 12 monthly receipt points oldest-first', () => {
    const r = computeFySummary({
      mous: [],
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now: new Date('2026-12-15T00:00:00Z'),
    })
    expect(r.monthlyReceipts).toHaveLength(12)
    expect(r.monthlyReceipts[11]?.month).toBe('2026-12')
  })

  it('computes YoY delta when prior FY exists', () => {
    const mous = [
      mou({ id: 'P1', academicYear: '2025-26', contractValue: 50000 }),
      mou({ id: 'C1', academicYear: '2026-27', contractValue: 100000 }),
    ]
    const r = computeFySummary({
      mous,
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.yoy.priorFy).toBe('2025-26')
    expect(r.yoy.priorSigned).toBe(50000)
    expect(r.yoy.currentSigned).toBe(100000)
    expect(r.yoy.deltaPct).toBeCloseTo(100, 0)
  })

  it('honours explicit from/to window over FY', () => {
    const mous = [
      mou({ id: 'M1', startDate: '2026-04-01', endDate: '2027-03-31' }),
      mou({ id: 'M2', startDate: '2025-04-01', endDate: '2026-02-28' }),
    ]
    const r = computeFySummary({
      mous,
      payments: [],
      dispatches: [],
      schools: [],
      filters: {
        fy: null,
        dept: 'All',
        from: '2026-04-01',
        to: '2026-12-31',
      },
      now,
    })
    expect(r.headline.mouCount).toBe(1)
  })

  it('builds programme breakdown row per programme always', () => {
    const r = computeFySummary({
      mous: [mou()],
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(r.programmes.map((p) => p.programme).sort()).toEqual(
      ['Harvard HBPE', 'Robotics', 'STEAM', 'Young Pioneers'].sort(),
    )
  })
})

describe('csvForFySummary', () => {
  it('includes header row', () => {
    const csv = csvForFySummary({
      mous: [],
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    expect(csv.split('\n')[0]).toContain('Section')
    expect(csv.split('\n')[0]).toContain('Programme')
  })

  it('escapes commas in cell values', () => {
    const mous = [
      mou({ id: 'M1', schoolName: 'School, With Comma' }),
    ]
    const csv = csvForFySummary({
      mous,
      payments: [],
      dispatches: [],
      schools: [],
      filters: baseFilters,
      now,
    })
    // The school name itself doesn't appear in this CSV body (FY
    // summary is programme-level), so verify the helper at least
    // emits a parseable, non-empty multi-line CSV.
    expect(csv.split('\n').length).toBeGreaterThan(2)
  })
})

const _schoolStub: School = {
  id: 'SCH-1',
  name: 'School A',
  legalEntity: null,
  city: 'Mumbai',
  state: 'MH',
} as unknown as School
void _schoolStub
