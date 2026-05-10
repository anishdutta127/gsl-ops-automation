/*
 * Gate 2 Step 4: imported-data lifecycle replay.
 *
 * Picks 5 real MOUs from the gsl-mou-system snapshot at
 * src/data/_snapshots/mou-system/mous.json and walks them through the
 * recalc + PI + payment flow on the Ops mouSystem-namespace libs.
 * Asserts identical totals + identical PI prefix routing vs the
 * canonical rules. Because the libs are verbatim ports from
 * gsl-mou-system, identical inputs produce identical outputs; this
 * test pins the integration assertion against actual production data
 * (rather than synthetic fixtures from lifecycleReplay.test.ts) so any
 * drift surfaces loudly.
 *
 * Coverage spans the five common payment schedules in the snapshot:
 *   1. 540-student STEAM, 25-25-25-25 quarterly             (Rs 16,91,766)
 *   2. 900-student STEAM, 50-50 half-yearly                 (Rs 23,05,600)
 *   3. 385-student STEAM, 100% advance                      (Rs 11,55,750)
 *   4. 350-student STEAM, 50-50 half-yearly (round numbers) (Rs 8,40,000)
 *   5. 900-student STEAM, 25-25-25-25 quarterly             (Rs 21,12,000)
 */

import { describe, expect, it } from 'vitest'
import importedMous from '@/data/_snapshots/mou-system/mous.json'
import importedSchools from '@/data/_snapshots/mou-system/schools.json'
import { buildInstallmentsFromMou } from './installments'
import { composePi } from './pi'
import { formatPiNumber, getEntityForProgramme } from './company'
import type { MOU, School } from './types'

const allMous = importedMous as unknown as MOU[]
const allSchools = importedSchools as unknown as School[]

function findMou(id: string): MOU {
  const m = allMous.find((x) => x.id === id)
  if (!m) throw new Error(`Snapshot missing MOU ${id}; re-run scripts/cutover-snapshot.mjs`)
  return m
}

function findSchool(id: string): School | undefined {
  return allSchools.find((s) => s.id === id)
}

/**
 * Mou-system's `buildInstallmentsFromMou` allocates `Math.round(total *
 * share)` per instalment. Sum may differ from contractValue by a few
 * rupees due to rounding (e.g., 16,91,766 / 4 with share 0.25 emits four
 * 4,22,942 instalments summing to 16,91,768). This helper computes the
 * canonical expected-amount sequence so the test asserts against rules,
 * not magic constants.
 */
function expectedAmounts(contractValue: number, pcts: number[]): number[] {
  const sum = pcts.reduce((a, b) => a + b, 0)
  return pcts.map((p) => Math.round(contractValue * (p / sum)))
}

// ----------------------------------------------------------------------------
// Imported MOU 1: 540-student STEAM, 25-25-25-25 quarterly
// ----------------------------------------------------------------------------

