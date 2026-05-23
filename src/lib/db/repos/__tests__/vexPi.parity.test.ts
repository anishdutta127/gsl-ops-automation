/**
 * @vitest-environment node
 */

/*
 * vexPiRepo parity (Phase 7). VEX kit-order billing entity.
 *
 * Read parity: findAll, findById, findByEntityKey.
 * Write parity: lineItems JSONB + paymentLogIds JSONB round-trip.
 * The MTPL counter context (entityKey-driven counter sharing) is
 * exercised by counter.atomicity.test.ts; here we cover the storage layer.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { vexPiRepo } from '../vexPi'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'
import { closeSql } from '../../client'
import type { VexPi } from '@/lib/types'

const desc = hasPostgres() ? describe : describe.skip

desc('vexPiRepo parity', () => {
  it('findAll: same id set', async () => {
    const j = await withBackend('json', () => vexPiRepo.findAll())
    const p = await withBackend('postgres', () => vexPiRepo.findAll())
    expect(p.map((v) => v.id).sort()).toEqual(j.map((v) => v.id).sort())
  })

  it('findById: same shape on a known PI', async () => {
    const all = await withBackend('json', () => vexPiRepo.findAll())
    const target = all[0]
    if (!target) return
    const j = await withBackend('json', () => vexPiRepo.findById(target.id))
    const p = await withBackend('postgres', () => vexPiRepo.findById(target.id))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(j!.entityKey, p!.entityKey)
    parityEqual(j!.piNumber, p!.piNumber)
    parityEqual(j!.status, p!.status)
    parityEqual(j!.total, p!.total)
    parityEqual(j!.lineItems, p!.lineItems)
  })

  it('findByEntityKey(MH): same id set', async () => {
    const j = await withBackend('json', () => vexPiRepo.findByEntityKey('MH'))
    const p = await withBackend('postgres', () => vexPiRepo.findByEntityKey('MH'))
    expect(p.map((v) => v.id).sort()).toEqual(j.map((v) => v.id).sort())
  })
})

desc('vexPiRepo write-parity (postgres-only)', () => {
  let original: VexPi | null = null
  let TARGET = ''

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    const all = await vexPiRepo.findAll()
    original = all[0] ?? null
    TARGET = original?.id ?? ''
  })

  afterAll(async () => {
    if (original) await vexPiRepo.update(original)
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('lineItems + paymentLogIds JSONB round-trip exactly + audit appends', async () => {
    if (!original) throw new Error('no vex_pis seeded')
    const mutated: VexPi = {
      ...original,
      lineItems: [
        { partNumber: 'TEST-PN-1', productName: 'Test product A', quantity: 5, unitPrice: 1200, total: 6000 },
        { partNumber: 'TEST-PN-2', productName: 'Test product B', quantity: 3, unitPrice: 800, total: 2400 },
      ],
      paymentLogIds: ['PMT-LOG-TEST-1', 'PMT-LOG-TEST-2'],
      auditLog: [
        ...(original.auditLog ?? []),
        { timestamp: new Date().toISOString(), user: 'parity-test', action: 'update', notes: 'vex_pi write-parity' },
      ],
    }
    await vexPiRepo.update(mutated)
    const readBack = await vexPiRepo.findById(TARGET)
    parityEqual(readBack!.lineItems, mutated.lineItems)
    parityEqual(readBack!.paymentLogIds, mutated.paymentLogIds)
    expect(readBack!.auditLog?.length).toBe((original.auditLog?.length ?? 0) + 1)
  }, 30_000)
})
