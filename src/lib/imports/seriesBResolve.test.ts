/*
 * Phase 6C Series B entity resolution test.
 *
 * Per the brief: 1 test for Series B entity resolution. Runs the
 * resolver against the production payments + mous + company.json and
 * asserts the seed lands on the right entity per programmeRouting.
 */

import { describe, expect, it } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import payments from '@/data/payments.json'
import mous from '@/data/mous.json'
import company from '@/lib/mouSystem/company.json'
import { resolveSeriesBSeed, type EntityKey } from './seriesBResolve'

const allPayments = payments as unknown as Payment[]
const allMous = mous as unknown as MOU[]
const routing = company.programmeRouting as Record<string, EntityKey>

describe('resolveSeriesBSeed (Phase 6C)', () => {
  it('routes every Series B PI to MH (YP programme -> MH) and seeds MH/2526 past the max seq', () => {
    const seed = resolveSeriesBSeed({
      payments: allPayments,
      mous: allMous,
      programmeRouting: routing,
    })
    // Every Series B entry should resolve to MH; none to UP.
    const mh = seed.resolutions.filter((r) => r.resolvedEntity === 'MH')
    const up = seed.resolutions.filter((r) => r.resolvedEntity === 'UP')
    const none = seed.resolutions.filter((r) => r.resolvedEntity === null)
    expect(mh.length).toBeGreaterThan(0)
    expect(up.length).toBe(0)
    expect(none.length).toBe(0)
    // MH max seq is 26 in the production data (Apple Global School,
    // MOU-YP-2526-024); UP stays at the clean-slate seed of 1.
    expect(seed.MH.next).toBe(27)
    expect(seed.UP.next).toBe(1)
  })

  it('falls back to orphan-MOU programme inference from the mouId prefix', () => {
    const seed = resolveSeriesBSeed({
      payments: [
        {
          id: 'MOU-YP-2526-999-i1',
          mouId: 'MOU-YP-2526-999',
          schoolName: 'Test',
          piNumber: 'MTPL/25-26/50',
        } as Payment,
      ],
      mous: [],
      programmeRouting: routing,
    })
    expect(seed.resolutions[0]?.resolvedEntity).toBe('MH')
    expect(seed.resolutions[0]?.reason).toContain('inferred programme from id prefix = Young Pioneers')
    expect(seed.MH.next).toBe(51)
    expect(seed.UP.next).toBe(1)
  })

  it('mixes MH and UP cleanly if Series B PIs sit on both YP and STEAM MOUs', () => {
    const seed = resolveSeriesBSeed({
      payments: [
        { id: 'A', mouId: 'MOU-YP-2526-001', piNumber: 'MTPL/25-26/3', schoolName: 'A' } as Payment,
        { id: 'B', mouId: 'MOU-STEAM-2526-001', piNumber: 'MTPL/25-26/5', schoolName: 'B' } as Payment,
      ],
      mous: [
        { id: 'MOU-YP-2526-001', programme: 'Young Pioneers' } as MOU,
        { id: 'MOU-STEAM-2526-001', programme: 'STEAM' } as MOU,
      ],
      programmeRouting: routing,
    })
    expect(seed.MH.next).toBe(4)
    expect(seed.UP.next).toBe(6)
  })
})
