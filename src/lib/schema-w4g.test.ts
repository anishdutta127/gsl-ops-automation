/*
 * W4-G.1 schema sanity. Verifies the InventoryItem entity shape
 * compiles, the seed JSON is a well-formed empty array, the new
 * permission Actions are wired into the matrix, the new
 * NotificationKind is queue-ready, and the new PendingUpdateEntity
 * value reaches the queue.
 *
 * Heavier behavioural tests land in:
 *   src/lib/inventory/decrementInventory.test.ts (W4-G.4)
 *   src/lib/inventory/<edit>.test.ts             (W4-G.6 form lib)
 *   scripts/w4g-inventory-import-* (W4-G.2 + W4-G.3)
 */

import { describe, expect, it } from 'vitest'
import type {
  InventoryCategory,
  InventoryItem,
  NotificationKind,
  PendingUpdateEntity,
} from '@/lib/types'
import inventoryItemsJson from '@/data/inventory_items.json'
import { canPerform } from '@/lib/auth/permissions'
import { PAYLOAD_VALIDATORS } from '@/lib/notifications/payload_contracts'

describe('W4-G.1 InventoryItem schema', () => {
  it('inventory_items.json seeds as an empty array; W4-G.3 backfill populates it', () => {
    const rows = inventoryItemsJson as unknown as InventoryItem[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBe(0)
  })

  it('InventoryItem accepts a Cretile per-grade row shape', () => {
    const sample: InventoryItem = {
      id: 'INV-CRETILE-G5',
      skuName: 'Cretile Grade-band kit',
      category: 'Cretile',
      cretileGrade: 5,
      mastersheetSourceName: 'Grade 5 Kit',
      currentStock: 14,
      reorderThreshold: null,
      notes: null,
      active: true,
      lastUpdatedAt: '2026-04-28T16:00:00.000Z',
      lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
    }
    expect(sample.category).toBe<InventoryCategory>('Cretile')
    expect(sample.cretileGrade).toBe(5)
  })

  it('InventoryItem accepts a TinkRworks flat-SKU row shape', () => {
    const sample: InventoryItem = {
      id: 'INV-TINKRPYTHON',
      skuName: 'Tinkrpython',
      category: 'TinkRworks',
      cretileGrade: null,
      mastersheetSourceName: 'STEAM:- TinkRpy Project Kit (Reusable)',
      currentStock: 923,
      reorderThreshold: null,
      notes: null,
      active: true,
      lastUpdatedAt: '2026-04-28T16:00:00.000Z',
      lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
    }
    expect(sample.category).toBe<InventoryCategory>('TinkRworks')
    expect(sample.cretileGrade).toBeNull()
  })
})

describe('W4-G.1 permission Actions wired into the matrix', () => {
  function user(
    id: string,
    role: 'Admin' | 'OpsHead' | 'OpsEmployee' | 'Finance' | 'SalesRep',
  ): import('@/lib/types').User {
    return {
      id,
      name: id,
      email: `${id}@getsetlearn.info`,
      role,
      testingOverride: false,
      active: true,
      passwordHash: 'bcrypt:placeholder',
      createdAt: '2026-04-28T00:00:00Z',
      auditLog: [],
    }
  }

  it('Admin wildcard grants both inventory actions', () => {
    const admin = user('anish.d', 'Admin')
    expect(canPerform(admin, 'inventory:view')).toBe(true)
    expect(canPerform(admin, 'inventory:edit')).toBe(true)
  })

  it('OpsHead can edit inventory; OpsEmployee gets view-only', () => {
    const opsHead = user('opshead', 'OpsHead')
    expect(canPerform(opsHead, 'inventory:view')).toBe(true)
    expect(canPerform(opsHead, 'inventory:edit')).toBe(true)

    const opsEmp = user('test.ops', 'OpsEmployee')
    expect(canPerform(opsEmp, 'inventory:view')).toBe(true)
    expect(canPerform(opsEmp, 'inventory:edit')).toBe(false)
  })

  it('SalesRep + Finance get view-only access for cross-team awareness', () => {
    expect(canPerform(user('rep', 'SalesRep'), 'inventory:view')).toBe(true)
    expect(canPerform(user('rep', 'SalesRep'), 'inventory:edit')).toBe(false)
    expect(canPerform(user('fin', 'Finance'), 'inventory:view')).toBe(true)
    expect(canPerform(user('fin', 'Finance'), 'inventory:edit')).toBe(false)
  })
})

describe('W4-G.1 inventory-low-stock NotificationKind + payload contract', () => {
  it('inventory-low-stock is a recognised NotificationKind', () => {
    const kind: NotificationKind = 'inventory-low-stock'
    expect(kind).toBe('inventory-low-stock')
  })

  it('payload validator rejects missing fields', () => {
    const validator = PAYLOAD_VALIDATORS['inventory-low-stock']
    const result = validator({ skuName: 'Tinkrpython' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('inventoryItemId')
      expect(result.missing).toContain('currentStock')
      expect(result.missing).toContain('threshold')
    }
  })

  it('payload validator accepts a complete payload', () => {
    const validator = PAYLOAD_VALIDATORS['inventory-low-stock']
    const result = validator({
      inventoryItemId: 'INV-TINKRPYTHON',
      skuName: 'Tinkrpython',
      currentStock: 5,
      threshold: 30,
      dispatchId: 'DSP-MOU-X-i1',
    })
    expect(result.ok).toBe(true)
  })
})

describe('W4-G.1 PendingUpdateEntity reaches the new entity', () => {
  it('inventoryItem is a valid queue entity value', () => {
    const entity: PendingUpdateEntity = 'inventoryItem'
    expect(typeof entity).toBe('string')
  })
})
