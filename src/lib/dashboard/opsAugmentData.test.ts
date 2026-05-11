/*
 * Unit tests for opsAugmentData (Gate 4.95 Session 3 Step 3).
 *
 * Covers: filter parsing (region, super-region, sales rep, ops owner),
 * filter application with stage-responsibility ops-owner lookup,
 * programme breakdown computation incl. VEX bucket + bar pct.
 */

import { describe, it, expect } from 'vitest'
import type { KitDispatch, MOU, School, StageResponsibility, User } from '@/lib/types'
import {
  applyOpsAugmentFilters,
  buildOpsOwnerOptions,
  buildSalesRepOptions,
  computeOpsProgrammeBreakdown,
  EMPTY_OPS_AUGMENT_FILTERS,
  isOpsAugmentFiltersEmpty,
  parseOpsAugmentFilters,
} from './opsAugmentData'

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-001',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    salesPersonId: 'sp-001',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 180,
    auditLog: [],
    ...over,
  } as MOU
}

function school(id: string, region: string): School {
  return {
    id, name: `School ${id}`, legalEntity: null, city: 'Mumbai',
    state: 'Maharashtra', region, pinCode: null, contactPerson: null,
    email: null, phone: null, billingName: null, pan: null,
    gstNumber: null, notes: null, active: true,
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  } as School
}

function kitDispatch(over: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-001', mouId: 'MOU-STEAM-2627-001', schoolId: 'SCH-001',
    schoolName: 'Test', productSelected: 'TinkRworks', dispatchStatus: 'Requested',
    allocations: [], salesApprovalStatus: 'pending', salesApprovedBy: null,
    salesApprovedAt: null, salesRejectionReason: null, dispatchSummary: null,
    shipmentTracking: null, pod: null, auditLog: [], createdAt: '2026-04-01T00:00:00Z',
    ...over,
  } as KitDispatch
}

function user(id: string, dept: User['department'] = 'ops', active = true): User {
  return {
    id, name: `User ${id}`, email: `${id}@example.test`, role: 'OpsEmployee',
    department: dept, testingOverride: false, active,
    passwordHash: 'X', createdAt: '', auditLog: [],
  } as User
}

function stageResp(stage: string, userId: string | null): StageResponsibility {
  return {
    stage: stage as StageResponsibility['stage'],
    responsibleDepartment: 'ops',
    responsibleUserId: userId,
    escalationDepartment: 'sales',
    notes: null,
  } as StageResponsibility
}

// ---------------------------------------------------------------------------
// parseOpsAugmentFilters
// ---------------------------------------------------------------------------

