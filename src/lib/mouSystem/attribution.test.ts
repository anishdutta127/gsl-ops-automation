import { describe, it, expect } from 'vitest'
import { computeSalesPersonKpis, countUnassigned, rankLeaderboard } from './attribution'
import type { MOU, Payment, SalesPerson } from './types'

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2526-001',
    schoolId: 'SCH-001',
    schoolName: 'Acme School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    cohortStatus: 'active',
    delayNotes: null,
    status: 'Active',
    academicYear: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 2700,
    spWithTax: 3186,
    contractValue: 318600,
    received: 0,
    tds: 0,
    balance: 318600,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: null,
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
    schoolName: 'Acme School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment I',
    dueDateRaw: 'Jun-25',
    dueDateIso: '2025-06-01',
    expectedAmount: 79650,
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

function sp(id: string, overrides: Partial<SalesPerson> = {}): SalesPerson {
  return {
    id,
    name: `Person ${id}`,
    email: `${id}@getsetlearn.info`,
    phone: null,
    territories: [],
    programmes: ['STEAM'],
    active: true,
    joinedDate: '2026-04-01',
    ...overrides,
  }
}

describe('computeSalesPersonKpis', () => {
  const today = new Date('2026-03-15T00:00:00Z')

  it('sums pipeline, collected, rate, overdue, and trend', () => {
    const mous: MOU[] = [
      mou({ id: 'A', salesPersonId: 'sp-1', contractValue: 100000, received: 50000 }),
      mou({ id: 'B', salesPersonId: 'sp-1', contractValue: 200000, received: 200000, status: 'Completed' }),
      mou({ id: 'C', salesPersonId: 'sp-2', contractValue: 300000, received: 0 }),
    ]
    const payments: Payment[] = [
      payment({ mouId: 'A', status: 'Received', receivedDate: '2026-01-15', receivedAmount: 50000, expectedAmount: 50000 }),
      payment({ mouId: 'A', status: 'Overdue', expectedAmount: 25000 }),
      payment({ mouId: 'B', status: 'Received', receivedDate: '2026-02-10', receivedAmount: 100000, expectedAmount: 100000 }),
      payment({ mouId: 'B', status: 'Received', receivedDate: '2026-03-01', receivedAmount: 100000, expectedAmount: 100000 }),
    ]
    const k = computeSalesPersonKpis('sp-1', mous, payments, today)
    expect(k.activeMouCount).toBe(1)
    expect(k.pipelineValue).toBe(100000)      // only active MOU
    expect(k.collectedValue).toBe(250000)
    expect(k.collectionRate).toBe(250)        // 250000 / 100000 = 250%
    expect(k.overdueCount).toBe(1)
    expect(k.trend).toEqual([50000, 100000, 100000])
  })

  it('excludes MOUs with null salesPersonId', () => {
    const mous: MOU[] = [mou({ id: 'A', salesPersonId: null, contractValue: 100000 })]
    const k = computeSalesPersonKpis('sp-1', mous, [], today)
    expect(k.pipelineValue).toBe(0)
    expect(k.collectedValue).toBe(0)
    expect(k.collectionRate).toBe(0)
  })

  it('returns zero KPIs for empty data', () => {
    const k = computeSalesPersonKpis('sp-x', [], [], today)
    expect(k).toEqual({
      salesPersonId: 'sp-x',
      activeMouCount: 0,
      pipelineValue: 0,
      collectedValue: 0,
      collectionRate: 0,
      overdueCount: 0,
      trend: [0, 0, 0],
    })
  })
})

describe('countUnassigned', () => {
  it('counts MOUs with null salesPersonId', () => {
    const mous: MOU[] = [
      mou({ id: 'A', salesPersonId: null }),
      mou({ id: 'B', salesPersonId: 'sp-1' }),
      mou({ id: 'C', salesPersonId: null }),
    ]
    expect(countUnassigned(mous)).toBe(2)
  })
})

describe('rankLeaderboard', () => {
  const today = new Date('2026-03-15T00:00:00Z')
  it('sorts active-first, then collection rate desc, then pipeline desc', () => {
    const team = [sp('sp-a'), sp('sp-b'), sp('sp-c', { active: false })]
    const mous: MOU[] = [
      mou({ id: 'A', salesPersonId: 'sp-a', contractValue: 200000, received: 100000 }),
      mou({ id: 'B', salesPersonId: 'sp-b', contractValue: 100000, received: 80000 }),
      mou({ id: 'C', salesPersonId: 'sp-c', contractValue: 500000, received: 500000 }),
    ]
    const ranked = rankLeaderboard(team, mous, [], today)
    expect(ranked.map((r) => r.id)).toEqual(['sp-b', 'sp-a', 'sp-c'])
  })
})
