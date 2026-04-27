import { describe, expect, it } from 'vitest'
import { daysSince, stageEnteredDate } from './stageEnteredDate'
import type { DeriveStageDeps } from './deriveStage'
import type { Dispatch, MOU, Payment, Programme } from '@/lib/types'

const emptyDeps: DeriveStageDeps = {
  dispatches: [],
  payments: [],
  communications: [],
  feedback: [],
}

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

describe('stageEnteredDate', () => {
  it('Pre-Ops: returns mou.startDate', () => {
    const m = mou({ id: 'M1', status: 'Pending Signature', startDate: '2026-03-15' })
    expect(stageEnteredDate(m, emptyDeps, 'pre-ops')).toBe('2026-03-15')
  })

  it('Pre-Ops: falls back to AY-start synthetic when startDate is null', () => {
    const m = mou({ id: 'M2', status: 'Pending Signature', startDate: null, academicYear: '2026-27' })
    expect(stageEnteredDate(m, emptyDeps, 'pre-ops')).toBe('2026-04-01')
  })

  it('mou-signed: returns mou.startDate (signed-date proxy for the first stage)', () => {
    const m = mou({ id: 'M3', startDate: '2026-04-15' })
    expect(stageEnteredDate(m, emptyDeps, 'mou-signed')).toBe('2026-04-15')
  })

  it('actuals-confirmed: returns mou-signed completion date (signedDate)', () => {
    const m = mou({ id: 'M4', startDate: '2026-04-15' })
    expect(stageEnteredDate(m, emptyDeps, 'actuals-confirmed')).toBe('2026-04-15')
  })

  it('invoice-raised: returns actualsConfirmed completion date when studentsActual is set', () => {
    const m = mou({ id: 'M5', startDate: '2026-04-15', studentsActual: 200 })
    expect(stageEnteredDate(m, emptyDeps, 'invoice-raised')).toBe('2026-04-15')
  })

  it('invoice-raised: returns null when studentsActual is null (cannot derive)', () => {
    const m = mou({ id: 'M6', startDate: '2026-04-15', studentsActual: null })
    expect(stageEnteredDate(m, emptyDeps, 'invoice-raised')).toBeNull()
  })

  it('payment-received: returns the PI generation date from the matching payment', () => {
    const m = mou({ id: 'M7', startDate: '2026-04-01', studentsActual: 100 })
    const payment: Payment = {
      id: 'P1', mouId: 'M7', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: null, expectedAmount: 1, receivedAmount: null,
      receivedDate: null, paymentMode: null, bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'PI Sent', notes: null,
      piSentDate: null, piSentTo: null, piGeneratedAt: '2026-05-10',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    expect(stageEnteredDate(m, { ...emptyDeps, payments: [payment] }, 'payment-received')).toBe('2026-05-10')
  })

  it('kit-dispatched: returns the payment-received date', () => {
    const m = mou({ id: 'M8', studentsActual: 100 })
    const payment: Payment = {
      id: 'P1', mouId: 'M8', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-06-01', expectedAmount: 1, receivedAmount: 1,
      receivedDate: '2026-06-15', paymentMode: 'Bank Transfer', bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'Received', notes: null,
      piSentDate: null, piSentTo: null, piGeneratedAt: '2026-05-10',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    expect(stageEnteredDate(m, { ...emptyDeps, payments: [payment] }, 'kit-dispatched')).toBe('2026-06-15')
  })

  it('delivery-acknowledged: returns the kit-dispatched date', () => {
    const m = mou({ id: 'M9' })
    const dispatch: Dispatch = {
      id: 'D1', mouId: 'M9', schoolId: 'SCH-T', installmentSeq: 1,
      stage: 'dispatched', installment1Paid: true, overrideEvent: null,
      poRaisedAt: '2026-06-20', dispatchedAt: '2026-06-22',
      deliveredAt: null, acknowledgedAt: null,
      acknowledgementUrl: null, notes: null, auditLog: [],
    }
    expect(stageEnteredDate(m, { ...emptyDeps, dispatches: [dispatch] }, 'delivery-acknowledged')).toBe('2026-06-22')
  })

  it('feedback-submitted: returns the delivery-acknowledged date', () => {
    const m = mou({ id: 'M10' })
    const ack: Dispatch = {
      id: 'D1', mouId: 'M10', schoolId: 'SCH-T', installmentSeq: 1,
      stage: 'acknowledged', installment1Paid: true, overrideEvent: null,
      poRaisedAt: '2026-06-20', dispatchedAt: '2026-06-22',
      deliveredAt: '2026-06-25', acknowledgedAt: '2026-06-28',
      acknowledgementUrl: 'https://x', notes: null, auditLog: [],
    }
    expect(stageEnteredDate(m, { ...emptyDeps, dispatches: [ack] }, 'feedback-submitted')).toBe('2026-06-28')
  })

  it('determinism: same inputs return same date across calls', () => {
    const m = mou({ id: 'M11', startDate: '2026-04-15' })
    expect(stageEnteredDate(m, emptyDeps, 'mou-signed'))
      .toBe(stageEnteredDate(m, emptyDeps, 'mou-signed'))
  })
})

describe('daysSince', () => {
  const now = new Date('2026-05-15T12:00:00.000Z')

  it('null entered date returns null', () => {
    expect(daysSince(null, now)).toBeNull()
  })

  it('unparseable entered date returns null', () => {
    expect(daysSince('not-a-date', now)).toBeNull()
  })

  it('returns whole-day diff', () => {
    expect(daysSince('2026-05-01', now)).toBe(14)
    expect(daysSince('2026-05-15', now)).toBe(0)
  })

  it('clamps future-dated entered date to 0', () => {
    expect(daysSince('2026-06-01', now)).toBe(0)
  })

  it('floors partial days (e.g., 13.9 days -> 13)', () => {
    const partial = new Date('2026-05-14T22:00:00.000Z') // ~22h ago = 0 full days
    expect(daysSince(partial.toISOString(), now)).toBe(0)
  })
})
