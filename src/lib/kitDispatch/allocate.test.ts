import { describe, expect, it, vi } from 'vitest'
import type {
  InventoryItem,
  KitAllocation,
  KitDispatch,
  MOU,
  PendingUpdate,
} from '@/lib/types'
import { allocateKits } from './allocate'

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
    productSelection: 'TinkRworks',
    ...overrides,
  }
}

function inv(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-LAUNCHPAD',
    skuName: 'Launchpad',
    category: 'TinkRworks',
    cretileGrade: null,
    mastersheetSourceName: null,
    currentStock: 50,
    reorderThreshold: null,
    notes: null,
    active: true,
    lastUpdatedAt: '2026-04-01T00:00:00.000Z',
    lastUpdatedBy: 'system',
    auditLog: [],
    ...overrides,
  }
}

function row(overrides: Partial<KitAllocation> = {}): KitAllocation {
  return {
    grade: 6,
    students: 30,
    kitsQty: 8,
    kitType: 'Reusable',
    productName: 'Launchpad',
    ...overrides,
  }
}

function makeEnqueue() {
  const queue: PendingUpdate[] = []
  const fn = vi.fn(async (params: Parameters<typeof import('@/lib/pendingUpdates').enqueueUpdate>[0]) => {
    const entry: PendingUpdate = {
      id: 'fake-uuid',
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

describe('allocateKits', () => {
  it('mints a KitDispatch record on first submit and queues create', async () => {
    const { fn } = makeEnqueue()
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row()],
      },
      {
        mous: [mou()],
        kitDispatches: [],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.created).toBe(true)
    expect(r.dispatch.id).toBe('DISPATCH-MOU-STEAM-2627-001')
    expect(r.dispatch.salesApprovalStatus).toBe('Pending')
    expect(r.dispatch.allocations).toHaveLength(1)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn.mock.calls[0]?.[0]?.operation).toBe('create')
  })

  it('updates an existing record and resets approval status to Pending', async () => {
    const existing: KitDispatch = {
      id: 'DISPATCH-MOU-STEAM-2627-001',
      mouId: 'MOU-STEAM-2627-001',
      schoolId: 'SCH-DEMO',
      schoolName: 'Demo School',
      productSelected: 'TinkRworks',
      dispatchStatus: 'Not Started',
      allocations: [row({ kitsQty: 4 })],
      salesApprovalStatus: 'Rejected',
      salesApprovedBy: null,
      salesApprovedAt: null,
      salesRejectionReason: 'old reason',
      dispatchSummary: null,
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: FIXED_NOW.toISOString(),
      version: 1,
    }
    const { fn } = makeEnqueue()
    // P2b.X OCC: UPDATE path goes through kitDispatchRepo.updateAllocationsOCC,
    // not deps.enqueue. Stub it here and assert against the stub.
    const occCalls: Array<{ id: string; expectedVersion: number; patch: unknown }> = []
    const occStub = vi.fn(async (id: string, expectedVersion: number, patch: unknown) => {
      occCalls.push({ id, expectedVersion, patch })
      return { ok: true as const, newVersion: expectedVersion + 1 }
    })
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row({ kitsQty: 5 })],
      },
      {
        mous: [mou()],
        kitDispatches: [existing],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
        updateAllocationsOCC: occStub as never,
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.created).toBe(false)
    expect(r.dispatch.salesApprovalStatus).toBe('Pending')
    expect(r.dispatch.salesRejectionReason).toBeNull()
    expect(occStub).toHaveBeenCalledOnce()
    expect(occCalls[0]?.expectedVersion).toBe(1)
    expect(r.dispatch.version).toBe(2)
  })

  it('returns version-conflict when OCC mismatch (another user saved first)', async () => {
    const existing: KitDispatch = {
      id: 'DISPATCH-MOU-STEAM-2627-001',
      mouId: 'MOU-STEAM-2627-001',
      schoolId: 'SCH-DEMO',
      schoolName: 'Demo School',
      productSelected: 'TinkRworks',
      dispatchStatus: 'Not Started',
      allocations: [row({ kitsQty: 4 })],
      salesApprovalStatus: 'Pending',
      salesApprovedBy: null,
      salesApprovedAt: null,
      salesRejectionReason: null,
      dispatchSummary: null,
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: FIXED_NOW.toISOString(),
      version: 1,
    }
    const { fn } = makeEnqueue()
    const occStub = vi.fn(async () => ({ ok: false as const, conflictVersion: 5 }))
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row({ kitsQty: 5 })],
        expectedVersion: 1,
      },
      {
        mous: [mou()],
        kitDispatches: [existing],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
        updateAllocationsOCC: occStub as never,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('version-conflict')
    expect(r.conflictVersion).toBe(5)
  })

  it('rejects when kitsQty exceeds inventory availability', async () => {
    const { fn } = makeEnqueue()
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row({ kitsQty: 999 })],
      },
      {
        mous: [mou()],
        kitDispatches: [],
        inventory: [inv({ currentStock: 10 })],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('inventory-insufficient')
    expect(r.offendingSkuName).toBe('Launchpad')
    expect(r.requested).toBe(999)
    expect(r.available).toBe(10)
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects when SKU does not match productSelection', async () => {
    const { fn } = makeEnqueue()
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [
          row({
            productName: 'Cretile Grade-band kit',
          }),
        ],
      },
      {
        mous: [mou({ productSelection: 'TinkRworks' })],
        kitDispatches: [],
        inventory: [
          inv({
            id: 'INV-CRETILE-G6',
            skuName: 'Cretile Grade-band kit',
            category: 'Cretile',
            cretileGrade: 6,
            currentStock: 100,
          }),
        ],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('sku-mismatch-product')
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects invalid rows (grade out of range, zero qty, missing type)', async () => {
    const { fn } = makeEnqueue()
    for (const bad of [
      row({ grade: 0 }),
      row({ kitsQty: 0 }),
      row({ kitType: null }),
      row({ productName: '' }),
    ]) {
      const r = await allocateKits(
        {
          mouId: 'MOU-STEAM-2627-001',
          user: { id: 'shashank.k', name: 'Shashank K.' },
          allocations: [bad],
        },
        { mous: [mou()], kitDispatches: [], inventory: [inv()], enqueue: fn, now: () => FIXED_NOW },
      )
      expect(r.ok).toBe(false)
    }
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects when MOU is not yet at Active or later status', async () => {
    const { fn } = makeEnqueue()
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row()],
      },
      {
        mous: [mou({ status: 'Pending Signature' })],
        kitDispatches: [],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('mou-not-eligible')
    expect(fn).not.toHaveBeenCalled()
  })

  it('writes a sales-approval-pending audit notes entry', async () => {
    const { fn } = makeEnqueue()
    const r = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-001',
        user: { id: 'shashank.k', name: 'Shashank K.' },
        allocations: [row()],
      },
      {
        mous: [mou({ salesPersonId: 'sp-vikram' })],
        kitDispatches: [],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const audit = r.dispatch.auditLog
    const hasNotify = audit.some((a) =>
      a.notes?.includes('sales-approval-pending; notified sales rep sp-vikram'),
    )
    expect(hasNotify).toBe(true)
  })
})
