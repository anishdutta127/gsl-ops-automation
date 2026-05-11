import { describe, expect, it, vi } from 'vitest'
import type {
  AccountsDispatchEntry,
  DispatchSummary,
  InventoryItem,
  KitDispatch,
  PendingUpdate,
} from '@/lib/types'
import { executeAccountsDispatch } from './accountsExecute'

const FIXED_NOW = new Date('2026-05-10T12:00:00.000Z')

function summary(overrides: Partial<DispatchSummary> = {}): DispatchSummary {
  return {
    schoolName: 'Demo',
    shippingAddress: 'X',
    contactPerson: 'X',
    contactNumber: 'X',
    salesRemarks: null,
    approvedBy: 'sp-x',
    approvedAt: FIXED_NOW.toISOString(),
    accountsEntries: [],
    deliveryChallanPath: null,
    warehouseEmailLoggedAt: null,
    ...overrides,
  }
}

function kd(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-A',
    mouId: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'A School',
    productSelected: 'TinkRworks',
    dispatchStatus: 'Not Started',
    allocations: [
      { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
      { grade: 7, students: 20, kitsQty: 5, kitType: 'Reusable', productName: 'Launchpad' },
    ],
    salesApprovalStatus: 'Approved',
    salesApprovedBy: 'sp-x',
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

function entry(overrides: Partial<AccountsDispatchEntry> = {}): AccountsDispatchEntry {
  return {
    grade: 6,
    studentsRequested: 30,
    productRequested: 'Launchpad',
    qtyRequested: 8,
    qtyActualDispatched: 8,
    ...overrides,
  }
}

function makeEnqueue() {
  const queue: PendingUpdate[] = []
  const fn = vi.fn(async (params: Parameters<typeof import('@/lib/pendingUpdates').enqueueUpdate>[0]) => {
    const e: PendingUpdate = {
      id: 'fake',
      queuedAt: FIXED_NOW.toISOString(),
      queuedBy: params.queuedBy,
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
      retryCount: 0,
    }
    queue.push(e)
    return e
  })
  return { fn, queue }
}

describe('executeAccountsDispatch', () => {
  it('transitions to In Transit on full dispatch + decrements inventory', async () => {
    const { fn, queue } = makeEnqueue()
    const r = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'Misba' },
        accountsEntries: [entry(), entry({ grade: 7, qtyRequested: 5, qtyActualDispatched: 5 })],
      },
      { kitDispatches: [kd()], inventory: [inv()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newDispatchStatus).toBe('In Transit')
    // Total decrement = 8 + 5 = 13; aggregated by SKU into one inventory update.
    expect(r.inventoryDecrements).toHaveLength(1)
    expect(r.inventoryDecrements[0]?.qty).toBe(13)
    expect(r.inventoryDecrements[0]?.newStock).toBe(37)
    // Two queue entries: kitDispatch + inventoryItem.
    expect(queue).toHaveLength(2)
  })

  it('transitions to Pending on partial dispatch', async () => {
    const { fn } = makeEnqueue()
    const r = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'Misba' },
        accountsEntries: [
          entry({ qtyActualDispatched: 8 }),
          entry({ grade: 7, qtyRequested: 5, qtyActualDispatched: 0 }),
        ],
      },
      { kitDispatches: [kd()], inventory: [inv()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newDispatchStatus).toBe('Pending')
  })

  it('rejects qtyActualDispatched > qtyRequested', async () => {
    const { fn } = makeEnqueue()
    const r = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [entry({ qtyActualDispatched: 100 })],
      },
      { kitDispatches: [kd()], inventory: [inv()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('qty-over-requested')
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects when not yet approved', async () => {
    const { fn } = makeEnqueue()
    const r = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [entry()],
      },
      {
        kitDispatches: [kd({ salesApprovalStatus: 'Pending', dispatchSummary: null })],
        inventory: [inv()],
        enqueue: fn,
        now: () => FIXED_NOW,
      },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not-approved')
  })

  it('allows zero across all rows without advancing status', async () => {
    const { fn } = makeEnqueue()
    const r = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [entry({ qtyActualDispatched: 0 })],
      },
      { kitDispatches: [kd()], inventory: [inv()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newDispatchStatus).toBe('Not Started')
    // No inventory entries when nothing was actually dispatched.
    expect(r.inventoryDecrements).toHaveLength(0)
  })
})
