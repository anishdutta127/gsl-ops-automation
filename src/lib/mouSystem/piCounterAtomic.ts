/*
 * Per-entity atomic PI number issuer for the mou-system port.
 *
 * The Ops platform's `src/lib/githubQueue.ts` exposes `issuePiNumberAtomic()`
 * with a single-counter shape (`PiCounter`). The mou-system libs depend on
 * a per-entity counter map (`PiCounterMap`) so each GSTIN registration can
 * keep its own gap-free sequence (Phase 3 Step 3).
 *
 * Rather than mutate Ops's `githubQueue.ts`, this module wraps Ops's
 * `atomicUpdateJson` to maintain a separate `pi_counter.json` file under
 * the entity-map shape used by the ported libs. Callers should import
 * `issuePiNumberAtomic` from here when porting from gsl-mou-system.
 */

import { atomicUpdateJson } from '@/lib/githubQueue'
import { company, formatPiNumber, type EntityKey } from './company'
import type { PiCounter, PiCounterMap } from './types'

const PI_COUNTER_PATH = 'src/data/pi_counter.json'

/**
 * Default counter map. Per Phase 3 Step 3 each GST entity has its own
 * sequential, gap-free counter; the MH counter is shared across YP,
 * Harvard and any VEX PIs raised under MH, and the UP counter is shared
 * across STEAM, Robotics and any VEX PIs raised under UP.
 */
function defaultCounterMap(): PiCounterMap {
  return {
    fiscalYear: company.fiscalYear,
    entities: {
      MH: { next: 1 },
      UP: { next: 1 },
    },
  }
}

/**
 * Migrate a legacy PiCounter (single-counter shape from before Phase 3)
 * to the new map shape. Preserves whatever sequence had been issued so
 * we don't accidentally re-issue numbers.
 */
function migrateLegacyCounter(legacy: Partial<PiCounter & PiCounterMap>): PiCounterMap {
  if (legacy.entities && typeof legacy.entities === 'object') {
    const fiscalYear = legacy.fiscalYear ?? company.fiscalYear
    const mh = legacy.entities.MH ?? { next: 1 }
    const up = legacy.entities.UP ?? { next: 1 }
    return { fiscalYear, entities: { MH: { next: mh.next ?? 1 }, UP: { next: up.next ?? 1 } } }
  }
  // Old single-counter file: park the value on UP (the only place that
  // had been issuing numbers historically) and start MH at 1.
  const carry = typeof legacy.next === 'number' ? legacy.next : 1
  return {
    fiscalYear: company.fiscalYear,
    entities: { MH: { next: 1 }, UP: { next: carry } },
  }
}

/**
 * Atomic increment of pi_counter.entities[<entity>].next. Retries up to
 * 3 times on 409 with jittered backoff. Returns the formatted PI number
 * (per company.json) that has not been handed out to anyone else.
 */
export async function issuePiNumberAtomic(
  entity: EntityKey,
): Promise<{ piNumber: string; counter: PiCounterMap }> {
  let issuedSeq = 0
  const { next } = await atomicUpdateJson<PiCounterMap>(
    PI_COUNTER_PATH,
    (current) => {
      const map = migrateLegacyCounter(
        (current ?? {}) as Partial<PiCounter & PiCounterMap>,
      )
      const cur = map.entities[entity]?.next ?? 1
      issuedSeq = cur
      const updated: PiCounterMap = {
        ...map,
        entities: {
          ...map.entities,
          [entity]: { next: cur + 1 },
        },
      }
      return {
        next: updated,
        commitMessage: `chore(queue): pi counter ${entity} advance to ${cur + 1}`,
      }
    },
    { defaultValue: defaultCounterMap(), maxRetries: 3 },
  )
  return { piNumber: formatPiNumber(entity, issuedSeq), counter: next }
}
