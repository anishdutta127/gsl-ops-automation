/*
 * Combined parity tests for the leaf entities (no FKs):
 *   vendor, inventoryItem, vexProduct
 *
 * Read-only (findAll, findById/findByPartNumber). Same template as the
 * userRepo and schoolRepo parity tests.
 */

import { describe, it, expect } from 'vitest'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'
import { vendorRepo } from '../vendor'
import { inventoryItemRepo } from '../inventoryItem'
import { vexProductRepo } from '../vexProduct'

const desc = hasPostgres() ? describe : describe.skip

desc('vendorRepo parity', () => {
  it('findAll: same id set', async () => {
    const j = await withBackend('json', () => vendorRepo.findAll())
    const p = await withBackend('postgres', () => vendorRepo.findAll())
    expect(p.map((v) => v.id).sort()).toEqual(j.map((v) => v.id).sort())
  })
  it('findActive: same id set', async () => {
    const j = await withBackend('json', () => vendorRepo.findActive())
    const p = await withBackend('postgres', () => vendorRepo.findActive())
    expect(p.map((v) => v.id).sort()).toEqual(j.map((v) => v.id).sort())
  })
})

desc('inventoryItemRepo parity', () => {
  it('findAll: same id set', async () => {
    const j = await withBackend('json', () => inventoryItemRepo.findAll())
    const p = await withBackend('postgres', () => inventoryItemRepo.findAll())
    expect(p.map((i) => i.id).sort()).toEqual(j.map((i) => i.id).sort())
  })
  it('findById(known): same skuName + category + stock', async () => {
    // Use the first item from the json side as the lookup target.
    const all = await withBackend('json', () => inventoryItemRepo.findAll())
    const target = all[0]
    if (!target) return
    const j = await withBackend('json', () => inventoryItemRepo.findById(target.id))
    const p = await withBackend('postgres', () => inventoryItemRepo.findById(target.id))
    parityEqual(j?.skuName, p?.skuName)
    parityEqual(j?.category, p?.category)
    parityEqual(j?.currentStock, p?.currentStock)
  })
  it('findActiveByCategory(TinkRworks): same id set', async () => {
    const j = await withBackend('json', () => inventoryItemRepo.findActiveByCategory('TinkRworks'))
    const p = await withBackend('postgres', () => inventoryItemRepo.findActiveByCategory('TinkRworks'))
    expect(p.map((i) => i.id).sort()).toEqual(j.map((i) => i.id).sort())
  })
})

desc('vexProductRepo parity', () => {
  it('findAll: same partNumber set', async () => {
    const j = await withBackend('json', () => vexProductRepo.findAll())
    const p = await withBackend('postgres', () => vexProductRepo.findAll())
    expect(p.map((x) => x.partNumber).sort()).toEqual(j.map((x) => x.partNumber).sort())
  })
  it('findActive: same partNumber set', async () => {
    const j = await withBackend('json', () => vexProductRepo.findActive())
    const p = await withBackend('postgres', () => vexProductRepo.findActive())
    expect(p.map((x) => x.partNumber).sort()).toEqual(j.map((x) => x.partNumber).sort())
  })
  it('row-by-row name + price agreement', async () => {
    const j = await withBackend('json', () => vexProductRepo.findAll())
    const p = await withBackend('postgres', () => vexProductRepo.findAll())
    const jMap = new Map(j.map((x) => [x.partNumber, x]))
    for (const ps of p) {
      const js = jMap.get(ps.partNumber)
      parityEqual(js?.name, ps.name)
      parityEqual(js?.defaultUnitPrice ?? null, ps.defaultUnitPrice ?? null)
      parityEqual(!!js?.active, !!ps.active)
    }
  })
})
