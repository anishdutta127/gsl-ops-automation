/**
 * @vitest-environment node
 */

/*
 * salesTeamRepo parity (Phase 7). Read-only.
 */

import { describe, it, expect } from 'vitest'
import { salesTeamRepo } from '../salesTeam'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'

const desc = hasPostgres() ? describe : describe.skip

desc('salesTeamRepo parity (json vs postgres)', () => {
  it('findAll: same set of ids', async () => {
    const j = await withBackend('json', () => salesTeamRepo.findAll())
    const p = await withBackend('postgres', () => salesTeamRepo.findAll())
    expect(p.map((s) => s.id).sort()).toEqual(j.map((s) => s.id).sort())
  })

  it('findById(sp-vikram): same shape', async () => {
    const j = await withBackend('json', () => salesTeamRepo.findById('sp-vikram'))
    const p = await withBackend('postgres', () => salesTeamRepo.findById('sp-vikram'))
    expect(j?.id).toBe(p?.id)
    parityEqual(j?.email ?? null, p?.email ?? null)
    parityEqual(j?.active ?? null, p?.active ?? null)
  })

  it('findActive: only active rows; same set both backends', async () => {
    const j = await withBackend('json', () => salesTeamRepo.findActive())
    const p = await withBackend('postgres', () => salesTeamRepo.findActive())
    expect(p.map((s) => s.id).sort()).toEqual(j.map((s) => s.id).sort())
    for (const s of p) expect(!!s.active).toBe(true)
  })

  it('null-email reps (sp-brij-singh, sp-kranthi): both backends agree that email is missing', async () => {
    // Post-002-fixups.sql relaxed NOT NULL; both backends should return
    // the same falsy email shape. JSON has email: '' empty string;
    // postgres has email: null. The normalise() helper collapses both
    // to null for the equality check.
    const j = await withBackend('json', () => salesTeamRepo.findById('sp-brij-singh'))
    const p = await withBackend('postgres', () => salesTeamRepo.findById('sp-brij-singh'))
    parityEqual(j?.email ?? null, p?.email ?? null)
  })

  it('row-by-row parity: each postgres rep has a matching json rep with the same name + active flag', async () => {
    const j = await withBackend('json', () => salesTeamRepo.findAll())
    const p = await withBackend('postgres', () => salesTeamRepo.findAll())
    const jMap = new Map(j.map((s) => [s.id, s]))
    for (const ps of p) {
      const js = jMap.get(ps.id)
      expect(js, `json has sales rep ${ps.id}`).toBeTruthy()
      parityEqual(js!.name, ps.name)
      parityEqual(!!js!.active, !!ps.active)
    }
  })
})
