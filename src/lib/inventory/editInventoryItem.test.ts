/*
 * editInventoryItem unit tests (W4-G.5).
 */

import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem, PendingUpdate, User } from '@/lib/types'
import {
  editInventoryItem,
  type EditInventoryItemDeps,
} from './editInventoryItem'

const FIXED_TS = '2026-04-29T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@gsl.test`, role,
    testingOverride: false, active: true, passwordHash: '',
    createdAt: '', auditLog: [],
  }
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-X', skuName: 'Tinkrpython',
    category: 'TinkRworks', cretileGrade: null,
    mastersheetSourceName: 'Tinkrpython', currentStock: 100,
    reorderThreshold: null, notes: null, active: true,
    lastUpdatedAt: FIXED_TS, lastUpdatedBy: 'system-test',
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  items?: InventoryItem[]
  users?: User[]
}): { deps: EditInventoryItemDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      inventoryItems: opts.items ?? [item()],
      users: opts.users ?? [user('OpsHead', 'misba.m'), user('Admin', 'anish.d')],
      enqueue: enqueue as unknown as EditInventoryItemDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editInventoryItem', () => {
  it('happy path: OpsHead edits currentStock; audit action inventory-stock-edited', async () => {
    const { deps, calls } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { currentStock: 80 } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.currentStock).toBe(80)
    expect(result.auditAction).toBe('inventory-stock-edited')
    const audit = result.item.auditLog[0]!
    expect(audit.action).toBe('inventory-stock-edited')
    expect(audit.before).toMatchObject({ currentStock: 100 })
    expect(audit.after).toMatchObject({ currentStock: 80 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'inventoryItem', operation: 'update' })
  })

  it('threshold-only edit emits inventory-threshold-edited', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { reorderThreshold: 25 } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.auditAction).toBe('inventory-threshold-edited')
    expect(result.item.reorderThreshold).toBe(25)
  })

  it('threshold can be cleared by passing null', async () => {
    const { deps } = makeDeps({
      items: [item({ reorderThreshold: 30 })],
    })
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { reorderThreshold: null } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.reorderThreshold).toBeNull()
    expect(result.auditAction).toBe('inventory-threshold-edited')
  })

  it('mixed stock + threshold edit uses inventory-stock-edited umbrella', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      {
        itemId: 'INV-X', editedBy: 'misba.m',
        patch: { currentStock: 50, reorderThreshold: 20 },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.auditAction).toBe('inventory-stock-edited')
    expect(result.item.auditLog[0]!.before).toMatchObject({ currentStock: 100, reorderThreshold: null })
    expect(result.item.auditLog[0]!.after).toMatchObject({ currentStock: 50, reorderThreshold: 20 })
  })

  it('SalesRep is rejected (lacks inventory:edit)', async () => {
    const { deps } = makeDeps({
      users: [user('SalesRep', 'pratik.d')],
    })
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'pratik.d', patch: { currentStock: 80 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects unknown-user', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'ghost', patch: { currentStock: 80 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects item-not-found', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-NOPE', editedBy: 'misba.m', patch: { currentStock: 80 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'item-not-found' })
  })

  it('rejects invalid-stock (negative)', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { currentStock: -5 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-stock' })
  })

  it('rejects invalid-stock (non-integer)', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { currentStock: 12.5 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-stock' })
  })

  it('rejects invalid-threshold (negative)', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { reorderThreshold: -1 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-threshold' })
  })

  it('rejects no-change when patch values match current state', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { currentStock: 100, active: true } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-change' })
  })

  it('reactivating a sunset SKU sets active=true and audits', async () => {
    const { deps } = makeDeps({
      items: [item({ active: false })],
    })
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { active: true } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.active).toBe(true)
    expect(result.item.auditLog[0]!.before).toMatchObject({ active: false })
    expect(result.item.auditLog[0]!.after).toMatchObject({ active: true })
  })

  it('notes can be cleared by passing empty string (normalised to null)', async () => {
    const { deps } = makeDeps({
      items: [item({ notes: 'pending count' })],
    })
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { notes: '   ' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.notes).toBeNull()
  })

  it('lastUpdatedAt + lastUpdatedBy update on every successful edit', async () => {
    const { deps } = makeDeps({})
    const result = await editInventoryItem(
      { itemId: 'INV-X', editedBy: 'misba.m', patch: { currentStock: 90 } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.lastUpdatedAt).toBe(FIXED_TS)
    expect(result.item.lastUpdatedBy).toBe('misba.m')
  })
})
