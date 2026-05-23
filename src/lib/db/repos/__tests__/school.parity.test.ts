/**
 * @vitest-environment node
 */

/*
 * schoolRepo parity (Phase 7). Read-only; skips when DATABASE_URL is
 * unset. Asserts findAll + findById + findByRegion return deep-equal
 * shape across json + postgres against the seeded staging data.
 */

import { describe, it, expect } from 'vitest'
import { schoolRepo } from '../school'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'

const desc = hasPostgres() ? describe : describe.skip

desc('schoolRepo parity (json vs postgres)', () => {
  it('findAll: same set of school ids in both backends', async () => {
    const j = await withBackend('json', () => schoolRepo.findAll())
    const p = await withBackend('postgres', () => schoolRepo.findAll())
    expect(p.map((s) => s.id).sort()).toEqual(j.map((s) => s.id).sort())
  })

  it('findById(known): same core fields', async () => {
    const id = 'SCH-BLUE_ANGELS_GLOBAL_S'
    const j = await withBackend('json', () => schoolRepo.findById(id))
    const p = await withBackend('postgres', () => schoolRepo.findById(id))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(
      { id: j!.id, name: j!.name, active: !!j!.active, region: j!.region ?? null },
      { id: p!.id, name: p!.name, active: !!p!.active, region: p!.region ?? null },
    )
    parityEqual(j!.gstNumber ?? null, p!.gstNumber ?? null)
  })

  it('findById(missing): both return null', async () => {
    const j = await withBackend('json', () => schoolRepo.findById('SCH-DOES-NOT-EXIST'))
    const p = await withBackend('postgres', () => schoolRepo.findById('SCH-DOES-NOT-EXIST'))
    expect(j).toBeNull()
    expect(p).toBeNull()
  })

  it('findByRegion(East): same set of school ids', async () => {
    const j = await withBackend('json', () => schoolRepo.findByRegion('East'))
    const p = await withBackend('postgres', () => schoolRepo.findByRegion('East'))
    const jIds = j.map((s) => s.id).sort()
    const pIds = p.map((s) => s.id).sort()
    expect(pIds).toEqual(jIds)
    // Sanity: this region has at least one school in the seeded data.
    expect(jIds.length).toBeGreaterThan(0)
  })

  it('row-by-row parity on the postgres set: each pg row has a matching json row with same name + region', async () => {
    const j = await withBackend('json', () => schoolRepo.findAll())
    const p = await withBackend('postgres', () => schoolRepo.findAll())
    const jMap = new Map(j.map((s) => [s.id, s]))
    for (const ps of p) {
      const js = jMap.get(ps.id)
      expect(js, `json has school ${ps.id}`).toBeTruthy()
      parityEqual(js!.name, ps.name)
      parityEqual(js!.region ?? null, ps.region ?? null)
    }
  })
})
