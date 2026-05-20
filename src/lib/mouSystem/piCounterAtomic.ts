/*
 * Per-entity atomic PI number issuer for the mou-system port.
 *
 * The Ops platform's `src/lib/githubQueue.ts` exposes `issuePiNumberAtomic()`
 * with a single-counter shape (`PiCounter`) on `src/data/pi_counter.json`.
 * The mou-system libs depend on a per-entity counter map (`PiCounterMap`)
 * so each GSTIN registration can keep its own gap-free sequence (Phase 3
 * Step 3).
 *
 * Phase 6B: the counter map is now FY-aware. Each FY has its own per-
 * entity sequence:
 *   - Current FY (company.fiscalYear): top-level `entities` block.
 *   - Prior FYs (e.g., '2526'): nested under `priorFiscalYears[fy].entities`.
 * The atomic update advances the right block based on the optional
 * fyDisplay parameter. When fyDisplay is undefined or matches the
 * current FY, the top-level block is used and behaviour is unchanged.
 */

import { atomicUpdateJson } from '@/lib/githubQueue'
import {
  company,
  currentFiscalYearCounterKey,
  formatPiNumber,
  type EntityKey,
} from './company'
import type { PiCounter, PiCounterMap } from './types'

const PI_COUNTER_PATH = 'src/data/pi_counter_map.json'

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
 * we don't accidentally re-issue numbers. Phase 6B: priorFiscalYears
 * passes through unchanged when present on the input.
 */
function migrateLegacyCounter(
  legacy: Partial<PiCounter & PiCounterMap>,
): PiCounterMap {
  if (legacy.entities && typeof legacy.entities === 'object') {
    const fiscalYear = legacy.fiscalYear ?? company.fiscalYear
    const mh = legacy.entities.MH ?? { next: 1 }
    const up = legacy.entities.UP ?? { next: 1 }
    const out: PiCounterMap = {
      fiscalYear,
      entities: { MH: { next: mh.next ?? 1 }, UP: { next: up.next ?? 1 } },
    }
    if (legacy.priorFiscalYears && typeof legacy.priorFiscalYears === 'object') {
      out.priorFiscalYears = legacy.priorFiscalYears
    }
    return out
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
 * Atomic increment of the counter for (entity, fy). Retries up to 3
 * times on 409 with jittered backoff. Returns the formatted PI number
 * (per company.json) that has not been handed out to anyone else.
 *
 * fyDisplay is the dashed form ('25-26'). When undefined or matching
 * the current company.fiscalYear, the top-level `entities` block is
 * advanced. Otherwise the `priorFiscalYears[counterKey].entities`
 * block is advanced (seeded at 1 on first use for that prior FY).
 */
export async function issuePiNumberAtomic(
  entity: EntityKey,
  fyDisplay?: string,
): Promise<{ piNumber: string; counter: PiCounterMap }> {
  const fyDisplayResolved = fyDisplay ?? company.fiscalYear
  const counterKey = fyDisplayResolved.replace('-', '')
  const isCurrentFy = counterKey === currentFiscalYearCounterKey()
  let issuedSeq = 0
  const { next } = await atomicUpdateJson<PiCounterMap>(
    PI_COUNTER_PATH,
    (current) => {
      const map = migrateLegacyCounter(
        (current ?? {}) as Partial<PiCounter & PiCounterMap>,
      )
      let updated: PiCounterMap
      if (isCurrentFy) {
        const cur = map.entities[entity]?.next ?? 1
        issuedSeq = cur
        updated = {
          ...map,
          entities: {
            ...map.entities,
            [entity]: { next: cur + 1 },
          },
        }
      } else {
        const priorAll = map.priorFiscalYears ?? {}
        const priorBlock = priorAll[counterKey] ?? {
          entities: { MH: { next: 1 }, UP: { next: 1 } },
        }
        const cur = priorBlock.entities[entity]?.next ?? 1
        issuedSeq = cur
        updated = {
          ...map,
          priorFiscalYears: {
            ...priorAll,
            [counterKey]: {
              entities: {
                ...priorBlock.entities,
                [entity]: { next: cur + 1 },
              },
            },
          },
        }
      }
      return {
        next: updated,
        commitMessage: `chore(queue): pi counter ${entity}/${counterKey} advance to ${issuedSeq + 1}`,
      }
    },
    { defaultValue: defaultCounterMap(), maxRetries: 3 },
  )
  return {
    piNumber: formatPiNumber(entity, issuedSeq, fyDisplayResolved),
    counter: next,
  }
}
