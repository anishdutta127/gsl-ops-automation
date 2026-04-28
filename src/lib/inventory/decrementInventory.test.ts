/*
 * W4-G.4 decrementInventory tests.
 *
 * Coverage per the W4-G.4 brief:
 *   - happy path flat + per-grade (single + mixed)
 *   - hard-blocks: sku-not-found, cretile-grade-not-found,
 *     insufficient-stock, sku-sunset, invalid-flat-cretile-line
 *   - aggregate-stock check (two line items decrement same SKU)
 *   - low-stock threshold crossing detection
 *   - null threshold = no trigger
 *   - pre-w4d safeguard (no-op no-decrement)
 */

import { describe, expect, it } from 'vitest'
import type { Dispatch, InventoryItem } from '@/lib/types'
import { decrementInventory } from './decrementInventory'

const NOW = new Date('2026-04-28T18:30:00.000Z')

function inv(overrides: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'skuName'>): InventoryItem {
  return {
    category: 'TinkRworks',
    cretileGrade: null,
    mastersheetSourceName: null,
    currentStock: 100,
    reorderThreshold: null,
    notes: null,
    active: true,
    lastUpdatedAt: NOW.toISOString(),
    lastUpdatedBy: 'system',
    auditLog: [],
    ...overrides,
  }
}

function dispatch(overrides: Partial<Pick<Dispatch, 'id' | 'lineItems' | 'raisedFrom'>> = {}): Pick<Dispatch, 'id' | 'lineItems' | 'raisedFrom'> {
  return {
    id: 'DSP-TEST',
    lineItems: [],
    raisedFrom: 'ops-direct',
    ...overrides,
  }
}

describe('W4-G.4 decrementInventory happy path', () => {
  it('decrements a flat lineItem against the matching InventoryItem', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 136 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 5 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updatedItems.length).toBe(1)
    expect(result.updatedItems[0]!.currentStock).toBe(131)
    expect(result.summary[0]!.decremented).toBe(5)
    expect(result.lowStockTriggers).toEqual([])
  })

  it('decrements a per-grade Cretile lineItem against multiple grade rows', () => {
    const items = [
      inv({ id: 'INV-CRETILE-G5', skuName: 'Cretile Grade-band kit', category: 'Cretile', cretileGrade: 5, currentStock: 14 }),
      inv({ id: 'INV-CRETILE-G6', skuName: 'Cretile Grade-band kit', category: 'Cretile', cretileGrade: 6, currentStock: 26 }),
    ]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{
            kind: 'per-grade',
            skuName: 'Cretile Grade-band kit',
            gradeAllocations: [
              { grade: 5, quantity: 2 },
              { grade: 6, quantity: 4 },
            ],
          }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updatedItems.length).toBe(2)
    const g5 = result.updatedItems.find((x) => x.cretileGrade === 5)!
    const g6 = result.updatedItems.find((x) => x.cretileGrade === 6)!
    expect(g5.currentStock).toBe(12)
    expect(g6.currentStock).toBe(22)
  })

  it('aggregates two flat line items for the same SKU into one decrement (10 + 5 = 15)', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 100 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [
            { kind: 'flat', skuName: 'Launchpad', quantity: 10 },
            { kind: 'flat', skuName: 'Launchpad', quantity: 5 },
          ],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updatedItems[0]!.currentStock).toBe(85)
    expect(result.summary[0]!.decremented).toBe(15)
  })
})

describe('W4-G.4 decrementInventory hard-blocks', () => {
  it('returns sku-not-found when flat skuName has no matching InventoryItem', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 50 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'NonExistentSKU', quantity: 1 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('sku-not-found')
      expect(result.offendingSkuName).toBe('NonExistentSKU')
    }
  })

  it('returns cretile-grade-not-found when grade lookup misses', () => {
    const items = [inv({ id: 'INV-CRETILE-G5', skuName: 'Cretile Grade-band kit', category: 'Cretile', cretileGrade: 5, currentStock: 14 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{
            kind: 'per-grade',
            skuName: 'Cretile Grade-band kit',
            gradeAllocations: [{ grade: 11, quantity: 2 }],
          }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('cretile-grade-not-found')
      expect(result.offendingGrade).toBe(11)
    }
  })

  it('returns insufficient-stock when requested > currentStock', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 3 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 5 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-stock')
  })

  it('returns insufficient-stock on aggregate (one line passes, both together exceed)', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 10 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [
            { kind: 'flat', skuName: 'Launchpad', quantity: 6 },
            { kind: 'flat', skuName: 'Launchpad', quantity: 7 },
          ],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-stock')
  })

  it('returns sku-sunset when InventoryItem.active is false', () => {
    const items = [inv({ id: 'INV-TINKRSYNTH', skuName: 'Tinkrsynth', currentStock: 3, active: false })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Tinkrsynth', quantity: 1 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('sku-sunset')
  })

  it('returns invalid-flat-cretile-line when a flat lineItem uses the Cretile generic SKU', () => {
    const items = [inv({ id: 'INV-CRETILE-G5', skuName: 'Cretile Grade-band kit', category: 'Cretile', cretileGrade: 5, currentStock: 14 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Cretile Grade-band kit', quantity: 1 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-flat-cretile-line')
  })
})

describe('W4-G.4 low-stock threshold crossing detection', () => {
  it('fires the trigger when stock crosses the threshold downward', () => {
    const items = [
      inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 35, reorderThreshold: 30 }),
    ]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 10 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lowStockTriggers.length).toBe(1)
    expect(result.lowStockTriggers[0]!.skuName).toBe('Launchpad')
    expect(result.lowStockTriggers[0]!.currentStock).toBe(25)
    expect(result.lowStockTriggers[0]!.threshold).toBe(30)
  })

  it('does NOT fire the trigger when stock stays above threshold', () => {
    const items = [
      inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 100, reorderThreshold: 30 }),
    ]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 10 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lowStockTriggers).toEqual([])
  })

  it('does NOT fire when reorderThreshold is null (D-028 not yet configured)', () => {
    const items = [
      inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 5, reorderThreshold: null }),
    ]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 5 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lowStockTriggers).toEqual([])
  })

  it('does NOT fire when stock was already at or below threshold (no downward crossing)', () => {
    const items = [
      inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 20, reorderThreshold: 30 }),
    ]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 5 }],
        }),
        decrementedBy: 'opshead',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lowStockTriggers).toEqual([])
  })
})

describe('W4-G.4 pre-W4-D safeguard', () => {
  it('returns no-op (empty arrays) for raisedFrom=pre-w4d dispatches', () => {
    const items = [inv({ id: 'INV-LAUNCHPAD', skuName: 'Launchpad', currentStock: 100 })]
    const result = decrementInventory(
      {
        dispatch: dispatch({
          raisedFrom: 'pre-w4d',
          lineItems: [{ kind: 'flat', skuName: 'Launchpad', quantity: 5 }],
        }),
        decrementedBy: 'system-pre-w4d',
        now: NOW,
      },
      { inventoryItems: items },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updatedItems).toEqual([])
    expect(result.summary).toEqual([])
    expect(result.lowStockTriggers).toEqual([])
    // Original items unchanged (the lib only deep-copies on apply path).
    expect(items[0]!.currentStock).toBe(100)
  })
})
