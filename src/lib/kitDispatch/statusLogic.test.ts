/*
 * Gate 3 Step 7: status logic + inventory module integration test suite.
 *
 * The Step 6 accountsExecute lib already covers the per-call assertions
 * (partial -> Pending, full -> In Transit, all-zero stays at previous).
 * This suite walks the full lifecycle from allocation -> approve ->
 * execute, asserting that:
 *   1. Inventory is NOT decremented at allocation submit (Q8 decision).
 *   2. Inventory IS decremented at accounts-execute.
 *   3. The dispatchStatus follows the joint spec section 11 ladder
 *      (Not Started -> Pending or In Transit, depending on full/partial).
 *   4. Audit entries land on both kitDispatch and inventoryItem queue
 *      writes.
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  InventoryItem,
  KitDispatch,
  MOU,
  PendingUpdate,
  School,
} from '@/lib/types'
import { allocateKits } from './allocate'
import { approveKitDispatch } from './approve'
import { executeAccountsDispatch } from './accountsExecute'

const FIXED_NOW = new Date('2026-05-11T12:00:00.000Z')

function mou(): MOU {
  return {
    id: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'A School',
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
    salesPersonId: 'sp-x',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    productSelection: 'TinkRworks',
  }
}

function school(): School {
  return {
    id: 'SCH-A',
    name: 'A School',
    legalEntity: null,
    city: 'Pune',
    state: 'MH',
    region: 'South-West',
    pinCode: '411001',
    contactPerson: 'X',
    email: null,
    phone: '9000',
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-04-01',
    auditLog: [],
  }
}

function inv(stock: number): InventoryItem {
  return {
    id: 'INV-LAUNCHPAD',
    skuName: 'Launchpad',
    category: 'TinkRworks',
    cretileGrade: null,
    mastersheetSourceName: null,
    currentStock: stock,
    reorderThreshold: null,
    notes: null,
    active: true,
    lastUpdatedAt: '2026-04-01T00:00:00.000Z',
    lastUpdatedBy: 'system',
    auditLog: [],
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

describe('Gate 3 Step 7: integrated status + inventory lifecycle', () => {
  it('allocation submit does NOT decrement inventory', async () => {
    const { fn, queue } = makeEnqueue()
    await allocateKits(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        allocations: [
          { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
        ],
      },
      { mous: [mou()], kitDispatches: [], inventory: [inv(50)], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(queue.every((q) => q.entity !== 'inventoryItem')).toBe(true)
  })

  it('full lifecycle: allocate -> approve -> execute -> In Transit + decrement', async () => {
    const { fn: enqueue1 } = makeEnqueue()
    const allocRes = await allocateKits(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        allocations: [
          { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
        ],
      },
      { mous: [mou()], kitDispatches: [], inventory: [inv(50)], enqueue: enqueue1, now: () => FIXED_NOW },
    )
    expect(allocRes.ok).toBe(true)
    if (!allocRes.ok) return
    const allocated = allocRes.dispatch

    const { fn: enqueue2 } = makeEnqueue()
    const approveRes = await approveKitDispatch(
      { mouId: 'MOU-A', user: { id: 'sp-x', name: 'X' } },
      { mous: [mou()], kitDispatches: [allocated], schools: [school()], enqueue: enqueue2, now: () => FIXED_NOW },
    )
    expect(approveRes.ok).toBe(true)
    if (!approveRes.ok) return
    const approved = approveRes.dispatch

    const { fn: enqueue3, queue: queue3 } = makeEnqueue()
    const execRes = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [
          {
            grade: 6,
            studentsRequested: 30,
            productRequested: 'Launchpad',
            qtyRequested: 8,
            qtyActualDispatched: 8,
          },
        ],
      },
      { kitDispatches: [approved], inventory: [inv(50)], enqueue: enqueue3, now: () => FIXED_NOW },
    )
    expect(execRes.ok).toBe(true)
    if (!execRes.ok) return
    expect(execRes.newDispatchStatus).toBe('In Transit')
    expect(execRes.inventoryDecrements[0]?.newStock).toBe(42)
    // 1 kitDispatch update + 1 inventoryItem update
    expect(queue3.filter((q) => q.entity === 'inventoryItem')).toHaveLength(1)
    expect(queue3.filter((q) => q.entity === 'kitDispatch')).toHaveLength(1)
  })

  it('partial dispatch: status Pending, decrement only the dispatched qty', async () => {
    const { fn: enqueue } = makeEnqueue()
    const approved: KitDispatch = {
      id: 'DISPATCH-MOU-A',
      mouId: 'MOU-A',
      schoolId: 'SCH-A',
      schoolName: 'A',
      productSelected: 'TinkRworks',
      dispatchStatus: 'Not Started',
      allocations: [
        { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
      ],
      salesApprovalStatus: 'Approved',
      salesApprovedBy: 'sp-x',
      salesApprovedAt: FIXED_NOW.toISOString(),
      salesRejectionReason: null,
      dispatchSummary: {
        schoolName: 'A',
        shippingAddress: '',
        contactPerson: '',
        contactNumber: '',
        salesRemarks: null,
        approvedBy: 'sp-x',
        approvedAt: FIXED_NOW.toISOString(),
        accountsEntries: [],
        deliveryChallanPath: null,
        warehouseEmailLoggedAt: null,
      },
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: FIXED_NOW.toISOString(),
    }
    const res = await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [
          {
            grade: 6,
            studentsRequested: 30,
            productRequested: 'Launchpad',
            qtyRequested: 8,
            qtyActualDispatched: 5,
          },
        ],
      },
      { kitDispatches: [approved], inventory: [inv(50)], enqueue, now: () => FIXED_NOW },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.newDispatchStatus).toBe('Pending')
    expect(res.inventoryDecrements[0]?.qty).toBe(5)
    expect(res.inventoryDecrements[0]?.newStock).toBe(45)
  })

  it('inventory audit entry carries the dispatch context', async () => {
    const { fn: enqueue, queue } = makeEnqueue()
    const approved: KitDispatch = {
      id: 'DISPATCH-MOU-A',
      mouId: 'MOU-A',
      schoolId: 'SCH-A',
      schoolName: 'A School',
      productSelected: 'TinkRworks',
      dispatchStatus: 'Not Started',
      allocations: [
        { grade: 6, students: 30, kitsQty: 8, kitType: 'Reusable', productName: 'Launchpad' },
      ],
      salesApprovalStatus: 'Approved',
      salesApprovedBy: 'sp-x',
      salesApprovedAt: FIXED_NOW.toISOString(),
      salesRejectionReason: null,
      dispatchSummary: {
        schoolName: 'A',
        shippingAddress: '',
        contactPerson: '',
        contactNumber: '',
        salesRemarks: null,
        approvedBy: 'sp-x',
        approvedAt: FIXED_NOW.toISOString(),
        accountsEntries: [],
        deliveryChallanPath: null,
        warehouseEmailLoggedAt: null,
      },
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: FIXED_NOW.toISOString(),
    }
    await executeAccountsDispatch(
      {
        mouId: 'MOU-A',
        user: { id: 'fin-misba', name: 'M' },
        accountsEntries: [
          {
            grade: 6,
            studentsRequested: 30,
            productRequested: 'Launchpad',
            qtyRequested: 8,
            qtyActualDispatched: 8,
          },
        ],
      },
      { kitDispatches: [approved], inventory: [inv(50)], enqueue, now: () => FIXED_NOW },
    )
    const invEntry = queue.find((q) => q.entity === 'inventoryItem')
    expect(invEntry?.payload?.outward).toMatchObject({
      qty: 8,
      dispatchId: 'DISPATCH-MOU-A',
      schoolName: 'A School',
      autoGenerated: true,
    })
  })
})