describe('parseOpsAugmentFilters', () => {
  it('parses region, super-region, sales rep, ops owner from CSV params', () => {
    const f = parseOpsAugmentFilters({
      region: 'East,North',
      sr: 'NE,SW',
      rep: 'sp-001,sp-002',
      owner: 'anish.d,misba.s',
    })
    expect(f.regions).toEqual(['East', 'North'])
    expect(f.superRegions).toEqual(['NE', 'SW'])
    expect(f.salesRepIds).toEqual(['sp-001', 'sp-002'])
    expect(f.opsOwnerIds).toEqual(['anish.d', 'misba.s'])
  })
  it('drops unknown regions + unknown super-region tokens', () => {
    const f = parseOpsAugmentFilters({
      region: 'East,Atlantis',
      sr: 'NE,FAR-EAST',
    })
    expect(f.regions).toEqual(['East'])
    expect(f.superRegions).toEqual(['NE'])
  })
  it('empty params produce the empty filter', () => {
    expect(parseOpsAugmentFilters({})).toEqual(EMPTY_OPS_AUGMENT_FILTERS)
  })
  it('isOpsAugmentFiltersEmpty true when no dimension active', () => {
    expect(isOpsAugmentFiltersEmpty(EMPTY_OPS_AUGMENT_FILTERS)).toBe(true)
    expect(isOpsAugmentFiltersEmpty({ ...EMPTY_OPS_AUGMENT_FILTERS, regions: ['East'] })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyOpsAugmentFilters
// ---------------------------------------------------------------------------

describe('applyOpsAugmentFilters', () => {
  it('passthrough when no dimensions active', () => {
    const mous = [mou({ id: 'a' }), mou({ id: 'b' })]
    const res = applyOpsAugmentFilters({
      mous,
      schools: [school('SCH-001', 'East')],
      filters: EMPTY_OPS_AUGMENT_FILTERS,
    })
    expect(res.passthrough).toBe(true)
    expect(res.filteredMouIds.size).toBe(2)
  })

  it('filters by region (primary)', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'SCH-001' }),
      mou({ id: 'b', schoolId: 'SCH-002' }),
    ]
    const schools = [school('SCH-001', 'East'), school('SCH-002', 'South-West')]
    const res = applyOpsAugmentFilters({
      mous, schools,
      filters: { ...EMPTY_OPS_AUGMENT_FILTERS, regions: ['East'] },
    })
    expect([...res.filteredMouIds]).toEqual(['a'])
  })

  it('filters by super-region expands to member primary regions', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'SCH-001' }), // East -> NE
      mou({ id: 'b', schoolId: 'SCH-002' }), // South-West -> SW
      mou({ id: 'c', schoolId: 'SCH-003' }), // North -> NE
    ]
    const schools = [
      school('SCH-001', 'East'),
      school('SCH-002', 'South-West'),
      school('SCH-003', 'North'),
    ]
    const res = applyOpsAugmentFilters({
      mous, schools,
      filters: { ...EMPTY_OPS_AUGMENT_FILTERS, superRegions: ['NE'] },
    })
    expect([...res.filteredMouIds].sort()).toEqual(['a', 'c'])
  })

  it('filters by sales rep id', () => {
    const mous = [
      mou({ id: 'a', salesPersonId: 'sp-001' }),
      mou({ id: 'b', salesPersonId: 'sp-002' }),
      mou({ id: 'c', salesPersonId: null }),
    ]
    const res = applyOpsAugmentFilters({
      mous, schools: [school('SCH-001', 'East')],
      filters: { ...EMPTY_OPS_AUGMENT_FILTERS, salesRepIds: ['sp-002'] },
    })
    expect([...res.filteredMouIds]).toEqual(['b'])
  })

  it('filters by ops owner via stage responsibility lookup at MOU current stage', () => {
    // MOU is Active with no payments + no dispatches -> stage = 'mou-uploaded'
    // (no actuals captured yet, no payments).
    const mous = [
      mou({ id: 'a', studentsActual: null }), // stage = mou-uploaded
      mou({ id: 'b', studentsActual: 50 }), // stage = active
    ]
    const stageResponsibility = [
      stageResp('mou-uploaded', 'anish.d'),
      stageResp('active', 'misba.s'),
    ]
    const res = applyOpsAugmentFilters({
      mous,
      schools: [school('SCH-001', 'East')],
      filters: { ...EMPTY_OPS_AUGMENT_FILTERS, opsOwnerIds: ['misba.s'] },
      stageResponsibility,
    })
    expect([...res.filteredMouIds]).toEqual(['b'])
  })

  it('combines multiple dimensions with AND semantics', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'SCH-001', salesPersonId: 'sp-001' }),
      mou({ id: 'b', schoolId: 'SCH-002', salesPersonId: 'sp-001' }),
      mou({ id: 'c', schoolId: 'SCH-001', salesPersonId: 'sp-002' }),
    ]
    const schools = [
      school('SCH-001', 'East'),
      school('SCH-002', 'South-West'),
    ]
    const res = applyOpsAugmentFilters({
      mous, schools,
      filters: {
        ...EMPTY_OPS_AUGMENT_FILTERS,
        regions: ['East'],
        salesRepIds: ['sp-001'],
      },
    })
    // Only 'a' satisfies both (East + sp-001).
    expect([...res.filteredMouIds]).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// computeOpsProgrammeBreakdown
// ---------------------------------------------------------------------------

