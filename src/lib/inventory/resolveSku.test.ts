import { describe, expect, it } from 'vitest'
import type { InventoryItem } from '@/lib/types'
import { resolveInventoryItem, CRETILE_GENERIC_SKU } from './resolveSku'

function item(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'INV-X',
    skuName: 'X',
    category: 'TinkRworks',
    cretileGrade: null,
    mastersheetSourceName: null,
    currentStock: 10,
    reorderThreshold: null,
    notes: null,
    active: true,
    lastUpdatedAt: '2026-04-01T00:00:00.000Z',
    lastUpdatedBy: 'system',
    auditLog: [],
    ...over,
  }
}

// Mirrors the real catalogue collision: 8 Cretile rows, identical skuName,
// distinct cretileGrade + stock.
const CRETILE = [3, 4, 5, 6, 7, 8, 9, 10].map((g) =>
  item({
    id: `INV-CRETILE-G${g}`,
    skuName: CRETILE_GENERIC_SKU,
    category: 'Cretile',
    cretileGrade: g,
    currentStock: g * 2, // distinct per grade
  }),
)
const TINKR = [
  item({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', category: 'TinkRworks', currentStock: 136 }),
  item({ id: 'INV-SMART-LAMP', skuName: 'Smart Lamp', category: 'TinkRworks', currentStock: 344 }),
]
const INVENTORY = [...CRETILE, ...TINKR]

describe('resolveInventoryItem (unified SKU resolution)', () => {
  it('resolves a grade-agnostic TinkRworks SKU by skuName', () => {
    const r = resolveInventoryItem(INVENTORY, { productName: 'Smart Lamp', grade: 7 })
    expect(r?.id).toBe('INV-SMART-LAMP')
  })

  it('resolves each Cretile grade to ITS OWN row by (category, cretileGrade)', () => {
    // The collision case: all 8 share skuName CRETILE_GENERIC_SKU. The
    // resolver must use the grade, never the name.
    expect(resolveInventoryItem(INVENTORY, { productName: CRETILE_GENERIC_SKU, grade: 5 })?.id)
      .toBe('INV-CRETILE-G5')
    expect(resolveInventoryItem(INVENTORY, { productName: CRETILE_GENERIC_SKU, grade: 9 })?.id)
      .toBe('INV-CRETILE-G9')
    expect(resolveInventoryItem(INVENTORY, { productName: CRETILE_GENERIC_SKU, grade: 10 })?.id)
      .toBe('INV-CRETILE-G10')
  })

  it('returns null for a Cretile grade with no stocked kit (e.g. G1/G2 catalogue gap)', () => {
    expect(resolveInventoryItem(INVENTORY, { productName: CRETILE_GENERIC_SKU, grade: 1 })).toBeNull()
    expect(resolveInventoryItem(INVENTORY, { productName: CRETILE_GENERIC_SKU, grade: null })).toBeNull()
  })

  it('returns null for an unknown SKU', () => {
    expect(resolveInventoryItem(INVENTORY, { productName: 'Nonexistent', grade: 5 })).toBeNull()
  })

  it('contrasts with the OLD name-keyed Map: all 8 Cretile rows collapse to one', () => {
    const byName = new Map<string, InventoryItem>()
    for (const it of INVENTORY) byName.set(it.skuName, it)
    // The bug, documented: the generic Cretile name maps to a SINGLE entry
    // (last-wins), so a grade-5 allocation was checked against whatever
    // grade happened to be inserted last - never reliably G5.
    expect([...byName.keys()].filter((k) => k === CRETILE_GENERIC_SKU)).toHaveLength(1)
    expect(byName.get(CRETILE_GENERIC_SKU)?.id).toBe('INV-CRETILE-G10') // last in array
  })
})
