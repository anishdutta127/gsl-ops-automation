import { describe, expect, it } from 'vitest'
import { canSendReminder, computeWorkflowState } from './workflowState'
import type { KitDispatch, MOU, Payment } from '@/lib/types'

const NOW = new Date('2026-05-11T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Sunrise High',
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
    schoolName: 'Sunrise High',
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
    schoolName: 'Sunrise High',
    productSelected: 'Cretile',
    dispatchStatus: 'Pending',
    allocations: [{
      grade: 5,
      students: 30,
      kitsQty: 30,
      kitType: 'Consumable',
      productName: 'X',
    } as KitDispatch['allocations'][number]],
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

describe('computeWorkflowState', () => {
  it('mou-uploaded stage returns Sales-owned grade-wise banner', () => {
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: null }),
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(banner).not.toBeNull()
    expect(banner?.owner).toBe('sales')
    expect(banner?.cta?.href).toBe('/mous/MOU-1/intake')
    expect(banner?.reminderEligible).toBe(true)
  })

  it('payment-pending with overdue PI fires Finance-owned banner', () => {
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: 95 }),
      payments: [payment({ dueDateIso: '2026-03-15', status: 'Pending' })],
      dispatches: [],
      now: NOW,
    })
    expect(banner).not.toBeNull()
    expect(banner?.owner).toBe('finance')
    expect(banner?.headline).toContain('overdue')
    expect(banner?.reminderEligible).toBe(true)
  })

  it('payment-pending due-within-30d (not overdue) fires Finance banner without reminder', () => {
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: 95 }),
      payments: [payment({ dueDateIso: '2026-05-25', status: 'Pending' })],
      dispatches: [],
      now: NOW,
    })
    expect(banner?.owner).toBe('finance')
    expect(banner?.reminderEligible).toBe(false)
  })

  it('dispatch-requested pending 24h+ fires Sales reminder', () => {
    const oldCreatedAt = new Date(NOW.getTime() - 30 * 60 * 60 * 1000).toISOString()
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: 95 }),
      payments: [
        payment({
          piGeneratedAt: '2026-04-25T00:00:00Z',
          status: 'Paid',
          receivedAmount: 125000,
        }),
      ],
      dispatches: [kit({ createdAt: oldCreatedAt, salesApprovalStatus: 'Pending' })],
      now: NOW,
    })
    expect(banner?.owner).toBe('sales')
    expect(banner?.reminderEligible).toBe(true)
    expect(banner?.headline).toContain('24h')
  })

  it('shipment-in-progress yields informational banner without reminder', () => {
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: 95 }),
      payments: [
        payment({
          piGeneratedAt: '2026-04-25T00:00:00Z',
          status: 'Paid',
          receivedAmount: 125000,
        }),
      ],
      dispatches: [
        kit({
          dispatchStatus: 'In Transit',
          salesApprovalStatus: 'Approved',
        }),
      ],
      now: NOW,
    })
    expect(banner?.owner).toBe('ops')
    expect(banner?.reminderEligible).toBe(false)
  })

  it('delivered stage yields Ops-owned closure banner', () => {
    const banner = computeWorkflowState({
      mou: mou({ studentsActual: 95 }),
      payments: [
        payment({
          piGeneratedAt: '2026-04-25T00:00:00Z',
          status: 'Paid',
          receivedAmount: 125000,
        }),
      ],
      dispatches: [kit({ dispatchStatus: 'Delivered' })],
      now: NOW,
    })
    expect(banner?.owner).toBe('ops')
    expect(banner?.headline).toContain('closure')
  })

  it('pipeline + closed return null (no handoff banner)', () => {
    const draftMou = mou({ status: 'Draft' })
    expect(
      computeWorkflowState({
        mou: draftMou,
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBeNull()
  })
})

describe('canSendReminder', () => {
  it('returns true when no prior reminder', () => {
    expect(canSendReminder({ lastReminderAt: null, now: NOW })).toBe(true)
  })

  it('respects 24h cooldown', () => {
    const yesterday = new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString()
    expect(canSendReminder({ lastReminderAt: yesterday, now: NOW })).toBe(false)
  })

  it('allows after cooldown elapses', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString()
    expect(canSendReminder({ lastReminderAt: twoDaysAgo, now: NOW })).toBe(true)
  })

  it('treats unparseable timestamp as no prior reminder', () => {
    expect(canSendReminder({ lastReminderAt: 'garbage', now: NOW })).toBe(true)
  })
})
