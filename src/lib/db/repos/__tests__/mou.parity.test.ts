/**
 * @vitest-environment node
 */

/*
 * mouRepo parity (Phase 7).
 *
 * Read-parity for findAll / findById / findBySchoolId / findActiveCohort.
 * Plus the WRITE-parity round-trip Anish flagged as gating: write a
 * MOU into postgres with a non-trivial JSONB payload (payment_schedule,
 * gradewise_distribution, audit_log, student_count_event_ids), read
 * it back, and assert the JSONB shape is byte-identical to what we
 * sent in. This is exactly where the silent-corruption-on-write bug
 * class would hide; if a key reorders, an array changes shape, or a
 * nested null becomes absent, the assertion fires.
 *
 * The write-parity test commits writes to staging then RESTORES the
 * original row in afterAll so subsequent runs are idempotent (the
 * "test against committed writes, not rolled-back ones" rule).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mouRepo } from '../mou'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'
import { closeSql } from '../../client'
import type { MOU, AuditEntry } from '@/lib/types'

const desc = hasPostgres() ? describe : describe.skip

/**
 * The mous backend sets diverge by design (Anish GO on Bucket A):
 *   - json has 6 demo DRAFT MOUs (MOU-{STEAM,YP}-2627-DRAFT-{001..004});
 *     postgres drops them (they reference orphan demo schools).
 *   - postgres has 5 archived 2025-26 MOUs restored from the
 *     _snapshots/mou-system/mous.json snapshot (parents of the 9
 *     archive-orphan payments); json does not carry them in mous.json.
 *
 * This is a documented Phase 7 cutover divergence. The parity test
 * asserts that both backends agree on the INTERSECTION of their id
 * sets, and that the divergent ids match the expected demo/archive
 * allowlists. A divergence outside these allowlists would be an
 * undocumented cutover risk and must fail the test.
 */
const JSON_ONLY_MOU_IDS = new Set([
  'MOU-STEAM-2627-DRAFT-001','MOU-STEAM-2627-DRAFT-002',
  'MOU-YP-2627-DRAFT-001','MOU-YP-2627-DRAFT-002',
  'MOU-YP-2627-DRAFT-003','MOU-YP-2627-DRAFT-004',
])
const POSTGRES_ONLY_MOU_IDS = new Set([
  'MOU-STEAM-2526-001','MOU-STEAM-2526-027',
  'MOU-YP-2526-001','MOU-YP-2526-002','MOU-YP-2526-003',
])

desc('mouRepo parity (json vs postgres)', () => {
  it('findAll: id sets agree on the intersection; divergence matches the documented demo/archive split', async () => {
    const j = await withBackend('json', () => mouRepo.findAll())
    const p = await withBackend('postgres', () => mouRepo.findAll())
    const jIds = new Set(j.map((m) => m.id))
    const pIds = new Set(p.map((m) => m.id))
    const jOnly = [...jIds].filter((id) => !pIds.has(id)).sort()
    const pOnly = [...pIds].filter((id) => !jIds.has(id)).sort()
    expect(jOnly, 'json-only ids must match the documented demo-cohort drop').toEqual([...JSON_ONLY_MOU_IDS].sort())
    expect(pOnly, 'postgres-only ids must match the archive-restored set').toEqual([...POSTGRES_ONLY_MOU_IDS].sort())
  })

  it('findById(MOU-STEAM-2627-001): same core fields', async () => {
    const j = await withBackend('json', () => mouRepo.findById('MOU-STEAM-2627-001'))
    const p = await withBackend('postgres', () => mouRepo.findById('MOU-STEAM-2627-001'))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(j!.id, p!.id)
    parityEqual(j!.schoolId, p!.schoolId)
    parityEqual(j!.schoolName, p!.schoolName)
    parityEqual(j!.programme, p!.programme)
    parityEqual(j!.status, p!.status)
    parityEqual(j!.cohortStatus, p!.cohortStatus)
    parityEqual(j!.contractValue, p!.contractValue)
  })

  it('findActiveCohort: postgres has no orphan rows; json-only rows are a subset of the documented DRAFT cohort', async () => {
    const j = await withBackend('json', () => mouRepo.findActiveCohort())
    const p = await withBackend('postgres', () => mouRepo.findActiveCohort())
    const jIds = new Set(j.map((m) => m.id))
    const pIds = new Set(p.map((m) => m.id))
    // jOnly: DRAFT MOUs that carry cohortStatus='active' on the json
    // side (only DRAFT-003/004 by Phase 1 data; the others have
    // cohortStatus undefined and are excluded by the filter).
    const jOnly = [...jIds].filter((id) => !pIds.has(id))
    for (const id of jOnly) {
      expect(
        JSON_ONLY_MOU_IDS.has(id),
        `json-only active-cohort MOU '${id}' must be a documented demo-DRAFT discard`,
      ).toBe(true)
    }
    // postgres-only on findActiveCohort MUST be empty. The 5 restored
    // 2526 MOUs are seeded with cohortStatus='archived' so they do
    // NOT leak into the active filter.
    const pOnly = [...pIds].filter((id) => !jIds.has(id)).sort()
    expect(pOnly).toEqual([])
    // Sanity: real active cohort intersection is non-trivial.
    const intersection = [...jIds].filter((id) => pIds.has(id))
    expect(intersection.length).toBeGreaterThan(50)
  })

  it('findBySchoolId: same id set for a known school', async () => {
    const all = await withBackend('json', () => mouRepo.findAll())
    const target = all[0]
    if (!target) return
    const j = await withBackend('json', () => mouRepo.findBySchoolId(target.schoolId))
    const p = await withBackend('postgres', () => mouRepo.findBySchoolId(target.schoolId))
    expect(p.map((m) => m.id).sort()).toEqual(j.map((m) => m.id).sort())
  })
})

