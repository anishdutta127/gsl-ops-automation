/*
 * Gate 2 Step 8 V5: VEX PI id format regression test.
 *
 * Pins the rule that VEX PI ids are sequential PER ENTITY across the
 * fiscal year and DO NOT follow the shared programme+VEX counter at
 * pi_counter_map.json. Snapshot at src/data/_snapshots/mou-system/
 * vex_pis.json shows VEXPI-UP-2627-001..004 with piNumbers
 * MTPL/UP/26-27/0008,0009,0010,0015 -- the gap proves programme PIs
 * filled 0011..0014 while the VEX seq advanced 003 -> 004.
 *
 * The sub-agent's first pass used counterSeq directly in the id; this
 * test asserts the post-fix nextVexPiSeq logic agrees with the snapshot.
 *
 * Cross-snapshot consistency: also asserts that the dispatch id format
 * VEXD-{entity}-{fy}-NNN matches snapshot for the same reason
 * (dispatch route's nextDispatchSeq was already correct in Step 7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vexPisJson from '@/data/vex_pis.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))
vi.mock('@/lib/mouSystem/piCounterAtomic', () => ({
  issuePiNumberAtomic: vi.fn(),
}))

const vexPis = vexPisJson as unknown as VexPi[]
const vexDispatches = vexDispatchesJson as unknown as VexDispatch[]

describe('VEX PI id format: VEX-OWN sequential per entity (Gate 2 §V5)', () => {
  it('every VEX PI id matches /^VEXPI-(MH|UP)-\\d{4}-\\d{3}$/', () => {
    expect(vexPis.length).toBeGreaterThan(0)
    for (const pi of vexPis) {
      expect(pi.id).toMatch(/^VEXPI-(MH|UP)-\d{4}-\d{3}$/)
    }
  })

  it('VEX seq starts at 001 per entity and is gap-free per entity', () => {
    const byEntity = new Map<string, number[]>()
    for (const pi of vexPis) {
      const parts = pi.id.split('-')
      const entity = parts[1]
      const seq = Number(parts[3])
      if (!byEntity.has(entity)) byEntity.set(entity, [])
      byEntity.get(entity)!.push(seq)
    }
    for (const [entity, seqs] of byEntity) {
      seqs.sort((a, b) => a - b)
      expect(seqs[0], `${entity} first seq`).toBe(1)
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i], `${entity} seq[${i}]`).toBe(seqs[i - 1] + 1)
      }
    }
  })

  it('VEX piNumber sequence has gaps proving it is the shared counter', () => {
    // UP entity records: piNumber 0008, 0009, 0010, 0015 -- the gap 0011-0014
    // is the proof that programme PIs filled while VEX seq advanced.
    const upPiNumbers = vexPis
      .filter((p) => p.entityKey === 'UP')
      .map((p) => Number(p.piNumber.split('/').pop()))
      .sort((a, b) => a - b)
    expect(upPiNumbers).toEqual([8, 9, 10, 15])
    // VEX-own seqs for the same 4 records are gap-free 001..004.
    const upVexSeqs = vexPis
      .filter((p) => p.entityKey === 'UP')
      .map((p) => Number(p.id.split('-').pop()))
      .sort((a, b) => a - b)
    expect(upVexSeqs).toEqual([1, 2, 3, 4])
  })

  it('VEX dispatch id format VEXD-{entity}-{fy}-NNN matches snapshot', () => {
    expect(vexDispatches.length).toBeGreaterThan(0)
    for (const d of vexDispatches) {
      expect(d.id).toMatch(/^VEXD-(MH|UP)-\d{4}-\d{3}$/)
    }
    // UP entity dispatch seqs 001..004 gap-free (4 dispatches in snapshot).
    const upDispatchSeqs = vexDispatches
      .filter((d) => d.id.includes('-UP-'))
      .map((d) => Number(d.id.split('-').pop()))
      .sort((a, b) => a - b)
    expect(upDispatchSeqs).toEqual([1, 2, 3, 4])
  })

  it('source-level: route file contains the nextVexPiSeq scan-existing helper', async () => {
    // Defence against accidental revert to counterSeq-aligned ids.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'route.ts'),
      'utf-8',
    )
    expect(src).toContain('function nextVexPiSeq')
    expect(src).toContain('makeVexPiId(entityKey, vexSeq)')
    expect(src).not.toContain('makeVexPiId(entityKey, counterSeq)')
  })
})

describe('POST /api/operations/vex/pi/create: parallel-build lock (V5)', () => {
  const SAVE_LOCK = process.env.PI_PARALLEL_BUILD_LOCK

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (SAVE_LOCK === undefined) {
      delete process.env.PI_PARALLEL_BUILD_LOCK
    } else {
      process.env.PI_PARALLEL_BUILD_LOCK = SAVE_LOCK
    }
  })

  async function callRoute(): Promise<Response> {
    const { POST } = await import('./route')
    return POST(
      new Request('http://localhost/api/operations/vex/pi/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityKey: 'MH', lineItems: [] }),
      }),
    )
  }

  it('returns 503 with lock copy when env unset (fail-closed default)', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const res = await callRoute()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('parallel-build-locked')
    expect(body.message).toContain('PI generation is locked')
    expect(body.message).toContain('Gate 5 cutover')
  })

  it("returns 503 when lock env is 'true' (explicit lock-on)", async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = 'true'
    const res = await callRoute()
    expect(res.status).toBe(503)
  })

  it("activates route at cutover when PI_PARALLEL_BUILD_LOCK=false", async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = 'false'
    const { getCurrentUser } = await import('@/lib/auth/session')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await callRoute()
    // Lock is OFF: now we get the next gate (auth), which fails with 401.
    expect(res.status).toBe(401)
  })

  it('lock check fires BEFORE auth (no session leak via 401 vs 503 timing)', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const { getCurrentUser } = await import('@/lib/auth/session')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await callRoute()
    // 503 lock, NOT 401 auth. Lock is the first gate.
    expect(res.status).toBe(503)
  })
})
