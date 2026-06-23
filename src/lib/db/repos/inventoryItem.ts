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

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' && v !== '' ? v : null
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
    lastUpdatedAt: dateStr(r.last_updated_at) ?? '',
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

  /**
   * Create a new inventory item. Mirrors vexProductRepo.create: in
   * postgres mode INSERT directly so the row is live on the next
   * request-time read; the json-mode branch enqueues for symmetry with
   * update(). Without this branch the create fell through
   * `dispatchToRepo`'s throw into the JSON queue, which the (now disabled)
   * drain cron never moves to postgres, so new items were invisible.
   */
  async create(item: InventoryItem, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO inventory_items (
          id, sku_name, category, cretile_grade, mastersheet_source_name,
          current_stock, reorder_threshold, notes, active,
          last_updated_at, last_updated_by, import_notes, audit_log
        ) VALUES (
          ${item.id}, ${item.skuName}, ${item.category},
          ${item.cretileGrade ?? null}, ${item.mastersheetSourceName ?? null},
          ${item.currentStock ?? 0}, ${item.reorderThreshold ?? null},
          ${item.notes ?? null}, ${!!item.active},
          ${item.lastUpdatedAt || null}, ${item.lastUpdatedBy || null},
          ${item.importNotes ?? null},
          ${sql.json((item.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'inventoryItem',
      operation: 'create',
      payload: item as unknown as Record<string, unknown>,
    })
  },

  async update(item: InventoryItem, opts?: { queuedBy?: string }): Promise<void> {
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
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'inventoryItem',
      operation: 'update',
      payload: item as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE inventory_items SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const cur = jsonItems.find((x) => x.id === id)
    if (!cur) return
    const updated: InventoryItem = { ...cur, auditLog: [...(cur.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'inventoryItem',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async updatePartial(
    id: string,
    patch: Partial<InventoryItem>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        skuName: 'sku_name', category: 'category',
        cretileGrade: 'cretile_grade',
        mastersheetSourceName: 'mastersheet_source_name',
        currentStock: 'current_stock',
        reorderThreshold: 'reorder_threshold', notes: 'notes',
        active: 'active', lastUpdatedAt: 'last_updated_at',
        lastUpdatedBy: 'last_updated_by', importNotes: 'import_notes',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE inventory_items SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = jsonItems.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'inventoryItem',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },

  async updateWithAudit(
    id: string,
    patch: Partial<InventoryItem>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = jsonItems.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'inventoryItem',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}
