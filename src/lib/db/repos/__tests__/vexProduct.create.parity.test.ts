/**
 * @vitest-environment node
 */

/*
 * vexProductRepo.create postgres integration (gate-sku-fix, 2026-06-22).
 *
 * The reported bug: a new VEX product saved but never appeared in the SKU
 * master. Root cause: postgres mode had no create path (dispatchToRepo threw
 * on vexProduct create; vexProductRepo had no create() at all), so the write
 * fell back to the JSON queue that postgres production never reads.
 *
 * This test exercises the real INSERT against the configured DB, reads it
 * back through the same request-time read path the SKU master uses
 * (findAll / findByPartNumber), then cleans up. It is gated on DATABASE_URL
 * (hasPostgres) and SKIPS where no DB is configured. vitest does not load
 * .env.local, so a plain local `vitest` run skips this (no accidental writes
 * to the URL in .env.local). Uses a sentinel partNumber that cannot collide
 * with a real SKU and always DELETEs it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vexProductRepo } from '../vexProduct'
import { hasPostgres } from '../../__test__/parity'
import { closeSql, getSql } from '../../client'
import type { VexProduct } from '@/lib/types'

const SENTINEL = 'ZZZ-SKUFIX-TEST'
const desc = hasPostgres() ? describe : describe.skip

async function deleteSentinel(): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM vex_products WHERE part_number = ${SENTINEL}`
}

desc('vexProductRepo.create (postgres)', () => {
  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    await deleteSentinel()
  })

  afterAll(async () => {
    await deleteSentinel()
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('INSERTs a new SKU and it reads back through findByPartNumber + findAll', async () => {
    const product: VexProduct = {
      partNumber: SENTINEL,
      name: 'SKU fix integration test product',
      defaultUnitPrice: 4500,
      active: true,
    } as VexProduct

    await vexProductRepo.create(product, { queuedBy: 'gate-sku-fix-test' })

    const readBack = await vexProductRepo.findByPartNumber(SENTINEL)
    expect(readBack).toBeTruthy()
    expect(readBack!.name).toBe(product.name)
    expect(readBack!.defaultUnitPrice).toBe(4500)
    expect(readBack!.active).toBe(true)
    expect(readBack!.version).toBe(1)

    // The SKU master list read path (findAll) must include the new row
    // immediately, without any rebuild.
    const all = await vexProductRepo.findAll()
    expect(all.some((p) => p.partNumber === SENTINEL)).toBe(true)
  }, 30_000)
})
