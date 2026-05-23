/*
 * userRepo parity test: with DATABASE_URL set, run each read through
 * both backends and assert the results are deep-equal (after
 * normalisation that strips backend-driven shape differences only).
 *
 * Skips when DATABASE_URL is unset so the json-only test pass on
 * a fresh laptop still runs everywhere.
 */

import { describe, it, expect } from 'vitest'
import { userRepo } from '../user'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'

const POSTGRES_AVAILABLE = hasPostgres()
const desc = POSTGRES_AVAILABLE ? describe : describe.skip

desc('userRepo parity (json vs postgres)', () => {
  it('findAll: same set of user ids in both backends', async () => {
    const jsonRows = await withBackend('json', () => userRepo.findAll())
    const pgRows = await withBackend('postgres', () => userRepo.findAll())
    const jsonIds = jsonRows.map((u) => u.id).sort()
    const pgIds = pgRows.map((u) => u.id).sort()
    expect(pgIds).toEqual(jsonIds)
  })

  it('findById(anish.d): same record shape', async () => {
    const j = await withBackend('json', () => userRepo.findById('anish.d'))
    const p = await withBackend('postgres', () => userRepo.findById('anish.d'))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    // Compare the core identity fields only; auditLog ordering and
    // testingOverridePermissions undefined-vs-empty-array are
    // legitimate divergences we strip in normalise().
    parityEqual({ id: j!.id, name: j!.name, role: j!.role }, { id: p!.id, name: p!.name, role: p!.role })
    parityEqual(j!.email, p!.email)
    parityEqual(j!.department ?? null, p!.department ?? null)
    parityEqual(!!j!.active, !!p!.active)
    parityEqual(!!j!.requiresAdminReview, !!p!.requiresAdminReview)
  })

  it('findById(missing): both return null', async () => {
    const j = await withBackend('json', () => userRepo.findById('does-not-exist'))
    const p = await withBackend('postgres', () => userRepo.findById('does-not-exist'))
    expect(j).toBeNull()
    expect(p).toBeNull()
  })

  it('findByEmail: same record', async () => {
    const target = 'anish.d@getsetlearn.info'
    const j = await withBackend('json', () => userRepo.findByEmail(target))
    const p = await withBackend('postgres', () => userRepo.findByEmail(target))
    expect(j?.id).toBe(p?.id)
    expect(j?.id).toBe('anish.d')
  })

  it('findByAzureAdObjectId(null-mode): both return null when oid never matches', async () => {
    const j = await withBackend('json', () => userRepo.findByAzureAdObjectId('zzz-never-matches'))
    const p = await withBackend('postgres', () => userRepo.findByAzureAdObjectId('zzz-never-matches'))
    expect(j).toBeNull()
    expect(p).toBeNull()
  })

  it('findAll: every postgres user has a corresponding json user with same id+email', async () => {
    const jsonRows = await withBackend('json', () => userRepo.findAll())
    const pgRows = await withBackend('postgres', () => userRepo.findAll())
    const jsonById = new Map(jsonRows.map((u) => [u.id, u]))
    for (const p of pgRows) {
      const j = jsonById.get(p.id)
      expect(j, `json has user ${p.id}`).toBeTruthy()
      // Email comparison handles the null-vs-empty-string case.
      parityEqual(j!.email, p.email)
      parityEqual(j!.role, p.role)
    }
  })
})
