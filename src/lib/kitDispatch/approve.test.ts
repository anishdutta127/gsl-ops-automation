import { describe, expect, it, vi } from 'vitest'
import type {
  KitDispatch,
  MOU,
  PendingUpdate,
  School,
} from '@/lib/types'
import { approveKitDispatch, rejectKitDispatch } from './approve'

const FIXED_NOW = new Date('2026-05-10T12:00:00.000Z')

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

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-DEMO',
    name: 'Demo School',
    legalEntity: null,
    city: 'Pune',
    state: 'Maharashtra',
    region: 'South-West',
    pinCode: '411001',
    contactPerson: 'Mr Sharma',
    email: 's@demo.com',
    phone: '9876543210',
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-04-01',
    auditLog: [],
    ...overrides,
  }
}

function kd(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-STEAM-2627-001',
    mouId: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-DEMO',
    schoolName: 'Demo School',
    productSelected: 'TinkRworks',
    dispatchStatus: 'Not Started',
    allocations: [
      { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
    ],
    salesApprovalStatus: 'Pending',
    salesApprovedBy: null,
    salesApprovedAt: null,
    salesRejectionReason: null,
    dispatchSummary: null,
    shipmentTracking: null,
    pod: null,
    auditLog: [],
    createdAt: FIXED_NOW.toISOString(),
    ...overrides,
  }
}

function makeEnqueue() {
  const queue: PendingUpdate[] = []
  const fn = vi.fn(async (params: Parameters<typeof import('@/lib/pendingUpdates').enqueueUpdate>[0]) => {
    const entry: PendingUpdate = {
      id: 'fake',
      queuedAt: FIXED_NOW.toISOString(),
      queuedBy: params.queuedBy,
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
      retryCount: 0,
    }
    queue.push(entry)
    return entry
  })
  return { fn, queue }
}

describe('approveKitDispatch', () => {
  it('approves and generates the initial dispatch summary', async () => {
    const { fn } = makeEnqueue()
    const r = await approveKitDispatch(
      { mouId: 'MOU-STEAM-2627-001', user: { id: 'sp-vikram', name: 'Vikram T.' } },
      { mous: [mou()], kitDispatches: [kd()], schools: [school()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dispatch.salesApprovalStatus).toBe('Approved')
    expect(r.dispatch.salesApprovedBy).toBe('sp-vikram')
    expect(r.dispatch.salesApprovedAt).toBe(FIXED_NOW.toISOString())
    expect(r.dispatch.dispatchSummary).not.toBeNull()
    expect(r.dispatch.dispatchSummary?.contactPerson).toBe('Mr Sharma')
    expect(r.dispatch.dispatchSummary?.contactNumber).toBe('9876543210')
    expect(r.dispatch.dispatchSummary?.shippingAddress).toContain('Pune')
  })
  it('rejects approval when not pending', async () => {
    const { fn } = makeEnqueue()
    const r = await approveKitDispatch(
      { mouId: 'MOU-STEAM-2627-001', user: { id: 'sp-vikram', name: 'V.' } },
      {
        mous: [mou()],
        kitDispatches: [kd({ salesApprovalStatus: 'Approved' })],
        schools: [school()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not-pending')
  })
})

describe('rejectKitDispatch', () => {
  it('rejects with non-empty reason and stores it', async () => {
    const { fn } = makeEnqueue()
    const r = await rejectKitDispatch(
      { mouId: 'MOU-STEAM-2627-001', user: { id: 'sp-vikram', name: 'V.' }, reason: 'Counts look wrong' },
      { mous: [mou()], kitDispatches: [kd()], schools: [school()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dispatch.salesApprovalStatus).toBe('Rejected')
    expect(r.dispatch.salesRejectionReason).toBe('Counts look wrong')
    const auditNote = r.dispatch.auditLog.at(-1)
    expect(auditNote?.notes).toContain('Counts look wrong')
  })
  it('returns rejection-reason-required for empty reason', async () => {
    const { fn } = makeEnqueue()
    const r = await rejectKitDispatch(
      { mouId: 'MOU-STEAM-2627-001', user: { id: 'sp-vikram', name: 'V.' }, reason: '   ' },
      { mous: [mou()], kitDispatches: [kd()], schools: [school()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('rejection-reason-required')
    expect(fn).not.toHaveBeenCalled()
  })
})