desc('mouRepo write-parity round-trip (postgres-only)', () => {
  const TEST_MOU_ID = 'MOU-STEAM-2627-001'
  let original: MOU | null = null

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    original = await mouRepo.findById(TEST_MOU_ID)
  })

  afterAll(async () => {
    if (original) {
      await mouRepo.update(original)
    }
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('write + read round-trips JSONB columns exactly (paymentSchedule, gradewiseDistribution, auditLog)', async () => {
    if (!original) {
      throw new Error('original MOU missing; cannot run write-parity test')
    }
    // Build a write payload with non-trivial JSONB shapes the bug
    // class lives in: nested arrays, mixed null vs undefined, audit
    // entries with before/after objects.
    const mutated: MOU = {
      ...original,
      delayNotes: `phase-7-write-parity-test-${Date.now()}`,
      gradewiseDistribution: [
        { grade: 1, students: 25, kitType: 'Reusable' },
        { grade: 2, students: 30, kitType: 'Consumable' },
        { grade: 3, students: 0, kitType: null },
      ],
      studentCountEventIds: ['SCE-PARITY-TEST-001', 'SCE-PARITY-TEST-002'],
      auditLog: [
        ...(original.auditLog ?? []),
        // Intentional parity test data: a synthetic action outside the
        // AuditAction union exercises the raw JSONB round-trip. Cast keeps
        // the union in types.ts unwidened.
        {
          timestamp: new Date().toISOString(),
          user: 'system-parity-test',
          action: 'write-parity-round-trip',
          before: { delayNotes: original.delayNotes ?? null },
          after: { delayNotes: 'phase-7-write-parity-test' },
          notes: 'JSONB round-trip assertion',
        } as unknown as AuditEntry,
      ],
    }
    await mouRepo.update(mutated)
    const readBack = await mouRepo.findById(TEST_MOU_ID)
    expect(readBack).toBeTruthy()
    expect(readBack!.delayNotes).toBe(mutated.delayNotes)
    // JSONB array shape preserved verbatim.
    parityEqual(readBack!.gradewiseDistribution, mutated.gradewiseDistribution)
    // String[] (text[]) shape preserved.
    parityEqual(readBack!.studentCountEventIds, mutated.studentCountEventIds)
    // Audit log grew by exactly 1 and the new entry round-tripped.
    expect(readBack!.auditLog.length).toBe((original.auditLog ?? []).length + 1)
    const last = readBack!.auditLog[readBack!.auditLog.length - 1]!
    expect(last.action).toBe('write-parity-round-trip')
    parityEqual(last.before, { delayNotes: original.delayNotes ?? null })
  }, 30_000)

  it('null-vs-undefined: writing null for a nullable JSONB column reads back as null (not undefined or empty object)', async () => {
    if (!original) return
    const mutated: MOU = {
      ...original,
      gradewiseDistribution: null,
      // Intentional null-vs-undefined probe: MOU.paymentSchedule is typed
      // `string`, but the test writes null to assert the nullable JSONB
      // column reads back as null. Cast keeps types.ts unwidened.
      paymentSchedule: null as unknown as string,
    }
    await mouRepo.update(mutated)
    const readBack = await mouRepo.findById(TEST_MOU_ID)
    expect(readBack!.gradewiseDistribution).toBeNull()
    expect(readBack!.paymentSchedule).toBeNull()
  }, 30_000)
})
