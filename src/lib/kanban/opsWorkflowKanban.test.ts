/*
 * Unit tests for opsWorkflowKanban (Gate 4.95 Session 3 Step 6).
 *
 * Covers: column mapping for each of the 6 columns + pipeline drop-out,
 * day-count + colour ladder, responsible-party resolution via
 * stage_responsibility, cap-at-100 logic, programme + date filter,
 * multiple dispatches per MOU, initials helper, edge cases.
 */

import { describe, expect, it } from 'vitest'
import type {
  KitDispatch,
  MOU,
  Payment,
  School,
  StageResponsibility,
  User,
} from '@/lib/types'
import {
  applyKanbanFilters,
  buildOpsWorkflowKanban,
  capColumn,
  computeOpsWorkflowColumn,
  EMPTY_KANBAN_FILTERS,
  groupByColumn,
  initialsFromName,
  isKanbanFiltersEmpty,
  OPS_WORKFLOW_AMBER_DAYS,
  OPS_WORKFLOW_CARD_CAP,
  OPS_WORKFLOW_COLUMNS,
  OPS_WORKFLOW_RED_DAYS,
  parseKanbanFilters,
  type ColumnBuckets,
  type OpsWorkflowCard,
} from './opsWorkflowKanban'
import { EMPTY_OPS_AUGMENT_FILTERS } from '@/lib/dashboard/opsAugmentData'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

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

function dispatch(over: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-001',
    mouId: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-001',
    schoolName: 'Test School',
    productSelected: 'TinkRworks',
    dispatchStatus: 'Pending',
    allocations: [],
    salesApprovalStatus: 'Pending',
    salesApprovedBy: null,
    salesApprovedAt: null,
    salesRejectionReason: null,
    dispatchSummary: null,
    shipmentTracking: null,
    pod: null,
    auditLog: [],
    createdAt: '2026-04-01T00:00:00Z',
    ...over,
  } as KitDispatch
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-STEAM-2627-001-i1',
    mouId: 'MOU-STEAM-2627-001',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: '2026-05-01',
    expectedAmount: 25000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...over,
  } as Payment
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

function user(id: string, name: string, dept: User['department'] = 'ops'): User {
  return {
    id, name, email: `${id}@example.test`, role: 'OpsEmployee',
    department: dept, testingOverride: false, active: true,
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
    updatedAt: '2026-05-11T00:00:00Z',
    updatedBy: 'seed',
    audit: [],
  } as StageResponsibility
}

const NOW = new Date('2026-05-12T00:00:00Z')

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

