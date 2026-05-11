import { describe, it, expect } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import {
  computeSalesPerformance,
  csvForSalesPerformance,
} from './salesPerformance'
import type { ReportFilters } from './filters'

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'S',
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
    mouId: 'MOU-1',
    schoolName: 'S',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: '2026-06-01',
    expectedAmount: 25000,
    receivedAmount: 25000,
    receivedDate: '2026-06-20',
    paymentMode: 'Bank Transfer',
    bankReference: null,
    piNumber: 'PI-001',
    taxInvoiceNumber: null,
    status: 'Received',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: '2026-06-10T00:00:00Z',
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...over,
  }
}

const salesTeam = [
  { id: 'sp-vikram', name: 'Vikram T.', active: true },
  { id: 'sp-vish', name: 'Vishwanath G.', active: true },
]

const filters: ReportFilters = {
  fy: '2026-27',
  dept: 'All',
  from: null,
  to: null,
}

const now = new Date('2026-05-12T00:00:00Z')

describe('computeSalesPerformance', () => {
  it('handles empty data', () => {
    const r = computeSalesPerformance({
      mous: [],
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.rows).toEqual([])
    expect(r.top5).toEqual([])
    expect(r.bottom5).toEqual([])
  })

  it('aggregates MOUs per rep', () => {
    const mous = [
      mou({ id: 'M1', salesPersonId: 'sp-vikram', contractValue: 100000 }),
      mou({ id: 'M2', salesPersonId: 'sp-vikram', contractValue: 50000 }),
      mou({ id: 'M3', salesPersonId: 'sp-vish', contractValue: 25000 }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]?.repId).toBe('sp-vikram')
    expect(r.rows[0]?.mouCount).toBe(2)
    expect(r.rows[0]?.totalContractValue).toBe(150000)
    expect(r.rows[0]?.averageMouSize).toBe(75000)
  })

  it('returns null payment lag when no payments received', () => {
    const mous = [mou()]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.rows[0]?.averagePaymentLagDays).toBeNull()
  })

  it('computes average payment lag in days', () => {
    const mous = [mou()]
    const payments = [
      pay({
        id: 'P1',
        piGeneratedAt: '2026-06-10T00:00:00Z',
        receivedDate: '2026-06-20',
      }),
      pay({
        id: 'P2',
        piGeneratedAt: '2026-07-01T00:00:00Z',
        receivedDate: '2026-07-21',
      }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments,
      salesTeam,
      filters,
      now,
    })
    // Lags: 10 days + 20 days -> avg 15
    expect(r.rows[0]?.averagePaymentLagDays).toBeCloseTo(15, 0)
  })

  it('top5 ranks by total contract value desc', () => {
    const mous = [
      mou({ id: 'M1', salesPersonId: 'sp-vikram', contractValue: 100000 }),
      mou({ id: 'M2', salesPersonId: 'sp-vish', contractValue: 200000 }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.top5[0]?.repId).toBe('sp-vish')
  })

  it('bottom5 excludes reps with 0 MOUs', () => {
    const mous = [
      mou({ id: 'M1', salesPersonId: 'sp-vikram', contractValue: 100000 }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.bottom5.every((rr) => rr.mouCount > 0)).toBe(true)
  })

  it('labels unassigned reps explicitly', () => {
    const mous = [mou({ salesPersonId: null })]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.rows[0]?.repName).toBe('Unassigned')
  })

  it('scopes MOUs by FY academicYear', () => {
    const mous = [
      mou({ id: 'M1', academicYear: '2026-27' }),
      mou({ id: 'M2', academicYear: '2025-26' }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters,
      now,
    })
    expect(r.rows[0]?.mouCount).toBe(1)
  })

  it('scopes MOUs by explicit window', () => {
    const mous = [
      mou({ id: 'M1', startDate: '2026-04-01', endDate: '2026-08-31' }),
      mou({ id: 'M2', startDate: '2024-01-01', endDate: '2024-12-31' }),
    ]
    const r = computeSalesPerformance({
      mous,
      payments: [],
      salesTeam,
      filters: {
        fy: null,
        dept: 'All',
        from: '2026-04-01',
        to: '2026-12-31',
      },
      now,
    })
    expect(r.rows[0]?.mouCount).toBe(1)
  })
})

describe('csvForSalesPerformance', () => {
  it('emits header row with the canonical columns', () => {
    const csv = csvForSalesPerformance({
      mous: [],
      payments: [],
      salesTeam,
      filters,
      now,
    })
    const header = csv.split('\n')[0]
    expect(header).toContain('Rep ID')
    expect(header).toContain('Rep name')
    expect(header).toContain('Total contract value')
  })

  it('escapes commas + quotes in rep names', () => {
    const team = [{ id: 'sp-x', name: 'O, "the great"' }]
    const mous = [
      mou({ id: 'M1', salesPersonId: 'sp-x', contractValue: 1 }),
    ]
    const csv = csvForSalesPerformance({
      mous,
      payments: [],
      salesTeam: team,
      filters,
      now,
    })
    expect(csv).toContain('"O, ""the great"""')
  })

  it('escapes newlines in cell values', () => {
    const team = [{ id: 'sp-x', name: 'Line1\nLine2' }]
    const mous = [mou({ salesPersonId: 'sp-x' })]
    const csv = csvForSalesPerformance({
      mous,
      payments: [],
      salesTeam: team,
      filters,
      now,
    })
    expect(csv).toContain('"Line1\nLine2"')
  })
})