describe('computeOpsProgrammeBreakdown', () => {
  it('returns 5 rows in canonical order incl. VEX', () => {
    const rows = computeOpsProgrammeBreakdown({ mous: [], kitDispatches: [] })
    expect(rows.map((r) => r.programme)).toEqual([
      'STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics', 'VEX',
    ])
  })
  it('counts MOUs + sums students + active dispatch value', () => {
    const mous = [
      mou({ id: 'a', programme: 'STEAM', studentsActual: 50, contractValue: 100000 }),
      mou({ id: 'b', programme: 'STEAM', studentsActual: 30, contractValue: 50000 }),
      mou({ id: 'c', programme: 'Robotics', studentsActual: 20, contractValue: 30000 }),
    ]
    const dispatches = [
      kitDispatch({ id: 'd1', mouId: 'a', dispatchStatus: 'In Transit' }),
      kitDispatch({ id: 'd2', mouId: 'b', dispatchStatus: 'Delivered' }),
      kitDispatch({ id: 'd3', mouId: 'c', dispatchStatus: 'Requested' }),
    ]
    const rows = computeOpsProgrammeBreakdown({ mous, kitDispatches: dispatches })
    const steam = rows.find((r) => r.programme === 'STEAM')!
    expect(steam.mouCount).toBe(2)
    expect(steam.studentsCount).toBe(80)
    // 'b' has Delivered dispatch -> not active; only 'a' contributes value.
    expect(steam.activeDispatchValue).toBe(100000)
    const robotics = rows.find((r) => r.programme === 'Robotics')!
    expect(robotics.activeDispatchValue).toBe(30000)
  })
  it('VEX bucket picks up MOUs whose productSelection is VEX', () => {
    const mous = [
      mou({ id: 'a', programme: 'STEAM' }),
      mou({ id: 'v', programme: 'STEAM', productSelection: 'VEX' as unknown as never }),
    ]
    const rows = computeOpsProgrammeBreakdown({ mous, kitDispatches: [] })
    const vex = rows.find((r) => r.programme === 'VEX')!
    const steam = rows.find((r) => r.programme === 'STEAM')!
    expect(vex.mouCount).toBe(1)
    expect(steam.mouCount).toBe(1)
  })
  it('bar pct is relative to the max MOU count', () => {
    const mous = [
      mou({ id: 'a', programme: 'STEAM' }),
      mou({ id: 'b', programme: 'STEAM' }),
      mou({ id: 'c', programme: 'Robotics' }),
    ]
    const rows = computeOpsProgrammeBreakdown({ mous, kitDispatches: [] })
    const steam = rows.find((r) => r.programme === 'STEAM')!
    const robotics = rows.find((r) => r.programme === 'Robotics')!
    expect(steam.barPct).toBe(100)
    expect(robotics.barPct).toBe(50)
  })
  it('drill-down hrefs: programme rows go to /mous filtered; VEX row goes to dispatch view', () => {
    const rows = computeOpsProgrammeBreakdown({ mous: [], kitDispatches: [] })
    const steam = rows.find((r) => r.programme === 'STEAM')!
    const vex = rows.find((r) => r.programme === 'VEX')!
    expect(steam.href).toBe('/mous?programme=STEAM')
    expect(vex.href).toBe('/dispatch/kits?product=VEX')
  })
})

// ---------------------------------------------------------------------------
// Option list builders
// ---------------------------------------------------------------------------

describe('buildSalesRepOptions / buildOpsOwnerOptions', () => {
  it('filters out inactive sales reps and sorts by name', () => {
    const opts = buildSalesRepOptions([
      { id: 'sp-1', name: 'Zara', active: true },
      { id: 'sp-2', name: 'Aarav', active: true },
      { id: 'sp-3', name: 'Stale Person', active: false },
    ])
    expect(opts.map((o) => o.id)).toEqual(['sp-2', 'sp-1'])
  })
  it('ops owner options include Ops department users + cross-functional (department null)', () => {
    const opts = buildOpsOwnerOptions([
      user('a', 'ops'),
      user('b', 'sales'),
      user('c', null),
      user('d', 'ops', false), // inactive
    ])
    expect(opts.map((o) => o.id).sort()).toEqual(['a', 'c'])
  })
})
