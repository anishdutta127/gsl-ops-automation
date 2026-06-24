/*
 * Product registry repo (Phase 1.4). Admin-managed product taxonomy seeded
 * from the FY26-27 finance "Summary 26-27" sheet (migration 014). Postgres is
 * the source of truth in prod; json-mode reads the seeded src/data/products.json.
 *
 * `legacyProgrammes` lets an existing MOU's mous.programme resolve to a product
 * (see resolveProduct in src/lib/products/resolveProduct.ts).
 */

import type { Product, ProductKind, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import productsJson from '@/data/products.json'

const jsonProducts = productsJson as unknown as Product[]

interface ProductRow {
  id: string
  name: string
  active: boolean
  sort_order: number
  legacy_programmes: string[] | null
  kind: string | null
  parent_id: string | null
  created_at: string | Date | null
  created_by: string | null
  audit_log: AuditEntry[] | null
}

function rowToProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    active: !!r.active,
    sortOrder: r.sort_order ?? 0,
    legacyProgrammes: Array.isArray(r.legacy_programmes) ? r.legacy_programmes : [],
    kind: (r.kind === 'project' ? 'project' : 'per-student') as ProductKind,
    parentId: r.parent_id ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at ?? ''),
    createdBy: r.created_by ?? null,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  }
}

export const productRepo = {
  async findAll(): Promise<Product[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<ProductRow[]>`SELECT * FROM products ORDER BY sort_order, name`
      return rows.map(rowToProduct)
    }
    return jsonProducts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async findActive(): Promise<Product[]> {
    return (await this.findAll()).filter((p) => p.active)
  },

  async findById(id: string): Promise<Product | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<ProductRow[]>`SELECT * FROM products WHERE id = ${id}`
      return rows[0] ? rowToProduct(rows[0]) : null
    }
    return jsonProducts.find((p) => p.id === id) ?? null
  },

  async create(p: Product, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      // created_at omitted -> DEFAULT NOW() (NOT NULL column).
      await sql`
        INSERT INTO products (id, name, active, sort_order, legacy_programmes, kind, parent_id, created_by, audit_log)
        VALUES (
          ${p.id}, ${p.name}, ${p.active ?? true}, ${p.sortOrder ?? 0},
          ${p.legacyProgrammes ?? []}, ${p.kind ?? 'per-student'}, ${p.parentId ?? null}, ${p.createdBy ?? null},
          ${sql.json((p.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'product',
      operation: 'create',
      payload: p as unknown as Record<string, unknown>,
    })
  },

  async update(p: Product, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE products SET
          name = ${p.name},
          active = ${!!p.active},
          sort_order = ${p.sortOrder ?? 0},
          legacy_programmes = ${p.legacyProgrammes ?? []},
          kind = ${p.kind ?? 'per-student'},
          parent_id = ${p.parentId ?? null},
          audit_log = ${sql.json((p.auditLog ?? []) as never)}::jsonb
        WHERE id = ${p.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'product',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },
}
