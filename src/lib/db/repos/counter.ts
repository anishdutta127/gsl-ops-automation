/*
 * Counter repo (Phase 7).
 *
 * Atomic key/value counter for pi_counter and pi_counter_map. The
 * counters table is a small (key TEXT PK, value JSONB) row store;
 * atomic increment is via `UPDATE counters SET value = ... WHERE
 * key = ... RETURNING value` under PG default isolation, which
 * holds a row-level lock for the duration of the update.
 *
 * This replaces the ETag-based atomic-write dance in
 * src/lib/mouSystem/piCounterAtomic.ts (which used the GitHub Contents
 * API's If-Match header for collision detection). Postgres gives us
 * the same property natively, with no retry loop.
 *
 * Concurrency property tested at
 * src/lib/db/repos/__tests__/counter.atomicity.test.ts.
 */

import { currentBackend } from '../backend'
import { getSql } from '../client'

export type EntityKey = 'MH' | 'UP'

interface CounterRow {
  key: string
  value: unknown
  updated_at: string
}

interface PiCounterMapValue {
  fiscalYear: string
  entities: Record<EntityKey, { next: number }>
  priorFiscalYears?: Record<string, { entities: Record<EntityKey, { next: number }> }>
}

export const counterRepo = {
  async get(key: 'pi_counter' | 'pi_counter_map'): Promise<unknown | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<CounterRow[]>`
        SELECT key, value, updated_at FROM counters WHERE key = ${key}
      `
      return rows[0]?.value ?? null
    }
    if (key === 'pi_counter') {
      const m = await import('@/data/pi_counter.json')
      return m.default
    }
    if (key === 'pi_counter_map') {
      const m = await import('@/data/pi_counter_map.json')
      return m.default
    }
    return null
  },

  /**
   * Atomic bump of the per-entity counter in pi_counter_map. Returns
   * the issued sequence number; the caller formats the piNumber
   * string. Concurrent calls serialise on the row lock so two
   * parallel callers receive distinct sequential numbers.
   *
   * In json mode this proxies to the legacy ETag-based helper
   * (issuePiNumberAtomic) which has its own collision detection.
   */
  async bumpPiCounter(args: { entity: EntityKey; fyDisplay?: string }): Promise<{
    issuedSeq: number
    fiscalYear: string
  }> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      // Resolve current fiscalYear from the row, then atomically
      // increment entities.<entity>.next via jsonb_set. Returning
      // the post-update value lets us compute the issued seq as
      // (new_next - 1).
      const rows = await sql<{ value: PiCounterMapValue; key: string }[]>`
        UPDATE counters
        SET value = jsonb_set(
          value,
          ${`{entities,${args.entity},next}`},
          to_jsonb(
            (COALESCE((value -> 'entities' -> ${args.entity} ->> 'next')::int, 1)) + 1
          )
        ),
        updated_at = NOW()
        WHERE key = 'pi_counter_map'
        RETURNING key, value
      `
      if (!rows[0]?.value) {
        throw new Error('pi_counter_map row missing in counters table')
      }
      const updated = rows[0].value
      const newNext = updated.entities?.[args.entity]?.next ?? 0
      return {
        issuedSeq: newNext - 1,
        fiscalYear: updated.fiscalYear,
      }
    }
    const { issuePiNumberAtomic } = await import('@/lib/mouSystem/piCounterAtomic')
    const r = await issuePiNumberAtomic(args.entity, args.fyDisplay)
    // Parse the issued seq from the formatted piNumber (e.g.
    // "MTPL/MH/26-27/0042" -> 42). This is brittle but lets the
    // parity test compare json + postgres outputs.
    const seq = parseInt(r.piNumber.split('/').pop() ?? '0', 10)
    return { issuedSeq: seq, fiscalYear: r.counter.fiscalYear ?? '' }
  },
}
