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
}

function rowToProduct(r: VexProductRow): VexProduct {
  return {
    partNumber: r.part_number,
    name: r.name,
    defaultUnitPrice: r.default_unit_price === null ? null : Number(r.default_unit_price),
    active: !!r.active,
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

  async update(p: VexProduct): Promise<void> {
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
      queuedBy: 'system',
      entity: 'vexProduct',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },
}
