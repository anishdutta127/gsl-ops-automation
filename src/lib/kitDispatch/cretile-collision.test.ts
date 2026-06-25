/*
 * Reproduce-then-fix proof for THE root cause Pranav described: the 8
 * Cretile grade-band kits share the identical skuName "Cretile Grade-band
 * kit", distinguished only by a hidden cretileGrade. The old allocation
 * path keyed inventory by skuName in a Map, collapsing all 8 onto one
 * (last-wins) and checking every grade against the wrong grade's stock -
 * so a valid grade-5 allocation could be rejected (or mis-accepted)
 * against grade-9's stock, and the save never advanced.
 *
 * This test (a) documents the old collapse and (b) proves the new
 * (category, cretileGrade) resolution makes the same grade-5 Cretile
 * dispatch save and advance.
 */

import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem, KitAllocation, KitDispatch, MOU, PendingUpdate } from '@/lib/types'
import { allocateKits } from './allocate'
import { CRETILE_GENERIC_SKU } from '@/lib/inventory/resolveSku'

const FIXED_NOW = new Date('2026-06-04T12:00:00.000Z')

// Real catalogue shape: Cretile G3..G10, identical skuName, distinct
// cretileGrade + stock. Explicit array (NOT an int-keyed object, which JS
// reorders numerically) mirrors inventory_items.json order - G10 first,
// G9 last - so the old last-wins Map collapse lands on G9 (stock 12).
const CRETILE_ROWS: Array<[grade: number, stock: number]> = [
  [10, 13], [3, 12], [4, 14], [5, 14], [6, 26], [7, 53], [8, 24], [9, 12],
]
const inventory: InventoryItem[] = CRETILE_ROWS.map(([g, stock]) => ({
  id: `INV-CRETILE-G${g}`,
  skuName: CRETILE_GENERIC_SKU,
  category: 'Cretile',
  cretileGrade: g,
  mastersheetSourceName: `Grade ${g} Kit`,
  currentStock: stock,
  reorderThreshold: null,
  notes: null,
  active: true,
  lastUpdatedAt: '2026-04-28T18:00:00.000Z',
  lastUpdatedBy: 'system',
  auditLog: [],
}))

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2627-CRETILE',
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
    productSelection: 'Cretile',
    ...over,
  }
}

function alloc(over: Partial<KitAllocation> = {}): KitAllocation {
  return {
    grade: 5,
    students: 14,
    kitsQty: 13,
    kitType: 'Consumable',
    productName: CRETILE_GENERIC_SKU,
    ...over,
  }
}

function deps() {
  return {
    mous: [mou()],
    kitDispatches: [] as KitDispatch[],
    inventory,
    enqueue: vi.fn(async () => ({}) as unknown as PendingUpdate),
    now: () => FIXED_NOW,
  }
}

describe('Cretile collision: reproduce then fix', () => {
  it('REPRODUCE: old name-keyed Map collapses all 8 Cretile rows to one (G9, stock 12)', () => {
    const byName = new Map<string, InventoryItem>()
    for (const it of inventory) if (it.active) byName.set(it.skuName, it)
    expect(byName.size).toBe(1)
    const collapsed = byName.get(CRETILE_GENERIC_SKU)!
    expect(collapsed.cretileGrade).toBe(9)
    expect(collapsed.currentStock).toBe(12)
    // The old stock check for a grade-5 allocation of 13 kits ran against
    // this collapsed grade-9 stock (12) -> 13 > 12 -> WRONGLY rejected,
    // even though grade-5 actually stocks 14. That was the save failure.
    expect(alloc().kitsQty > collapsed.currentStock).toBe(true)
  })

  it('FIX: a grade-5 Cretile allocation of 13 kits now resolves G5 (stock 14) and SAVES', async () => {
    const res = await allocateKits(
      { mouId: 'MOU-STEAM-2627-CRETILE', user: { id: 'misba.m', name: 'Misba' }, allocations: [alloc()] },
      deps(),
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.created).toBe(true)
      expect(res.dispatch.allocations[0]!.productName).toBe(CRETILE_GENERIC_SKU)
    }
  })

  it('FIX: distinct grades resolve to their OWN stock (grade 9 capped at 12, grade 7 allows 50)', async () => {
    // grade 9: 13 > its real stock 12 -> correctly insufficient.
    const g9 = await allocateKits(
      { mouId: 'MOU-STEAM-2627-CRETILE', user: { id: 'misba.m', name: 'Misba' }, allocations: [alloc({ grade: 9, kitsQty: 13 })] },
      deps(),
    )
    expect(g9.ok).toBe(false)
    if (!g9.ok) expect(g9.reason).toBe('inventory-insufficient')

    // grade 7: 50 <= its real stock 53 -> allowed (old code would have
    // checked against grade-9's 12 and wrongly rejected).
    const g7 = await allocateKits(
      { mouId: 'MOU-STEAM-2627-CRETILE', user: { id: 'misba.m', name: 'Misba' }, allocations: [alloc({ grade: 7, kitsQty: 50 })] },
      deps(),
    )
    expect(g7.ok).toBe(true)
  })

  it('two Cretile grades in one submit each check their own stock (no cross-grade summing)', async () => {
    // grade 5 (14) + grade 9 (12): each within its own stock. The old
    // code summed both onto one collapsed row (12) -> 13+10 > 12 -> reject.
    const res = await allocateKits(
      {
        mouId: 'MOU-STEAM-2627-CRETILE',
        user: { id: 'misba.m', name: 'Misba' },
        allocations: [alloc({ grade: 5, kitsQty: 13 }), alloc({ grade: 9, kitsQty: 10 })],
      },
      deps(),
    )
    expect(res.ok).toBe(true)
  })
})
