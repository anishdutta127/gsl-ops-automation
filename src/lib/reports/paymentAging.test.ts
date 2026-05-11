import { describe, it, expect } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import {
  computePaymentAging,
  csvForPaymentAging,
} from './paymentAging'
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
    salesPersonId: null,
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
    dueDateIso: '2026-04-01',
    expectedAmount: 10000,
    receivedAmount: 0,
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
  }
}

const filters: ReportFilters = {
  fy: '2026-27',
  dept: 'All',
  from: null,
  to: null,
}

const now = new Date('2026-05-12T00:00:00Z')

describe('computePaymentAging', () => {
  it('handles empty data', () => {
    const r = computePaymentAging({
      payments: [],
      mous: [],
      filters,
      now,
    })
    expect(r.overdueSchools).toEqual([])
    expect(r.unpaidPis).toEqual([])
    expect(r.buckets).toHaveLength(4)
    for (const b of r.buckets) {
      expect(b.count).toBe(0)
      expect(b.totalAmount).toBe(0)
    }
  })

  it('buckets payments by days overdue', () => {
    const mkDue = (offsetDays: number) =>
      new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    const payments = [
      pay({ id: 'A', dueDateIso: mkDue(15) }), // 0-30
      pay({ id: 'B', dueDateIso: mkDue(45) }), // 31-60
      pay({ id: 'C', dueDateIso: mkDue(75) }), // 61-90
      pay({ id: 'D', dueDateIso: mkDue(120) }), // 90+
    ]
    const r = computePaymentAging({
      payments,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.buckets[0]?.count).toBe(1)
    expect(r.buckets[1]?.count).toBe(1)
    expect(r.buckets[2]?.count).toBe(1)
    expect(r.buckets[3]?.count).toBe(1)
  })

  it('omits not-yet-due payments', () => {
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const r = computePaymentAging({
      payments: [pay({ dueDateIso: future })],
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('overdueSchools surfaces schools >30 days overdue', () => {
    const mkDue = (offsetDays: number) =>
      new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    const payments = [
      pay({ id: 'P1', schoolName: 'A', mouId: 'M1', dueDateIso: mkDue(45) }),
      pay({ id: 'P2', schoolName: 'A', mouId: 'M1', dueDateIso: mkDue(75) }),
      pay({ id: 'P3', schoolName: 'B', mouId: 'M2', dueDateIso: mkDue(10) }),
    ]
    const mous = [mou({ id: 'M1' }), mou({ id: 'M2' })]
    const r = computePaymentAging({
      payments,
      mous,
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.overdueSchools).toHaveLength(1)
    expect(r.overdueSchools[0]?.schoolName).toBe('A')
    expect(r.overdueSchools[0]?.overdueCount).toBe(2)
    expect(r.overdueSchools[0]?.maxDaysOverdue).toBe(75)
  })

  it('topTen caps at 10 schools', () => {
    const mkDue = (offsetDays: number) =>
      new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    const payments = Array.from({ length: 15 }, (_, i) =>
      pay({
        id: `P${i}`,
        schoolName: `School ${i}`,
        mouId: `M${i}`,
        dueDateIso: mkDue(60),
      }),
    )
    const mous = payments.map((p) => mou({ id: p.mouId }))
    const r = computePaymentAging({
      payments,
      mous,
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.topTen).toHaveLength(10)
  })

  it('unpaidPis lists payments with piGeneratedAt and no receipt', () => {
    const payments = [
      pay({
        id: 'P1',
        piGeneratedAt: '2026-04-01T00:00:00Z',
        receivedAmount: 0,
        status: 'PI Sent',
      }),
      pay({ id: 'P2', piGeneratedAt: null }),
    ]
    const r = computePaymentAging({
      payments,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.unpaidPis.map((p) => p.paymentId)).toEqual(['P1'])
  })

  it('excludes fully-paid items from buckets', () => {
    const past = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const r = computePaymentAging({
      payments: [
        pay({
          dueDateIso: past,
          status: 'Received',
          receivedAmount: 10000,
          expectedAmount: 10000,
        }),
      ],
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('overdueSchools sorted by totalOverdue desc', () => {
    const mkDue = (offsetDays: number) =>
      new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    const payments = [
      pay({
        id: 'P1',
        schoolName: 'A',
        mouId: 'M1',
        dueDateIso: mkDue(45),
        expectedAmount: 1000,
      }),
      pay({
        id: 'P2',
        schoolName: 'B',
        mouId: 'M2',
        dueDateIso: mkDue(45),
        expectedAmount: 5000,
      }),
    ]
    const mous = [mou({ id: 'M1' }), mou({ id: 'M2' })]
    const r = computePaymentAging({
      payments,
      mous,
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.overdueSchools[0]?.schoolName).toBe('B')
  })

  it('honours FY scoping via parent MOU academicYear', () => {
    const mkDue = (offsetDays: number) =>
      new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    const payments = [
      pay({ id: 'P1', dueDateIso: mkDue(45), mouId: 'M1' }),
      pay({ id: 'P2', dueDateIso: mkDue(45), mouId: 'M2' }),
    ]
    const mous = [
      mou({ id: 'M1', academicYear: '2026-27' }),
      mou({ id: 'M2', academicYear: '2025-26' }),
    ]
    const r = computePaymentAging({
      payments,
      mous,
      filters,
      now,
    })
    expect(r.overdueSchools).toHaveLength(1)
  })
})

describe('csvForPaymentAging', () => {
  it('emits header row', () => {
    const csv = csvForPaymentAging({
      payments: [],
      mous: [],
      filters,
      now,
    })
    expect(csv.split('\n')[0]).toContain('Section')
  })

  it('escapes school names with commas and quotes', () => {
    const past = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const payments = [
      pay({
        schoolName: 'My, "fancy" School',
        dueDateIso: past,
      }),
    ]
    const csv = csvForPaymentAging({
      payments,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(csv).toContain('"My, ""fancy"" School"')
  })
})
