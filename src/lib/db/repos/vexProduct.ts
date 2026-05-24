/*
 * VexProduct repo (Phase 7). 28-SKU VEX catalogue keyed by partNumber.
 */

import type { VexProduct } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import vexProductsJson from '@/data/vex_products.json'

const jsonProducts = vexProductsJson as unknown as VexProduct[]

interface VexProductRow {
  part_number: string
  name: string
  default_unit_price: string | number | null
  active: boolean
  version: number
}

function rowToProduct(r: VexProductRow): VexProduct {
  return {
    partNumber: r.part_number,
    name: r.name,
    defaultUnitPrice: r.default_unit_price === null ? null : Number(r.default_unit_price),
    active: !!r.active,
    version: r.version ?? 1,
  } as VexProduct
}

export const vexProductRepo = {
  async findAll(): Promise<VexProduct[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexProductRow[]>`SELECT * FROM vex_products ORDER BY part_number`
      return rows.map(rowToProduct)
    }
    return jsonProducts
  },

  async findByPartNumber(partNumber: string): Promise<VexProduct | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexProductRow[]>`
        SELECT * FROM vex_products WHERE part_number = ${partNumber}
      `
      return rows[0] ? rowToProduct(rows[0]) : null
    }
    return jsonProducts.find((p) => p.partNumber === partNumber) ?? null
  },

  async findActive(): Promise<VexProduct[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexProductRow[]>`
        SELECT * FROM vex_products WHERE active = TRUE ORDER BY part_number
      `
      return rows.map(rowToProduct)
    }
    return jsonProducts.filter((p) => p.active)
  },

  async update(p: VexProduct, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_products SET
          name = ${p.name},
          default_unit_price = ${p.defaultUnitPrice ?? null},
          active = ${!!p.active}
        WHERE part_number = ${p.partNumber}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexProduct',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },

  /**
   * P3 OCC (2026-05-24): /admin/operations/vex/products/[partNumber]/edit
   * is a real admin edit form. Two wildcard admins editing the same
   * product concurrently would otherwise clobber. Version-OCC same
   * pattern as cc_rules.
   */
  async updateOCC(
    partNumber: string,
    expectedVersion: number,
    patch: Partial<Pick<VexProduct, 'name' | 'defaultUnitPrice' | 'active'>>,
    opts?: { queuedBy?: string },
  ): Promise<{ ok: true; newVersion: number } | { ok: false; conflictVersion: number }> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const setObj: Record<string, unknown> = {}
      if (patch.name !== undefined) setObj.name = patch.name
      if (patch.defaultUnitPrice !== undefined) setObj.default_unit_price = patch.defaultUnitPrice ?? null
      if (patch.active !== undefined) setObj.active = patch.active
      // Always bump version. If no scalar fields changed (audit-only?), the
      // statement still version-checks - acceptable for OCC contract.
      const rows = await sql<{ version: number }[]>`
        UPDATE vex_products SET
          ${Object.keys(setObj).length > 0 ? sql`${sql(setObj)},` : sql``}
          version = version + 1
        WHERE part_number = ${partNumber} AND version = ${expectedVersion}
        RETURNING version
      `
      if (rows.length === 1) return { ok: true, newVersion: rows[0]!.version }
      const cur = await sql<{ version: number }[]>`
        SELECT version FROM vex_products WHERE part_number = ${partNumber}
      `
      return { ok: false, conflictVersion: cur[0]?.version ?? -1 }
    }
    // json mode: in-memory version compare + queue enqueue.
    const cur = jsonProducts.find((p) => p.partNumber === partNumber)
    if (!cur) return { ok: false, conflictVersion: -1 }
    const curVersion = cur.version ?? 1
    if (curVersion !== expectedVersion) return { ok: false, conflictVersion: curVersion }
    const merged: VexProduct = { ...cur, ...patch, version: curVersion + 1 }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexProduct',
      operation: 'update',
      payload: merged as unknown as Record<string, unknown>,
    })
    return { ok: true, newVersion: curVersion + 1 }
  },
}