describe('Imported #1: MOU-STEAM-2526-002 (540 students, quarterly)', () => {
  const mou = findMou('MOU-STEAM-2526-002')

  it('snapshot record matches expected commercial shape', () => {
    expect(mou.programme).toBe('STEAM')
    expect(mou.studentsMou).toBe(540)
    expect(mou.contractValue).toBe(1691766)
    expect(mou.paymentSchedule).toBe('25-25-25-25 quarterly')
  })

  it('builds 4 instalments matching the canonical round-half allocation', () => {
    const ins = buildInstallmentsFromMou(mou)
    expect(ins).toHaveLength(4)
    const expected = expectedAmounts(mou.contractValue, [25, 25, 25, 25])
    expect(ins.map((p) => p.expectedAmount)).toEqual(expected)
    // Each instalment is round(contractValue * 0.25). For 16,91,766 the
    // computed value is 4,22,942 (rounded up from 4,22,941.5).
    expect(ins[0]?.expectedAmount).toBe(422942)
  })

  it('PI for instalment 1 routes to MTPL/UP (STEAM)', () => {
    expect(getEntityForProgramme(mou.programme)).toBe('UP')
    const ins = buildInstallmentsFromMou(mou)
    const inst1 = ins[0]!
    const piNumber = formatPiNumber('UP', 1)
    const school = findSchool(mou.schoolId)
    const pi = composePi({
      piNumber,
      issueDate: '2026-04-15',
      installment: inst1,
      mou,
      school,
      gstPct: 0.18,
    })
    expect(pi.piNumber).toBe('MTPL/UP/26-27/0001')
    expect(pi.installment.expectedAmount).toBe(422942)
    expect(pi.balanceDuePreviousInstalments).toBe(0)
    expect(pi.netPaymentDue).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------------------------
// Imported MOU 2: 900-student STEAM, 50-50 half-yearly
// ----------------------------------------------------------------------------

describe('Imported #2: MOU-STEAM-2526-005 (900 students, half-yearly)', () => {
  const mou = findMou('MOU-STEAM-2526-005')

  it('snapshot record matches expected commercial shape', () => {
    expect(mou.programme).toBe('STEAM')
    expect(mou.studentsMou).toBe(900)
    expect(mou.contractValue).toBe(2305600)
    expect(mou.paymentSchedule).toBe('50-50 half-yearly')
  })

  it('builds 2 instalments at half the contract value', () => {
    const ins = buildInstallmentsFromMou(mou)
    expect(ins).toHaveLength(2)
    expect(ins[0]?.expectedAmount).toBe(1152800)
    expect(ins[1]?.expectedAmount).toBe(1152800)
    // Round numbers; sum equals contract value exactly here.
    expect(ins[0]!.expectedAmount + ins[1]!.expectedAmount).toBe(2305600)
  })
})

// ----------------------------------------------------------------------------
// Imported MOU 3: 385-student STEAM, 100% advance
// ----------------------------------------------------------------------------

describe('Imported #3: MOU-STEAM-2526-024 (385 students, 100% advance)', () => {
  const mou = findMou('MOU-STEAM-2526-024')

  it('snapshot record matches expected commercial shape', () => {
    expect(mou.programme).toBe('STEAM')
    expect(mou.studentsMou).toBe(385)
    expect(mou.contractValue).toBe(1155750)
    expect(mou.paymentSchedule).toBe('100% advance')
  })

  it('builds a single instalment at the full contract value', () => {
    const ins = buildInstallmentsFromMou(mou)
    expect(ins).toHaveLength(1)
    expect(ins[0]?.expectedAmount).toBe(1155750)
    expect(ins[0]?.totalInstalments).toBe(1)
  })
})

// ----------------------------------------------------------------------------
// Imported MOU 4: 350-student STEAM, 50-50 half-yearly (round numbers)
// ----------------------------------------------------------------------------

describe('Imported #4: MOU-STEAM-2526-014 (350 students, half-yearly, round)', () => {
  const mou = findMou('MOU-STEAM-2526-014')

  it('snapshot record matches expected commercial shape', () => {
    expect(mou.programme).toBe('STEAM')
    expect(mou.studentsMou).toBe(350)
    expect(mou.contractValue).toBe(840000)
    expect(mou.paymentSchedule).toBe('50-50 half-yearly')
  })

  it('builds 2 instalments at exactly Rs 4,20,000 each (round number, no rounding loss)', () => {
    const ins = buildInstallmentsFromMou(mou)
    expect(ins).toHaveLength(2)
    expect(ins[0]?.expectedAmount).toBe(420000)
    expect(ins[1]?.expectedAmount).toBe(420000)
    // No rounding artefact: sum equals contract value.
    expect(ins[0]!.expectedAmount + ins[1]!.expectedAmount).toBe(840000)
  })
})

// ----------------------------------------------------------------------------
// Imported MOU 5: 900-student STEAM, 25-25-25-25 quarterly
// ----------------------------------------------------------------------------

describe('Imported #5: MOU-STEAM-2526-006 (900 students, quarterly)', () => {
  const mou = findMou('MOU-STEAM-2526-006')

  it('snapshot record matches expected commercial shape', () => {
    expect(mou.programme).toBe('STEAM')
    expect(mou.studentsMou).toBe(900)
    expect(mou.contractValue).toBe(2112000)
    expect(mou.paymentSchedule).toBe('25-25-25-25 quarterly')
  })

  it('builds 4 instalments at exactly Rs 5,28,000 each (round number)', () => {
    const ins = buildInstallmentsFromMou(mou)
    expect(ins).toHaveLength(4)
    for (const p of ins) expect(p.expectedAmount).toBe(528000)
    expect(ins.reduce((s, p) => s + p.expectedAmount, 0)).toBe(2112000)
  })

  it('PI for instalment 1 of MOU 5 routes to MTPL/UP/26-27/0002 when issued after MOU 1', () => {
    // Note: PI counter sequence is per-entity; MOU 1 in this file took
    // MTPL/UP/26-27/0001, so the next PI under UP would be 0002. We are
    // not exercising the live atomic counter here (which would require a
    // GitHub Contents API write); instead we assert formatPiNumber's
    // sequence formatting is deterministic given an explicit seq.
    expect(formatPiNumber('UP', 2)).toBe('MTPL/UP/26-27/0002')
    expect(getEntityForProgramme(mou.programme)).toBe('UP')
  })
})

// ----------------------------------------------------------------------------
// Cross-check: snapshot integrity invariants
// ----------------------------------------------------------------------------

describe('Snapshot integrity', () => {
  it('every MOU has a programme in the 4-value canonical set', () => {
    const valid = new Set(['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics'])
    const violations = allMous.filter((m) => !valid.has(m.programme as string))
    expect(violations).toEqual([])
  })

  it('school count matches school_groups count (1:1 backfill)', async () => {
    const groups = (
      await import('@/data/_snapshots/mou-system/school_groups.json')
    ).default as Array<{ memberSchoolIds: string[] }>
    expect(groups.length).toBe(allSchools.length)
    // Every school is a member of exactly one group (1:1 default).
    const allMembers = groups.flatMap((g) => g.memberSchoolIds)
    expect(allMembers.length).toBe(allSchools.length)
    expect(new Set(allMembers).size).toBe(allSchools.length)
  })

  it('VEX module data is non-empty (parallel module verification)', async () => {
    const products = (await import('@/data/_snapshots/mou-system/vex_products.json')).default
    const pis = (await import('@/data/_snapshots/mou-system/vex_pis.json')).default
    const orders = (await import('@/data/_snapshots/mou-system/vex_orders.json')).default
    expect(Array.isArray(products) && products.length).toBeGreaterThan(0)
    expect(Array.isArray(pis)).toBe(true)
    expect(Array.isArray(orders) && orders.length).toBeGreaterThan(0)
  })
})