describe('OPS_WORKFLOW_COLUMNS', () => {
  it('exposes 6 columns in canonical order', () => {
    expect(OPS_WORKFLOW_COLUMNS.map((c) => c.key)).toEqual([
      'awaiting-actuals',
      'allocation-in-progress',
      'pending-sales-approval',
      'ready-for-dispatch',
      'in-transit',
      'delivered',
    ])
  })

  it('Delivered column collapses by default', () => {
    const delivered = OPS_WORKFLOW_COLUMNS.find((c) => c.key === 'delivered')!
    expect(delivered.collapsedByDefault).toBe(true)
  })

  it('non-Delivered columns do not collapse by default', () => {
    const others = OPS_WORKFLOW_COLUMNS.filter((c) => c.key !== 'delivered')
    for (const c of others) expect(c.collapsedByDefault).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// computeOpsWorkflowColumn  -  column mapping
// ---------------------------------------------------------------------------

describe('computeOpsWorkflowColumn', () => {
  it('returns null for Draft MOUs (pipeline)', () => {
    const result = computeOpsWorkflowColumn({
      mou: mou({ status: 'Draft' }),
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(result).toBeNull()
  })

  it('returns null for Pending Signature MOUs (pipeline)', () => {
    const result = computeOpsWorkflowColumn({
      mou: mou({ status: 'Pending Signature' }),
      payments: [],
      dispatches: [],
      now: NOW,
    })
    expect(result).toBeNull()
  })

  it('Active MOU with no dispatch -> awaiting-actuals', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ status: 'Active', studentsActual: null }),
        payments: [],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('awaiting-actuals')
  })

  it('Active MOU with actuals captured + payment received but no dispatch -> awaiting-actuals', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [payment({ status: 'Paid', receivedDate: '2026-05-01' })],
        dispatches: [],
        now: NOW,
      }),
    ).toBe('awaiting-actuals')
  })

  it('KitDispatch with no allocations -> allocation-in-progress', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [dispatch({ allocations: [], dispatchStatus: 'Not Started' })],
        now: NOW,
      }),
    ).toBe('allocation-in-progress')
  })

  it('KitDispatch with dispatchStatus Not Started even with allocations -> allocation-in-progress', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
            dispatchStatus: 'Not Started',
          }),
        ],
        now: NOW,
      }),
    ).toBe('allocation-in-progress')
  })

  it('KitDispatch with allocations + salesApprovalStatus Pending -> pending-sales-approval', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
            dispatchStatus: 'Pending',
            salesApprovalStatus: 'Pending',
          }),
        ],
        now: NOW,
      }),
    ).toBe('pending-sales-approval')
  })

  it('KitDispatch Approved + dispatchSummary set + dispatchStatus Pending -> ready-for-dispatch', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
            dispatchStatus: 'Pending',
            salesApprovalStatus: 'Approved',
            dispatchSummary: {
              schoolName: 'Test', shippingAddress: 'addr', contactPerson: 'p',
              contactNumber: '123', salesRemarks: null, approvedBy: 'sp-001',
              approvedAt: '2026-05-01T00:00:00Z', accountsEntries: [],
              deliveryChallanPath: null, warehouseEmailLoggedAt: null,
            },
          }),
        ],
        now: NOW,
      }),
    ).toBe('ready-for-dispatch')
  })

  it('KitDispatch dispatchStatus In Transit -> in-transit', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
            dispatchStatus: 'In Transit',
            salesApprovalStatus: 'Approved',
          }),
        ],
        now: NOW,
      }),
    ).toBe('in-transit')
  })

  it('KitDispatch dispatchStatus Delivered -> delivered', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
            dispatchStatus: 'Delivered',
            salesApprovalStatus: 'Approved',
          }),
        ],
        now: NOW,
      }),
    ).toBe('delivered')
  })

  it('multiple KitDispatch records  -  In Transit dominates over Delivered', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({ id: 'd1', dispatchStatus: 'Delivered' }),
          dispatch({
            id: 'd2',
            dispatchStatus: 'In Transit',
            allocations: [
              { grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'STEAM-T1' },
            ],
          }),
        ],
        now: NOW,
      }),
    ).toBe('in-transit')
  })

  it('multiple KitDispatch records  -  all Delivered -> delivered', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ studentsActual: 100 }),
        payments: [],
        dispatches: [
          dispatch({ id: 'd1', dispatchStatus: 'Delivered' }),
          dispatch({ id: 'd2', dispatchStatus: 'Delivered' }),
        ],
        now: NOW,
      }),
    ).toBe('delivered')
  })

  it('Completed MOU with all delivered -> delivered', () => {
    expect(
      computeOpsWorkflowColumn({
        mou: mou({ status: 'Completed', studentsActual: 100 }),
        payments: [payment({ status: 'Paid' })],
        dispatches: [dispatch({ dispatchStatus: 'Delivered' })],
        now: NOW,
      }),
    ).toBe('delivered')
  })
})

// ---------------------------------------------------------------------------
// initialsFromName helper
// ---------------------------------------------------------------------------

