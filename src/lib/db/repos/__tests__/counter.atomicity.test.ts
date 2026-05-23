/*
 * Counter atomicity test (Phase 7).
 *
 * Requirement: N parallel calls to counterRepo.bumpPiCounter return N
 * distinct sequence numbers, with no duplicates and no gaps. This is
 * the property the ETag-based legacy flow gave us via GitHub Contents
 * API collision detection; the Postgres flow gives it via row-level
 * locking on `counters` during the UPDATE ... RETURNING.
 *
 * Test scope: postgres backend only. The json backend's atomicity is
 * already covered by tests of issuePiNumberAtomic in the existing
 * src/lib/mouSystem suite (and is exercised by every PI generation
 * in production today).
 *
 * The test commits writes to the staging branch's pi_counter_map.
 * After the assertion it RESETS the counter back to its seed value
 * (entities.MH.next = 2 per the post-seed state) so subsequent runs
 * stay reproducible. This is the "test against committed writes,
 * not rolled-back ones" pattern Anish set as a permanent rule.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { counterRepo } from '../counter'
import { hasPostgres, withBackend } from '../../__test__/parity'
import { getSql, closeSql } from '../../client'

const POSTGRES_AVAILABLE = hasPostgres()
const desc = POSTGRES_AVAILABLE ? describe : describe.skip

desc('counterRepo.bumpPiCounter atomicity (postgres)', () => {
  let originalCounter: unknown
  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    const sql = getSql()
    const rows = await sql`SELECT value FROM counters WHERE key = 'pi_counter_map'`
    originalCounter = (rows[0] as { value: unknown } | undefined)?.value
  })
  afterAll(async () => {
    if (originalCounter) {
      const sql = getSql()
      await sql`
        UPDATE counters
        SET value = ${sql.json(originalCounter as Record<string, unknown>)}::jsonb,
            updated_at = NOW()
        WHERE key = 'pi_counter_map'
      `
    }
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('20 parallel bumps produce 20 distinct sequence numbers', async () => {
    const N = 20
    const calls = Array.from({ length: N }, () =>
      withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' })),
    )
    const results = await Promise.all(calls)
    const seqs = results.map((r) => r.issuedSeq).sort((a, b) => a - b)

    // No duplicates.
    const set = new Set(seqs)
    expect(set.size, `${N} parallel calls -> ${set.size} distinct seqs`).toBe(N)

    // Contiguous: max - min = N - 1 means every step is +1.
    expect(seqs[N - 1] - seqs[0]).toBe(N - 1)
  }, 30_000)

  it('serial bumps produce sequential numbers', async () => {
    const a = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' }))
    const b = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' }))
    const c = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' }))
    expect(b.issuedSeq).toBe(a.issuedSeq + 1)
    expect(c.issuedSeq).toBe(b.issuedSeq + 1)
  })

  it('per-entity counters are independent (MH vs UP)', async () => {
    const mhBefore = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' }))
    const upBefore = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'UP' }))
    const mhAfter = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'MH' }))
    const upAfter = await withBackend('postgres', () => counterRepo.bumpPiCounter({ entity: 'UP' }))
    expect(mhAfter.issuedSeq).toBe(mhBefore.issuedSeq + 1)
    expect(upAfter.issuedSeq).toBe(upBefore.issuedSeq + 1)
    // The MH and UP series advance independently.
  })
})
