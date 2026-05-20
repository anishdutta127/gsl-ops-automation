/*
 * Gate 2 Step 8 V5: shared counter correctness.
 *
 * Programme PIs (MOU-driven) and VEX PIs share the same per-entity
 * counter at src/data/pi_counter_map.json. Both call paths route
 * through issuePiNumberAtomic. This test mocks atomicUpdateJson and
 * asserts:
 *   1. N consecutive calls under one entity yield sequential gap-free
 *      piNumbers in the MTPL/{entity}/{fy}/NNNN format.
 *   2. Calls under different entities advance their own counters
 *      independently (MH advance does not affect UP, vice versa).
 *
 * The snapshot at src/data/_snapshots/mou-system/vex_pis.json proves
 * this at runtime: VEXPI-UP-2627-001..004 carry piNumbers
 * MTPL/UP/26-27/0008..0015 with gaps where programme PIs filled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PiCounter, PiCounterMap } from './types'

vi.mock('@/lib/githubQueue', () => ({
  atomicUpdateJson: vi.fn(),
}))

import { issuePiNumberAtomic } from './piCounterAtomic'
import { atomicUpdateJson } from '@/lib/githubQueue'

const atomicMock = atomicUpdateJson as ReturnType<typeof vi.fn>

interface MutatorReturn {
  next: PiCounterMap
  commitMessage: string
}

function installCounterMock(initial: PiCounterMap): void {
  // Module-shared state lets sequential calls see each other's
  // increments, like the real atomic file would.
  let state = initial
  atomicMock.mockImplementation(
    async (
      _path: string,
      mutator: (current: PiCounterMap | null) => MutatorReturn,
    ) => {
      const result = mutator(state)
      state = result.next
      return { next: state, sha: 'mock' }
    },
  )
}

describe('issuePiNumberAtomic: shared counter (V5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('three consecutive UP calls yield sequential gap-free piNumbers', async () => {
    installCounterMock({
      fiscalYear: '2627',
      entities: { MH: { next: 1 }, UP: { next: 17 } },
    })
    const r1 = await issuePiNumberAtomic('UP')
    const r2 = await issuePiNumberAtomic('UP')
    const r3 = await issuePiNumberAtomic('UP')
    expect(r1.piNumber).toBe('MTPL/UP/26-27/0017')
    expect(r2.piNumber).toBe('MTPL/UP/26-27/0018')
    expect(r3.piNumber).toBe('MTPL/UP/26-27/0019')
    expect(r3.counter.entities.UP.next).toBe(20)
    // MH never advances during the UP sequence.
    expect(r3.counter.entities.MH.next).toBe(1)
  })

  it('MH and UP counters advance independently', async () => {
    installCounterMock({
      fiscalYear: '2627',
      entities: { MH: { next: 5 }, UP: { next: 17 } },
    })
    const mh1 = await issuePiNumberAtomic('MH')
    const up1 = await issuePiNumberAtomic('UP')
    const mh2 = await issuePiNumberAtomic('MH')
    const up2 = await issuePiNumberAtomic('UP')
    expect(mh1.piNumber).toBe('MTPL/MH/26-27/0005')
    expect(up1.piNumber).toBe('MTPL/UP/26-27/0017')
    expect(mh2.piNumber).toBe('MTPL/MH/26-27/0006')
    expect(up2.piNumber).toBe('MTPL/UP/26-27/0018')
  })

  it('mixed programme+VEX simulation: 5 calls under UP form a gap-free 17..21 sequence', async () => {
    // Simulating the Gate 2 §V5 scenario: programme PI → VEX PI →
    // programme PI → programme PI → VEX PI all under UP entity.
    // Both call paths use the same issuePiNumberAtomic.
    installCounterMock({
      fiscalYear: '2627',
      entities: { MH: { next: 1 }, UP: { next: 17 } },
    })
    const programme1 = await issuePiNumberAtomic('UP') // 0017 (programme)
    const vex1 = await issuePiNumberAtomic('UP') // 0018 (VEX)
    const programme2 = await issuePiNumberAtomic('UP') // 0019 (programme)
    const programme3 = await issuePiNumberAtomic('UP') // 0020 (programme)
    const vex2 = await issuePiNumberAtomic('UP') // 0021 (VEX)
    const seqs = [programme1, vex1, programme2, programme3, vex2].map((r) =>
      Number(r.piNumber.split('/').pop()),
    )
    expect(seqs).toEqual([17, 18, 19, 20, 21])
    // Gap-free invariant: no skips.
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1)
    }
  })

  describe('Phase 6B FY-aware issuance', () => {
    it("a FY 25-26 PI advances priorFiscalYears['2526'] not entities; output uses '25-26' display FY", async () => {
      installCounterMock({
        fiscalYear: '2627',
        entities: { MH: { next: 2 }, UP: { next: 17 } },
        priorFiscalYears: {
          '2526': { entities: { MH: { next: 27 }, UP: { next: 27 } } },
        },
      })
      const r = await issuePiNumberAtomic('UP', '25-26')
      expect(r.piNumber).toBe('MTPL/UP/25-26/0027')
      // Top-level counter must NOT have advanced.
      expect(r.counter.entities.UP.next).toBe(17)
      expect(r.counter.entities.MH.next).toBe(2)
      // priorFiscalYears['2526'].UP advances; MH stays.
      expect(r.counter.priorFiscalYears?.['2526']?.entities.UP.next).toBe(28)
      expect(r.counter.priorFiscalYears?.['2526']?.entities.MH.next).toBe(27)
    })

    it("an explicit current-FY call ('26-27') still advances the top-level entities block", async () => {
      installCounterMock({
        fiscalYear: '2627',
        entities: { MH: { next: 2 }, UP: { next: 17 } },
      })
      const r = await issuePiNumberAtomic('UP', '26-27')
      expect(r.piNumber).toBe('MTPL/UP/26-27/0017')
      expect(r.counter.entities.UP.next).toBe(18)
    })

    it('a FY 25-26 PI seeds priorFiscalYears at next=1 when the block is missing', async () => {
      installCounterMock({
        fiscalYear: '2627',
        entities: { MH: { next: 2 }, UP: { next: 17 } },
      })
      const r = await issuePiNumberAtomic('MH', '25-26')
      expect(r.piNumber).toBe('MTPL/MH/25-26/0001')
      expect(r.counter.priorFiscalYears?.['2526']?.entities.MH.next).toBe(2)
      // Top-level untouched.
      expect(r.counter.entities.MH.next).toBe(2)
    })

    it('MH and UP advance independently inside the same prior-FY block', async () => {
      installCounterMock({
        fiscalYear: '2627',
        entities: { MH: { next: 2 }, UP: { next: 17 } },
        priorFiscalYears: {
          '2526': { entities: { MH: { next: 27 }, UP: { next: 27 } } },
        },
      })
      const mh = await issuePiNumberAtomic('MH', '25-26')
      const up = await issuePiNumberAtomic('UP', '25-26')
      expect(mh.piNumber).toBe('MTPL/MH/25-26/0027')
      expect(up.piNumber).toBe('MTPL/UP/25-26/0027')
      expect(up.counter.priorFiscalYears?.['2526']?.entities.MH.next).toBe(28)
      expect(up.counter.priorFiscalYears?.['2526']?.entities.UP.next).toBe(28)
    })
  })

  it('legacy single-counter migration: old PiCounter shape carries forward on UP', async () => {
    // migrateLegacyCounter handles the pre-Phase-3 file shape.
    let state: PiCounter | PiCounterMap = {
      fiscalYear: '2627',
      next: 42,
    } as PiCounter
    atomicMock.mockImplementation(
      async (
        _path: string,
        mutator: (current: PiCounter | PiCounterMap | null) => MutatorReturn,
      ) => {
        const result = mutator(state)
        state = result.next
        return { next: result.next, sha: 'mock' }
      },
    )
    const r = await issuePiNumberAtomic('UP')
    // Legacy 'next' = 42 carries to UP entity; MH starts at 1.
    expect(r.piNumber).toBe('MTPL/UP/26-27/0042')
    expect(r.counter.entities.UP.next).toBe(43)
    expect(r.counter.entities.MH.next).toBe(1)
  })
})
