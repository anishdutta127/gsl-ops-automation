import { describe, expect, it } from 'vitest'
import {
  STAGE_ORDER,
  bucketByStage,
  buildStageBadges,
  computeStage,
} from './statusTracker'
import type { KitDispatch, MOU, Payment } from '@/lib/types'

const NOW = new Date('2026-05-11T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Test',
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
    spWithoutTax: 4000,
    spWithTax: 5000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-1-i1',
    mouId: 'MOU-1',
    schoolName: 'Test',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 125000,
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

function kit(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-1',
    mouId: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Test',
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
    ...overrides,
  }
}

describe('computeStage', () => {
  it('Draft MOU is in pipeline', () => {
    expect(
      computeStage({
        mou: mou({ status: 'Draft' }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('pipeline')
  })

  it('Pending Signature MOU is in pipeline', () => {
    expect(
      computeStage({
        mou: mou({ status: 'Pending Signature' }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('pipeline')
  })

  it('Active MOU with no actuals is mou-uploaded', () => {
    expect(
      computeStage({
        mou: mou({ status: 'Active', studentsActual: null }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('mou-uploaded')
  })

  it('Active MOU with actuals captured is active', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('active')
  })

  it('payment due in 30d with no PI is payment-pending', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [payment({ dueDateIso: '2026-05-25' })],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('payment-pending')
  })

  it('payment past due with no PI is still payment-pending', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [payment({ dueDateIso: '2026-04-01' })],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('payment-pending')
  })

  it('first installment Paid is installment-1-received', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [
          payment({
            instalmentSeq: 1,
            status: 'Paid',
            receivedAmount: 125000,
            receivedDate: '2026-05-01',
          }),
        ],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('installment-1-received')
  })

  it('PI generated on any installment trumps payment-received', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [
          payment({
            instalmentSeq: 1,
            status: 'Paid',
            receivedAmount: 125000,
            receivedDate: '2026-05-01',
            piGeneratedAt: '2026-04-25T00:00:00Z',
          }),
        ],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('pi-generated')
  })

  it('dispatch with allocations is dispatch-requested', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [
          payment({ piGeneratedAt: '2026-04-25T00:00:00Z' }),
        ],
        dispatches: [
          kit({
            allocations: [{
              grade: 5,
              students: 30,
              kitsQty: 30,
              kitType: 'Consumable',
              productName: 'X',
            } as KitDispatch['allocations'][number]],
          }),
        ],
        now: NOW,
      }),
    ).toBe('dispatch-requested')
  })

  it('dispatch In Transit is shipment-in-progress', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [
          payment({ piGeneratedAt: '2026-04-25T00:00:00Z' }),
        ],
        dispatches: [kit({ dispatchStatus: 'In Transit' })],
        now: NOW,
      }),
    ).toBe('shipment-in-progress')
  })

  it('all dispatches Delivered + MOU not Completed is delivered', () => {
    expect(
      computeStage({
        mou: mou({ studentsActual: 95 }),
        payments: [
          payment({ piGeneratedAt: '2026-04-25T00:00:00Z' }),
        ],
        dispatches: [kit({ dispatchStatus: 'Delivered' })],
        now: NOW,
      }),
    ).toBe('delivered')
  })

  it('MOU Completed + all installments paid + all dispatches Delivered is closed', () => {
    expect(
      computeStage({
        mou: mou({ status: 'Completed', studentsActual: 95 }),
        payments: [
          payment({
            status: 'Paid',
            receivedAmount: 125000,
            piGeneratedAt: '2026-04-25T00:00:00Z',
          }),
        ],
        dispatches: [kit({ dispatchStatus: 'Delivered' })],
        now: NOW,
      }),
    ).toBe('closed')
  })

  it('MOU Completed with no payment/dispatch entities is not yet closed (needs payments to confirm full collection)', () => {
    expect(
      computeStage({
        mou: mou({ status: 'Completed', studentsActual: 95 }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('active')
  })
})

describe('buildStageBadges', () => {
  it('marks the current stage with "current", prior with "done", later with "future"', () => {
    const badges = buildStageBadges('pi-generated')
    const piIdx = STAGE_ORDER.indexOf('pi-generated')
    expect(badges[piIdx]?.state).toBe('current')
    for (let i = 0; i < piIdx; i++) expect(badges[i]?.state).toBe('done')
    for (let i = piIdx + 1; i < badges.length; i++) {
      expect(badges[i]?.state).toBe('future')
    }
  })

  it('pipeline as current yields all-future for the others', () => {
    const badges = buildStageBadges('pipeline')
    expect(badges[0]?.state).toBe('current')
    for (let i = 1; i < badges.length; i++) expect(badges[i]?.state).toBe('future')
  })

  it('closed as current yields all-done for the others', () => {
    const badges = buildStageBadges('closed')
    expect(badges[badges.length - 1]?.state).toBe('current')
    for (let i = 0; i < badges.length - 1; i++) expect(badges[i]?.state).toBe('done')
  })
})

describe('bucketByStage', () => {
  it('returns zero counts on empty input', () => {
    const counts = bucketByStage({
      mous: [],
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(STAGE_ORDER.every((s) => counts[s] === 0)).toBe(true)
  })

  it('archived MOUs are excluded', () => {
    const counts = bucketByStage({
      mous: [mou({ cohortStatus: 'archived', status: 'Draft' })],
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(counts.pipeline).toBe(0)
  })

  it('counts each MOU once at its current stage', () => {
    const counts = bucketByStage({
      mous: [
        mou({ id: 'M-A', status: 'Draft' }),
        mou({ id: 'M-B', status: 'Active', studentsActual: 50 }),
        mou({ id: 'M-C', status: 'Active', studentsActual: null }),
      ],
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(counts.pipeline).toBe(1)
    expect(counts.active).toBe(1)
    expect(counts['mou-uploaded']).toBe(1)
    expect(STAGE_ORDER.reduce((sum, s) => sum + counts[s], 0)).toBe(3)
  })
})