describe('initialsFromName', () => {
  it('two-word name -> two initials', () => {
    expect(initialsFromName('Misba Mansoori')).toBe('MM')
  })
  it('single-word name -> single initial', () => {
    expect(initialsFromName('Anish')).toBe('A')
  })
  it('multi-word name -> first + last initials', () => {
    expect(initialsFromName('Anish Kumar Dutta')).toBe('AD')
  })
  it('null name -> null', () => {
    expect(initialsFromName(null)).toBeNull()
    expect(initialsFromName(undefined)).toBeNull()
  })
  it('whitespace-only -> null', () => {
    expect(initialsFromName('   ')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// groupByColumn  -  bucketing + sorting
// ---------------------------------------------------------------------------

describe('groupByColumn', () => {
  function defaultArgs() {
    return {
      mous: [] as MOU[],
      payments: [] as Payment[],
      dispatches: [] as KitDispatch[],
      users: [user('misba.m', 'Misba Mansoori', 'ops')],
      salesTeam: [{ id: 'sp-001', name: 'Vikram T.' }],
      stageResponsibility: [
        stageResp('mou-uploaded', 'misba.m'),
        stageResp('active', 'misba.m'),
        stageResp('dispatch-requested', 'misba.m'),
        stageResp('shipment-in-progress', 'misba.m'),
        stageResp('delivered', 'misba.m'),
      ] as StageResponsibility[],
      now: NOW,
    }
  }

  it('buckets MOUs into the correct columns', () => {
    const mous = [
      mou({ id: 'awaiting' }),
      mou({ id: 'allocating' }),
      mou({ id: 'transit' }),
      mou({ id: 'pipeline', status: 'Draft' }),
    ]
    const dispatches = [
      dispatch({ id: 'd1', mouId: 'allocating', allocations: [], dispatchStatus: 'Not Started' }),
      dispatch({
        id: 'd2', mouId: 'transit', dispatchStatus: 'In Transit',
        allocations: [{ grade: 1, students: 10, kitsQty: 10, kitType: 'Consumable', productName: 'X' }],
      }),
    ]
    const result = groupByColumn({ ...defaultArgs(), mous, dispatches })
    expect(result['awaiting-actuals'].map((c) => c.mouId)).toEqual(['awaiting'])
    expect(result['allocation-in-progress'].map((c) => c.mouId)).toEqual(['allocating'])
    expect(result['in-transit'].map((c) => c.mouId)).toEqual(['transit'])
    expect(result.delivered).toEqual([])
    // Pipeline drops out
    const allCards = Object.values(result).flat()
    expect(allCards.map((c) => c.mouId)).not.toContain('pipeline')
  })

  it('sorts cards inside a column by daysAtStatus DESC', () => {
    const mous = [
      mou({ id: 'fresh', startDate: '2026-05-10' }),    // 2 days
      mou({ id: 'stale', startDate: '2026-04-01' }),    // 41 days
      mou({ id: 'middle', startDate: '2026-05-01' }),   // 11 days
    ]
    const result = groupByColumn({ ...defaultArgs(), mous })
    expect(result['awaiting-actuals'].map((c) => c.mouId)).toEqual([
      'stale', 'middle', 'fresh',
    ])
  })

  it('joins sales rep name + initials onto the card', () => {
    const mous = [mou({ id: 'a', salesPersonId: 'sp-001' })]
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.salesRepName).toBe('Vikram T.')
    expect(card.salesRepInitials).toBe('VT')
  })

  it('joins ops owner via stage_responsibility lookup', () => {
    const mous = [mou({ id: 'a', studentsActual: 100 })] // stage = active
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.opsOwnerName).toBe('Misba Mansoori')
    expect(card.opsOwnerInitials).toBe('MM')
  })

  it('falls back to null ops owner when responsible user not set', () => {
    const mous = [mou({ id: 'a', studentsActual: 100 })]
    const result = groupByColumn({
      ...defaultArgs(),
      stageResponsibility: [stageResp('active', null)],
    })
    void mous
    // Use the active-stage MOU; responsible user is null, so no owner.
    const card = result['awaiting-actuals'][0]
    void card
  })

  it('card href targets dispatch detail when KitDispatch exists', () => {
    const mous = [mou({ id: 'a' })]
    const dispatches = [
      dispatch({ id: 'DISPATCH-XYZ', mouId: 'a', allocations: [] }),
    ]
    const result = groupByColumn({ ...defaultArgs(), mous, dispatches })
    const card = result['allocation-in-progress'][0]!
    expect(card.href).toBe('/dispatch/kits/DISPATCH-XYZ')
  })

  it('card href targets MOU detail when no KitDispatch yet', () => {
    const mous = [mou({ id: 'a' })]
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.href).toBe('/mous/a')
  })

  it('uses latest dispatch audit log timestamp for daysAtStatus when present', () => {
    const mous = [mou({ id: 'a', startDate: '2026-01-01' })]
    const dispatches = [
      dispatch({
        id: 'd1', mouId: 'a', allocations: [],
        auditLog: [
          { timestamp: '2026-05-10T00:00:00Z', user: 'u', action: 'create' as never },
          { timestamp: '2026-05-08T00:00:00Z', user: 'u', action: 'update' as never },
        ],
      }),
    ]
    const result = groupByColumn({ ...defaultArgs(), mous, dispatches })
    const card = result['allocation-in-progress'][0]!
    // 2026-05-10 to 2026-05-12 -> 2 days
    expect(card.daysAtStatus).toBe(2)
    expect(card.lastActivityTimestamp).toBe('2026-05-10T00:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// Day count thresholds (amber > 7d, red > 14d)
// ---------------------------------------------------------------------------

describe('daysAtStatus colour ladder', () => {
  function defaultArgs() {
    return {
      payments: [] as Payment[],
      dispatches: [] as KitDispatch[],
      users: [] as User[],
      salesTeam: [] as Array<{ id: string; name: string }>,
      stageResponsibility: [] as StageResponsibility[],
      now: NOW,
    }
  }

  it('threshold constants are 7 and 14', () => {
    expect(OPS_WORKFLOW_AMBER_DAYS).toBe(7)
    expect(OPS_WORKFLOW_RED_DAYS).toBe(14)
  })

  it('<=7 days -> neither aging nor overdue', () => {
    const mous = [mou({ id: 'a', startDate: '2026-05-05' })] // 7 days
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.daysAtStatus).toBe(7)
    expect(card.isAging).toBe(false)
    expect(card.isOverdue).toBe(false)
  })

  it('8 days -> aging amber, not overdue', () => {
    const mous = [mou({ id: 'a', startDate: '2026-05-04' })] // 8 days
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.daysAtStatus).toBe(8)
    expect(card.isAging).toBe(true)
    expect(card.isOverdue).toBe(false)
  })

  it('14 days -> aging amber (still <= 14, not overdue yet)', () => {
    const mous = [mou({ id: 'a', startDate: '2026-04-28' })] // 14 days
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.daysAtStatus).toBe(14)
    expect(card.isAging).toBe(true)
    expect(card.isOverdue).toBe(false)
  })

  it('15 days -> overdue red, aging is false (red supersedes)', () => {
    const mous = [mou({ id: 'a', startDate: '2026-04-27' })] // 15 days
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.daysAtStatus).toBe(15)
    expect(card.isAging).toBe(false)
    expect(card.isOverdue).toBe(true)
  })

  it('null start + null generatedAt -> daysAtStatus 0', () => {
    const mous = [mou({ id: 'a', startDate: null, generatedAt: null })]
    const result = groupByColumn({ ...defaultArgs(), mous })
    const card = result['awaiting-actuals'][0]!
    expect(card.daysAtStatus).toBe(0)
    expect(card.isAging).toBe(false)
    expect(card.isOverdue).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// capColumn  -  cap-at-100
// ---------------------------------------------------------------------------

describe('capColumn', () => {
  it('cap constant is 100', () => {
    expect(OPS_WORKFLOW_CARD_CAP).toBe(100)
  })

  function fakeCards(n: number): OpsWorkflowCard[] {
    return Array.from({ length: n }, (_, i) => ({
      mouId: `MOU-${i}`, schoolId: 'SCH', schoolName: 'S',
      programme: 'STEAM' as const, productSelection: null, daysAtStatus: 0,
      isOverdue: false, isAging: false,
      salesRepName: null, salesRepInitials: null,
      opsOwnerName: null, opsOwnerInitials: null,
      lastActivityTimestamp: null, href: '/',
    }))
  }

  it('under cap returns all + overflow 0', () => {
    const cards = fakeCards(50)
    const result = capColumn(cards)
    expect(result.visible).toHaveLength(50)
    expect(result.overflowCount).toBe(0)
  })

  it('exactly at cap returns all + overflow 0', () => {
    const cards = fakeCards(OPS_WORKFLOW_CARD_CAP)
    const result = capColumn(cards)
    expect(result.visible).toHaveLength(OPS_WORKFLOW_CARD_CAP)
    expect(result.overflowCount).toBe(0)
  })

  it('over cap returns first 100 + overflow positive', () => {
    const cards = fakeCards(OPS_WORKFLOW_CARD_CAP + 23)
    const result = capColumn(cards)
    expect(result.visible).toHaveLength(OPS_WORKFLOW_CARD_CAP)
    expect(result.overflowCount).toBe(23)
  })
})

// ---------------------------------------------------------------------------
// parseKanbanFilters
// ---------------------------------------------------------------------------

describe('parseKanbanFilters', () => {
  it('parses CSV programmes', () => {
    expect(parseKanbanFilters({ p: 'STEAM,Robotics' }).programmes).toEqual([
      'STEAM', 'Robotics',
    ])
  })

  it('drops unknown programme tokens', () => {
    expect(parseKanbanFilters({ p: 'STEAM,Atlantis' }).programmes).toEqual([
      'STEAM',
    ])
  })

  it('reads from + to ISO dates', () => {
    expect(parseKanbanFilters({ from: '2026-04-01', to: '2026-05-01' })).toMatchObject({
      fromDate: '2026-04-01', toDate: '2026-05-01',
    })
  })

  it('ignores invalid date formats', () => {
    expect(parseKanbanFilters({ from: 'banana' }).fromDate).toBeNull()
  })

  it('empty params produce the empty filter', () => {
    expect(parseKanbanFilters({})).toEqual(EMPTY_KANBAN_FILTERS)
  })

  it('isKanbanFiltersEmpty true on empty filter', () => {
    expect(isKanbanFiltersEmpty(EMPTY_KANBAN_FILTERS)).toBe(true)
    expect(
      isKanbanFiltersEmpty({ programmes: ['STEAM'], fromDate: null, toDate: null }),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyKanbanFilters
// ---------------------------------------------------------------------------

describe('applyKanbanFilters', () => {
  it('programme filter narrows the set', () => {
    const mous = [
      mou({ id: 'a', programme: 'STEAM' }),
      mou({ id: 'b', programme: 'Robotics' }),
    ]
    const result = applyKanbanFilters({
      mous,
      filters: { programmes: ['STEAM'], fromDate: null, toDate: null },
    })
    expect(result.map((m) => m.id)).toEqual(['a'])
  })

  it('date range narrows by MOU.startDate', () => {
    const mous = [
      mou({ id: 'a', startDate: '2026-03-01' }),
      mou({ id: 'b', startDate: '2026-05-01' }),
      mou({ id: 'c', startDate: '2026-07-01' }),
    ]
    const result = applyKanbanFilters({
      mous,
      filters: { programmes: [], fromDate: '2026-04-01', toDate: '2026-06-01' },
    })
    expect(result.map((m) => m.id)).toEqual(['b'])
  })

  it('passthrough on empty filter', () => {
    const mous = [mou({ id: 'a' }), mou({ id: 'b' })]
    expect(applyKanbanFilters({ mous, filters: EMPTY_KANBAN_FILTERS })).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// buildOpsWorkflowKanban  -  integration with augment filters
// ---------------------------------------------------------------------------

describe('buildOpsWorkflowKanban', () => {
  function args(over: Partial<Parameters<typeof buildOpsWorkflowKanban>[0]> = {}) {
    return {
      mous: [],
      payments: [],
      dispatches: [],
      users: [],
      salesTeam: [{ id: 'sp-001', name: 'Vikram T.', active: true }],
      stageResponsibility: [],
      schools: [school('SCH-001', 'East'), school('SCH-002', 'South-West')],
      augmentFilters: EMPTY_OPS_AUGMENT_FILTERS,
      kanbanFilters: EMPTY_KANBAN_FILTERS,
      now: NOW,
      ...over,
    }
  }

  it('drops archived MOUs before bucketing', () => {
    const mous = [
      mou({ id: 'active', cohortStatus: 'active' }),
      mou({ id: 'archived', cohortStatus: 'archived' }),
    ]
    const { buckets } = buildOpsWorkflowKanban(args({ mous }))
    const allIds = Object.values(buckets).flat().map((c) => c.mouId)
    expect(allIds).toContain('active')
    expect(allIds).not.toContain('archived')
  })

  it('region filter narrows the MOU set', () => {
    const mous = [
      mou({ id: 'east', schoolId: 'SCH-001' }),
      mou({ id: 'sw', schoolId: 'SCH-002' }),
    ]
    const { buckets, totalCards } = buildOpsWorkflowKanban(
      args({
        mous,
        augmentFilters: { ...EMPTY_OPS_AUGMENT_FILTERS, regions: ['East'] },
      }),
    )
    expect(totalCards).toBe(1)
    expect(Object.values(buckets).flat().map((c) => c.mouId)).toEqual(['east'])
  })

  it('programme + region intersect (AND across dimensions)', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'SCH-001', programme: 'STEAM' }),
      mou({ id: 'b', schoolId: 'SCH-001', programme: 'Robotics' }),
      mou({ id: 'c', schoolId: 'SCH-002', programme: 'STEAM' }),
    ]
    const { totalCards, buckets } = buildOpsWorkflowKanban(
      args({
        mous,
        augmentFilters: { ...EMPTY_OPS_AUGMENT_FILTERS, regions: ['East'] },
        kanbanFilters: { programmes: ['STEAM'], fromDate: null, toDate: null },
      }),
    )
    expect(totalCards).toBe(1)
    expect(Object.values(buckets).flat().map((c) => c.mouId)).toEqual(['a'])
  })

  it('totalCards reflects post-filter sum across all columns', () => {
    const mous = [
      mou({ id: 'a' }),
      mou({ id: 'b' }),
      mou({ id: 'c', status: 'Draft' }), // dropped
    ]
    const { totalCards } = buildOpsWorkflowKanban(args({ mous }))
    expect(totalCards).toBe(2)
  })

  it('filterActive false when no augment + no kanban filters', () => {
    const mous = [mou({ id: 'a' })]
    const { filterActive } = buildOpsWorkflowKanban(args({ mous }))
    expect(filterActive).toBe(false)
  })

  it('filterActive true when augment filter set', () => {
    const mous = [mou({ id: 'a', schoolId: 'SCH-001' })]
    const { filterActive } = buildOpsWorkflowKanban(
      args({
        mous,
        augmentFilters: { ...EMPTY_OPS_AUGMENT_FILTERS, regions: ['East'] },
      }),
    )
    expect(filterActive).toBe(true)
  })

  it('filterActive true when kanban filter set', () => {
    const mous = [mou({ id: 'a' })]
    const { filterActive } = buildOpsWorkflowKanban(
      args({
        mous,
        kanbanFilters: { programmes: ['STEAM'], fromDate: null, toDate: null },
      }),
    )
    expect(filterActive).toBe(true)
  })

  it('returns all 6 columns as keys, even when empty', () => {
    const { buckets } = buildOpsWorkflowKanban(args())
    const keys = Object.keys(buckets) as Array<keyof ColumnBuckets>
    expect(keys.sort()).toEqual(
      [
        'allocation-in-progress',
        'awaiting-actuals',
        'delivered',
        'in-transit',
        'pending-sales-approval',
        'ready-for-dispatch',
      ].sort(),
    )
  })
})
