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

import { describe, expect, it } from 'vitest'
import vexPisJson from '@/data/vex_pis.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'

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
