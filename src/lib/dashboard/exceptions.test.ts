import { describe, expect, it } from 'vitest'
import { buildExceptionFeed } from './exceptions'
import type {
  Communication, Dispatch, Feedback, MOU, Payment, School, User,
} from '@/lib/types'

const NOW = new Date('2026-04-26T12:00:00Z')

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'X School', legalEntity: null, city: 'Pune',
    state: 'Maharashtra', region: 'South-West', pinCode: null,
    contactPerson: null, email: null, phone: null, billingName: null,
    pan: null, gstNumber: null, notes: null, active: true, createdAt: '',
    auditLog: [], ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X School',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: 100, studentsVariance: 0,
    studentsVariancePct: 0, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 500000, received: 0, tds: 0, balance: 500000,
    receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null,
    notes: null, daysToExpiry: null, delayNotes: null, auditLog: [], ...overrides,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'D1', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
    stage: 'pending', installment1Paid: false, overrideEvent: null,
    poRaisedAt: null, dispatchedAt: null, deliveredAt: null,
    acknowledgedAt: null, acknowledgementUrl: null, notes: null,
    lineItems: [{ kind: 'flat', skuName: 'Test SKU', quantity: 1 }],
    requestId: null, raisedBy: 'system-test', raisedFrom: 'ops-direct',
    auditLog: [], ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'PMT-X', mouId: 'MOU-X', schoolName: 'X', programme: 'STEAM',
    instalmentLabel: '1 of 4', instalmentSeq: 1, totalInstalments: 4,
    description: '', dueDateRaw: null, dueDateIso: '2026-04-01',
    expectedAmount: 100000, receivedAmount: null, receivedDate: null,
    paymentMode: null, bankReference: null, piNumber: 'GSL/OPS/26-27/0001',
    taxInvoiceNumber: null, status: 'Overdue', notes: null,
    piSentDate: '2026-03-15', piSentTo: null, piGeneratedAt: null,
    studentCountActual: null, partialPayments: null, auditLog: [],
    ...overrides,
  }
}

const baseEmpty = {
  mous: [], schools: [], dispatches: [], payments: [],
  communications: [] as Communication[], feedback: [] as Feedback[],
  user: null as User | null, now: NOW,
}

describe('buildExceptionFeed', () => {
  it('returns empty when no exceptions', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [mou({ studentsActual: 100 })],
      schools: [school()],
    })
    expect(result).toEqual([])
  })

  it('detects late-actuals (Active MOU past start date with null actuals)', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [mou({ studentsActual: null, startDate: '2026-04-01' })],
      schools: [school()],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.iconType).toBe('late-actuals')
    expect(result[0]?.href).toBe('/mous/MOU-X/actuals')
  })

  it('detects overdue invoices', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [mou({ studentsActual: 100 })],
      schools: [school()],
      payments: [payment()],
    })
    expect(result.find((e) => e.iconType === 'overdue-invoice')).toBeDefined()
  })

  it('detects stuck dispatches (>7 days in flight)', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [mou({ studentsActual: 100 })],
      schools: [school()],
      dispatches: [dispatch({ stage: 'in-transit', poRaisedAt: '2026-04-15T00:00:00Z' })],
    })
    expect(result.find((e) => e.iconType === 'stuck-dispatch')).toBeDefined()
  })

  it('detects missing-feedback (delivered 14+ days ago, no feedback)', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [mou({ studentsActual: 100 })],
      schools: [school()],
      dispatches: [dispatch({ stage: 'delivered', deliveredAt: '2026-04-01T00:00:00Z' })],
      feedback: [],
    })
    expect(result.find((e) => e.iconType === 'missing-feedback')).toBeDefined()
  })

  it('SalesRep scoping filters out other-rep MOUs', () => {
    const sales: User = {
      id: 'sp-vikram', name: 'V', email: 'v@example.test', role: 'SalesRep',
      testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
    }
    const mine = mou({ id: 'MINE', studentsActual: null, startDate: '2026-04-01' })
    const other = mou({ id: 'OTHER', salesPersonId: 'sp-other', studentsActual: null, startDate: '2026-04-01' })
    const result = buildExceptionFeed({
      ...baseEmpty,
      user: sales,
      mous: [mine, other],
      schools: [school()],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toContain('MINE')
  })

  it('orders by priority desc, then daysSince desc, then schoolName asc (deterministic)', () => {
    const result = buildExceptionFeed({
      ...baseEmpty,
      mous: [
        mou({ id: 'M1', studentsActual: null, startDate: '2026-04-01', schoolId: 'SA', schoolName: 'A' }),
        mou({ id: 'M2', studentsActual: null, startDate: '2026-04-15', schoolId: 'SB', schoolName: 'B' }),
      ],
      schools: [school({ id: 'SA' }), school({ id: 'SB' })],
    })
    // Both are 'late-actuals'; M1 is older (25d) → alert, M2 is newer (11d) → attention
    expect(result[0]?.priority).toBe('alert')
    expect(result[1]?.priority).toBe('attention')
  })
})
