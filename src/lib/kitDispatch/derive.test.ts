import { describe, expect, it } from 'vitest'
import type {
  KitDispatch,
  MOU,
  Payment,
} from '@/lib/types'
import {
  aggregatePaymentStatusForMou,
  deriveKitDispatchListRows,
  isMouEligibleForKitDispatch,
} from './derive'

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-DEMO',
    schoolName: 'Demo School',
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
    contractValue: 118000,
    received: 0,
    tds: 0,
    balance: 118000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
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
    id: 'MOU-STEAM-2627-001-i1',
    mouId: 'MOU-STEAM-2627-001',
    schoolName: 'Demo School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment I',
    dueDateRaw: 'Apr-26',
    dueDateIso: '2026-04-01',
    expectedAmount: 29500,
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

describe('isMouEligibleForKitDispatch', () => {
  it('returns true for signed-and-later statuses', () => {
    expect(isMouEligibleForKitDispatch(mou({ status: 'Active' }))).toBe(true)
    expect(isMouEligibleForKitDispatch(mou({ status: 'Completed' }))).toBe(true)
    expect(isMouEligibleForKitDispatch(mou({ status: 'Expired' }))).toBe(true)
    expect(isMouEligibleForKitDispatch(mou({ status: 'Renewed' }))).toBe(true)
  })
  it('returns false for Draft and Pending Signature', () => {
    expect(isMouEligibleForKitDispatch(mou({ status: 'Draft' }))).toBe(false)
    expect(isMouEligibleForKitDispatch(mou({ status: 'Pending Signature' }))).toBe(false)
  })
})

describe('aggregatePaymentStatusForMou', () => {
  it('returns Pending when no rows exist', () => {
    expect(aggregatePaymentStatusForMou('MOU-NEW', [])).toBe('Pending')
  })
  it('returns Received when every row is Paid', () => {
    const p = [
      payment({ id: 'a', status: 'Paid' }),
      payment({ id: 'b', status: 'Received' }),
    ]
    expect(aggregatePaymentStatusForMou('MOU-STEAM-2627-001', p)).toBe('Received')
  })
  it('returns Overdue when any row is Overdue', () => {
    const p = [
      payment({ id: 'a', status: 'Paid' }),
      payment({ id: 'b', status: 'Overdue' }),
    ]
    expect(aggregatePaymentStatusForMou('MOU-STEAM-2627-001', p)).toBe('Overdue')
  })
  it('returns Partial when any row is Partial and no Overdue', () => {
    const p = [
      payment({ id: 'a', status: 'Partial' }),
      payment({ id: 'b', status: 'Pending' }),
    ]
    expect(aggregatePaymentStatusForMou('MOU-STEAM-2627-001', p)).toBe('Partial')
  })
})

describe('deriveKitDispatchListRows', () => {
  it('synthesises a stub row for an eligible MOU with no KitDispatch record', () => {
    const rows = deriveKitDispatchListRows({
      mous: [mou({ id: 'MOU-A', schoolName: 'A School' })],
      kitDispatches: [],
      payments: [],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hasRecord).toBe(false)
    expect(rows[0]?.dispatchStatus).toBe('Not Started')
    expect(rows[0]?.id).toBe('STUB-MOU-A')
  })
  it('skips a MOU in Pending Signature status', () => {
    const rows = deriveKitDispatchListRows({
      mous: [mou({ id: 'MOU-A', status: 'Pending Signature' })],
      kitDispatches: [],
      payments: [],
    })
    expect(rows).toHaveLength(0)
  })
  it('returns the real KitDispatch row when a record exists', () => {
    const kd: KitDispatch = {
      id: 'DISPATCH-MOU-A',
      mouId: 'MOU-A',
      schoolId: 'SCH-A',
      schoolName: 'A School',
      productSelected: 'TinkRworks',
      dispatchStatus: 'In Transit',
      allocations: [],
      salesApprovalStatus: 'Approved',
      salesApprovedBy: 'sp-x',
      salesApprovedAt: '2026-05-01T00:00:00.000Z',
      salesRejectionReason: null,
      dispatchSummary: null,
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: '2026-04-30T00:00:00.000Z',
    }
    const rows = deriveKitDispatchListRows({
      mous: [mou({ id: 'MOU-A' })],
      kitDispatches: [kd],
      payments: [],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hasRecord).toBe(true)
    expect(rows[0]?.dispatchStatus).toBe('In Transit')
    expect(rows[0]?.productSelected).toBe('TinkRworks')
  })
  it('computes payment status from payments.json', () => {
    const rows = deriveKitDispatchListRows({
      mous: [mou({ id: 'MOU-A' })],
      kitDispatches: [],
      payments: [payment({ mouId: 'MOU-A', status: 'Overdue' })],
    })
    expect(rows[0]?.paymentStatus).toBe('Overdue')
  })
})
