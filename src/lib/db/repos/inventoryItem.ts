/*
 * InventoryItem repo (Phase 7). SKU master for dispatch line-items.
 */

import type { InventoryItem, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import inventoryJson from '@/data/inventory_items.json'

const jsonItems = inventoryJson as unknown as InventoryItem[]

interface InventoryRow {
  id: string
  sku_name: string
  category: string
  cretile_grade: number | null
  mastersheet_source_name: string | null
  current_stock: number
  reorder_threshold: number | null
  notes: string | null
  active: boolean
  last_updated_at: string | null
  last_updated_by: string | null
  import_notes: string | null
  audit_log: AuditEntry[]
}

function rowToItem(r: InventoryRow): InventoryItem {
  return {
    id: r.id,
    skuName: r.sku_name,
    category: r.category as InventoryItem['category'],
    cretileGrade: r.cretile_grade ?? null,
    mastersheetSourceName: r.mastersheet_source_name ?? null,
    currentStock: r.current_stock ?? 0,
    reorderThreshold: r.reorder_threshold ?? null,
    notes: r.notes ?? null,
    active: !!r.active,
    lastUpdatedAt: r.last_updated_at ?? '',
    lastUpdatedBy: r.last_updated_by ?? '',
    importNotes: r.import_notes ?? undefined,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as InventoryItem
}

export const inventoryItemRepo = {
  async findAll(): Promise<InventoryItem[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<InventoryRow[]>`SELECT * FROM inventory_items ORDER BY id`
      return rows.map(rowToItem)
    }
    return jsonItems
  },

  async findById(id: string): Promise<InventoryItem | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<InventoryRow[]>`SELECT * FROM inventory_items WHERE id = ${id}`
      return rows[0] ? rowToItem(rows[0]) : null
    }
    return jsonItems.find((i) => i.id === id) ?? null
  },

  async findActiveByCategory(category: InventoryItem['category']): Promise<InventoryItem[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<InventoryRow[]>`
        SELECT * FROM inventory_items
        WHERE active = TRUE AND category = ${category}
        ORDER BY id
      `
      return rows.map(rowToItem)
    }
    return jsonItems.filter((i) => i.active && i.category === category)
  },

  async update(item: InventoryItem): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE inventory_items SET
          sku_name = ${item.skuName},
          category = ${item.category},
          cretile_grade = ${item.cretileGrade ?? null},
          mastersheet_source_name = ${item.mastersheetSourceName ?? null},
          current_stock = ${item.currentStock ?? 0},
          reorder_threshold = ${item.reorderThreshold ?? null},
          notes = ${item.notes ?? null},
          active = ${!!item.active},
          last_updated_at = ${item.lastUpdatedAt || null},
          last_updated_by = ${item.lastUpdatedBy || null},
          import_notes = ${item.importNotes ?? null},
          audit_log = ${sql.json((item.auditLog ?? []) as never)}::jsonb
        WHERE id = ${item.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'inventoryItem',
      operation: 'update',
      payload: item as unknown as Record<string, unknown>,
    })
  },
}
