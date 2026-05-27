import { describe, it, expect } from 'vitest'
import { allocateKits, type AllocateDeps } from '@/lib/kitDispatch/allocate'
import type { InventoryItem, KitAllocation, MOU } from '@/lib/types'
import { vi } from 'vitest'

const mou: MOU = {
  id: 'MOU-OVR', schoolId: 'SCH-X', schoolName: 'Override Test School',
  programme: 'STEAM', status: 'Active', productSelection: 'Cretile',
  salesPersonId: null, auditLog: [],
} as unknown as MOU

const sku: InventoryItem = {
  id: 'INV-1', skuName: 'Cretile Grade-band kit', category: 'Cretile',
  currentStock: 12, reorderThreshold: 5, active: true, auditLog: [],
} as unknown as InventoryItem

const allocation: KitAllocation = {
  grade: 3, students: 80, kitsQty: 80,
  kitType: 'Reusable', productName: 'Cretile Grade-band kit',
}

function makeDeps(): AllocateDeps {
  return {
    mous: [mou],
    kitDispatches: [],
    inventory: [sku],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enqueue: vi.fn(async () => ({}) as never),
    now: () => new Date('2026-05-27T10:00:00Z'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateAllocationsOCC: vi.fn(async () => ({ ok: true as const, newVersion: 2 })) as never,
  }
}

describe('dispatch inventory override proof', () => {
  it('BLOCKS shortfall allocation WITHOUT override reason', async () => {
    const r = await allocateKits(
      { mouId: 'MOU-OVR', user: { id: 'misba.m', name: 'Misba M.' }, allocations: [allocation] },
      makeDeps(),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('inventory-insufficient')
      expect(r.offendingSkuName).toBe('Cretile Grade-band kit')
      expect(r.requested).toBe(80)
      expect(r.available).toBe(12)
    }
  })

  it('BLOCKS shortfall allocation with EMPTY override reason', async () => {
    const r = await allocateKits(
      { mouId: 'MOU-OVR', user: { id: 'misba.m', name: 'Misba M.' }, allocations: [allocation], inventoryOverrideReason: '   ' },
      makeDeps(),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('inventory-insufficient')
  })

  it('ALLOWS shortfall allocation WITH non-empty override reason', async () => {
    const deps = makeDeps()
    const r = await allocateKits(
      { mouId: 'MOU-OVR', user: { id: 'misba.m', name: 'Misba M.' }, allocations: [allocation], inventoryOverrideReason: 'Not from GSL Inventory/Warehouse' },
      deps,
    )
    expect(r.ok).toBe(true)
  })

  it('records override reason + user in audit trail', async () => {
    const deps = makeDeps()
    const r = await allocateKits(
      { mouId: 'MOU-OVR', user: { id: 'misba.m', name: 'Misba M.' }, allocations: [allocation], inventoryOverrideReason: 'Not from GSL Inventory/Warehouse ; vendor ships direct' },
      deps,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const dispatch = r.dispatch
    const auditEntries = dispatch.auditLog
    const overrideEntry = auditEntries.find(e => e.notes && e.notes.includes('INVENTORY OVERRIDE'))
    expect(overrideEntry).toBeTruthy()
    expect(overrideEntry!.notes).toContain('INVENTORY OVERRIDE by Misba M. (misba.m)')
    expect(overrideEntry!.notes).toContain('Not from GSL Inventory/Warehouse')
    const after = overrideEntry!.after as Record<string, unknown>
    expect(after.inventoryOverrideReason).toBe('Not from GSL Inventory/Warehouse ; vendor ships direct')
    expect(overrideEntry!.user).toBe('misba.m')
  })

  it('normal allocation (within stock) still works WITHOUT override', async () => {
    const smallAlloc: KitAllocation = { grade: 1, students: 10, kitsQty: 10, kitType: 'Reusable', productName: 'Cretile Grade-band kit' }
    const r = await allocateKits(
      { mouId: 'MOU-OVR', user: { id: 'misba.m', name: 'Misba M.' }, allocations: [smallAlloc] },
      makeDeps(),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      const notes = r.dispatch.auditLog.map(e => e.notes).join(' ')
      expect(notes).not.toContain('INVENTORY OVERRIDE')
    }
  })
})
