import { describe, expect, it, vi } from 'vitest'
import type {
  DispatchSummary,
  KitDispatch,
  PendingUpdate,
  School,
} from '@/lib/types'
import { saveDispatchSummary } from './summary'

const FIXED_NOW = new Date('2026-05-10T12:00:00.000Z')

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-DEMO',
    name: 'Demo School',
    legalEntity: null,
    city: 'Pune',
    state: 'Maharashtra',
    region: 'South-West',
    pinCode: '411001',
    contactPerson: 'Old Sharma',
    email: 's@demo.com',
    phone: '9000000000',
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

function summary(overrides: Partial<DispatchSummary> = {}): DispatchSummary {
  return {
    schoolName: 'Demo School',
    shippingAddress: 'Pune, Maharashtra, 411001',
    contactPerson: 'Old Sharma',
    contactNumber: '9000000000',
    salesRemarks: null,
    approvedBy: 'sp-vikram',
    approvedAt: FIXED_NOW.toISOString(),
    accountsEntries: [],
    deliveryChallanPath: null,
    warehouseEmailLoggedAt: null,
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
    salesApprovalStatus: 'Approved',
    salesApprovedBy: 'sp-vikram',
    salesApprovedAt: FIXED_NOW.toISOString(),
    salesRejectionReason: null,
    dispatchSummary: summary(),
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

describe('saveDispatchSummary', () => {
  it('dual-writes when school details differ from the master', async () => {
    const { fn, queue } = makeEnqueue()
    const r = await saveDispatchSummary(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'sp-vikram', name: 'V.' },
        schoolName: 'Demo School (Renamed)',
        shippingAddress: 'New Address',
        contactPerson: 'New Sharma',
        contactNumber: '9111111111',
        salesRemarks: 'Kits are returnable.',
      },
      { kitDispatches: [kd()], schools: [school()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schoolEdited).toBe(true)
    expect(r.schoolFieldsChanged).toEqual(['name', 'contactPerson', 'phone'])
    expect(queue).toHaveLength(2)
    expect(queue[0]?.entity).toBe('kitDispatch')
    expect(queue[1]?.entity).toBe('school')
    expect((queue[1]?.payload?.audit as { notes?: string })?.notes).toContain(
      'updated via dispatch summary edit on DISPATCH-MOU-STEAM-2627-001',
    )
  })

  it('writes only the dispatch summary when school details are unchanged', async () => {
    const { fn, queue } = makeEnqueue()
    const r = await saveDispatchSummary(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'sp-vikram', name: 'V.' },
        schoolName: 'Demo School',
        shippingAddress: 'Pune, Maharashtra, 411001',
        contactPerson: 'Old Sharma',
        contactNumber: '9000000000',
        salesRemarks: null,
      },
      { kitDispatches: [kd()], schools: [school()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schoolEdited).toBe(false)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.entity).toBe('kitDispatch')
  })

  it('rejects when sales approval has not happened yet', async () => {
    const { fn } = makeEnqueue()
    const r = await saveDispatchSummary(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'sp-vikram', name: 'V.' },
        schoolName: 'Demo School',
        shippingAddress: 'x',
        contactPerson: 'x',
        contactNumber: 'x',
        salesRemarks: null,
      },
      {
        kitDispatches: [kd({ salesApprovalStatus: 'Pending', dispatchSummary: null })],
        schools: [school()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not-approved')
    expect(fn).not.toHaveBeenCalled()
  })
})
