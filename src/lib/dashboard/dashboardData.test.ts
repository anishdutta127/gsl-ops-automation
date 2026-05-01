import { describe, expect, it } from 'vitest'
import {
  buildActionCenter,
  buildOrdersTracker,
  buildRecentMouUpdates,
  buildSalesPipelineSummary,
  buildStatCards,
  COMMUNICATION_BUTTONS,
  COMMUNICATION_TEMPLATE_PREVIEWS,
  computeSlices,
  fiscalYearOptions,
  isDelayed,
  parseDashboardFilters,
} from './dashboardData'
import type {
  Dispatch,
  DispatchRequest,
  Escalation,
  InventoryItem,
  MOU,
  SalesOpportunity,
  SalesPerson,
  School,
} from '@/lib/types'

const FIXED_NOW = new Date('2026-05-08T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Test School',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 500000, received: 0, tds: 0, balance: 500000,
    receivedPct: 0, paymentSchedule: '25-25-25-25', trainerModel: 'GSL-T',
    salesPersonId: null, templateVersion: null, generatedAt: null,
    notes: null, delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Test', legalEntity: null, city: 'Pune',
    state: 'MH', region: 'South-West', pinCode: null, contactPerson: null,
    email: null, phone: null, billingName: null, pan: null,
    gstNumber: null, notes: null, active: true,
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
    ...overrides,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DSP-X', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
    stage: 'po-raised', installment1Paid: true, overrideEvent: null,
    poRaisedAt: '2026-04-20T10:00:00Z', dispatchedAt: '2026-04-21T10:00:00Z',
    deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
    notes: null, lineItems: [{ kind: 'flat', skuName: 'X', quantity: 1 }],
    requestId: null, raisedBy: 'u', raisedFrom: 'ops-direct', auditLog: [],
    ...overrides,
  }
}

function esc(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-X', createdAt: '2026-04-01T00:00:00Z', createdBy: 'u',
    schoolId: 'SCH-X', mouId: 'MOU-X', stage: 'kit-dispatch',
    lane: 'OPS', level: 'L1', origin: 'manual', originId: null,
    severity: 'medium', description: '', assignedTo: null,
    notifiedEmails: [], status: 'Open', category: null, type: null,
    resolutionNotes: null, resolvedAt: null, resolvedBy: null, auditLog: [],
    ...overrides,
  }
}

function inv(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-X', skuName: 'Test', category: 'Other', cretileGrade: null,
    mastersheetSourceName: null, currentStock: 100, reorderThreshold: null,
    notes: null, active: true, lastUpdatedAt: '2026-04-01T00:00:00Z',
    lastUpdatedBy: 'u', auditLog: [],
    ...overrides,
  }
}

describe('parseDashboardFilters', () => {
  it('returns nulls when sp empty', () => {
    expect(parseDashboardFilters({})).toEqual({
      fiscalYear: null, programme: null, fromDate: null, toDate: null,
    })
  })

  it('extracts valid fiscalYear', () => {
    expect(parseDashboardFilters({ fiscalYear: '2026-27' }).fiscalYear).toBe('2026-27')
  })

  it('treats fiscalYear=all as null filter', () => {
    expect(parseDashboardFilters({ fiscalYear: 'all' }).fiscalYear).toBeNull()
  })

  it('rejects invalid programme', () => {
    expect(parseDashboardFilters({ programme: 'Bootcamps' }).programme).toBeNull()
  })

  it('accepts valid programme', () => {
    expect(parseDashboardFilters({ programme: 'STEAM' }).programme).toBe('STEAM')
  })

  it('parses ISO date strings', () => {
    const f = parseDashboardFilters({ fromDate: '2026-01-01', toDate: '2026-05-08' })
    expect(f.fromDate).toBe('2026-01-01')
    expect(f.toDate).toBe('2026-05-08')
  })

  it('rejects malformed dates', () => {
    const f = parseDashboardFilters({ fromDate: 'today', toDate: '2026/05/08' })
    expect(f.fromDate).toBeNull()
    expect(f.toDate).toBeNull()
  })
})

describe('computeSlices', () => {
  it('drops archived MOUs even when they match other filters', () => {
    const archived = mou({ id: 'M1', cohortStatus: 'archived' })
    const active = mou({ id: 'M2' })
    const slices = computeSlices({
      mous: [archived, active], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    expect(slices.filteredMous.map((m) => m.id)).toEqual(['M2'])
  })

  it('filters by fiscalYear', () => {
    const a = mou({ id: 'M1', academicYear: '2026-27' })
    const b = mou({ id: 'M2', academicYear: '2025-26' })
    const slices = computeSlices({
      mous: [a, b], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: '2026-27', programme: null, fromDate: null, toDate: null },
    })
    expect(slices.filteredMous.map((m) => m.id)).toEqual(['M1'])
  })

  it('filters by programme', () => {
    const steam = mou({ id: 'M1', programme: 'STEAM' })
    const tink = mou({ id: 'M2', programme: 'TinkRworks' })
    const slices = computeSlices({
      mous: [steam, tink], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: 'TinkRworks', fromDate: null, toDate: null },
    })
    expect(slices.filteredMous.map((m) => m.id)).toEqual(['M2'])
  })

  it('filters by date range against MOU.startDate', () => {
    const inRange = mou({ id: 'M1', startDate: '2026-04-15' })
    const outOfRange = mou({ id: 'M2', startDate: '2025-12-01' })
    const slices = computeSlices({
      mous: [inRange, outOfRange], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: '2026-01-01', toDate: '2026-05-08' },
    })
    expect(slices.filteredMous.map((m) => m.id)).toEqual(['M1'])
  })

  it('dispatches inherit MOU filter scope', () => {
    const m1 = mou({ id: 'M1' })
    const m2 = mou({ id: 'M2', programme: 'TinkRworks' })
    const d1 = dispatch({ id: 'D1', mouId: 'M1' })
    const d2 = dispatch({ id: 'D2', mouId: 'M2' })
    const slices = computeSlices({
      mous: [m1, m2], schools: [], dispatches: [d1, d2], escalations: [],
      filters: { fiscalYear: null, programme: 'STEAM', fromDate: null, toDate: null },
    })
    expect(slices.filteredDispatches.map((d) => d.id)).toEqual(['D1'])
  })
})

describe('isDelayed', () => {
  it('flags dispatched > 7d ago without ack', () => {
    const d = dispatch({ dispatchedAt: '2026-04-25T10:00:00Z', acknowledgedAt: null })
    expect(isDelayed(d, FIXED_NOW)).toBe(true)
  })

  it('does not flag if acknowledged', () => {
    const d = dispatch({ dispatchedAt: '2026-04-25T10:00:00Z', acknowledgedAt: '2026-05-01T00:00:00Z' })
    expect(isDelayed(d, FIXED_NOW)).toBe(false)
  })

  it('does not flag if dispatched within 7d', () => {
    const d = dispatch({ dispatchedAt: '2026-05-05T10:00:00Z', acknowledgedAt: null })
    expect(isDelayed(d, FIXED_NOW)).toBe(false)
  })

  it('does not flag if dispatchedAt is null', () => {
    const d = dispatch({ dispatchedAt: null, acknowledgedAt: null })
    expect(isDelayed(d, FIXED_NOW)).toBe(false)
  })
})

describe('buildStatCards', () => {
  it('returns 6 cards in fixed order', () => {
    const slices = computeSlices({
      mous: [], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const cards = buildStatCards({ slices, schools: [], inventoryItems: [], now: FIXED_NOW })
    expect(cards.map((c) => c.key)).toEqual([
      'mou-registry', 'active-schools', 'orders-raised',
      'track-shipment', 'escalations', 'inventory',
    ])
  })

  it('MOU Registry counts pending signature in subtitle', () => {
    const m1 = mou({ id: 'M1', status: 'Active' })
    const m2 = mou({ id: 'M2', status: 'Pending Signature' })
    const slices = computeSlices({
      mous: [m1, m2], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const [registry] = buildStatCards({ slices, schools: [], inventoryItems: [], now: FIXED_NOW })
    expect(registry!.primary).toBe(2)
    expect(registry!.subtitle).toBe('1 pending signature')
  })

  it('Escalations card uses red CTA variant + counts high priority', () => {
    const e1 = esc({ id: 'E1', status: 'Open', severity: 'high' })
    const e2 = esc({ id: 'E2', status: 'Open', severity: 'medium' })
    const e3 = esc({ id: 'E3', status: 'Closed', severity: 'high' })
    const slices = computeSlices({
      mous: [mou()], schools: [], dispatches: [], escalations: [e1, e2, e3],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const cards = buildStatCards({ slices, schools: [], inventoryItems: [], now: FIXED_NOW })
    const escalations = cards.find((c) => c.key === 'escalations')!
    expect(escalations.primary).toBe(2)
    expect(escalations.subtitle).toBe('1 High Priority')
    expect(escalations.ctaVariant).toBe('alert')
  })

  it('Inventory totals are summed across items + low-stock counted', () => {
    const i1 = inv({ id: 'I1', currentStock: 100, reorderThreshold: 10 })
    const i2 = inv({ id: 'I2', currentStock: 5, reorderThreshold: 10 })
    const i3 = inv({ id: 'I3', currentStock: 50, reorderThreshold: null })
    const slices = computeSlices({
      mous: [], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const cards = buildStatCards({ slices, schools: [], inventoryItems: [i1, i2, i3], now: FIXED_NOW })
    const inventory = cards.find((c) => c.key === 'inventory')!
    expect(inventory.primary).toBe('155')   // 100 + 5 + 50
    expect(inventory.subtitle).toBe('1 Low Stock')   // only i2 (i3 has null threshold)
  })

  it('Active Schools subtitle counts schools added this calendar month', () => {
    const m = mou({ id: 'M1', status: 'Active', schoolId: 'SCH-1' })
    const s1 = school({ id: 'SCH-1', createdAt: '2026-05-03T10:00:00Z' })
    const slices = computeSlices({
      mous: [m], schools: [s1], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const cards = buildStatCards({ slices, schools: [s1], inventoryItems: [], now: FIXED_NOW })
    const active = cards.find((c) => c.key === 'active-schools')!
    expect(active.primary).toBe(1)
    expect(active.subtitle).toBe('1 added this month')
  })
})

function rep(id: string, name: string): SalesPerson {
  return {
    id, name, email: `${id}@x.test`, phone: null, territories: [],
    programmes: [], active: true, joinedDate: '2026-01-01',
  }
}

function dispatchRequest(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    id: 'DR-X', mouId: 'MOU-X', schoolId: 'SCH-X', requestedBy: 'sp-x',
    requestedAt: '2026-04-01T00:00:00Z', requestReason: '', installmentSeq: 1,
    lineItems: [], status: 'pending-approval', conversionDispatchId: null,
    rejectionReason: null, reviewedBy: null, reviewedAt: null,
    notes: null, auditLog: [],
    ...overrides,
  }
}

describe('buildRecentMouUpdates', () => {
  it('sorts MOUs by latest auditLog timestamp desc', () => {
    const m1 = mou({
      id: 'M1', auditLog: [{ timestamp: '2026-04-10T00:00:00Z', user: 'u', action: 'create' }],
    })
    const m2 = mou({
      id: 'M2', auditLog: [{ timestamp: '2026-04-25T00:00:00Z', user: 'u', action: 'update' }],
    })
    const slices = computeSlices({
      mous: [m1, m2], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildRecentMouUpdates({ slices, salesTeam: [] })
    expect(rows.map((r) => r.mouId)).toEqual(['M2', 'M1'])
  })

  it('limits to 6 rows by default', () => {
    const mous = Array.from({ length: 10 }, (_, i) => mou({
      id: `M${i}`,
      auditLog: [{ timestamp: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`, user: 'u', action: 'create' }],
    }))
    const slices = computeSlices({
      mous, schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildRecentMouUpdates({ slices, salesTeam: [] })
    expect(rows).toHaveLength(6)
  })

  it('respects custom limit', () => {
    const m1 = mou({ id: 'M1' })
    const m2 = mou({ id: 'M2' })
    const slices = computeSlices({
      mous: [m1, m2], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    expect(buildRecentMouUpdates({ slices, salesTeam: [], limit: 1 })).toHaveLength(1)
  })

  it('resolves owner name + initials from sales rep id', () => {
    const m = mou({ id: 'M1', salesPersonId: 'sp-r' })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildRecentMouUpdates({ slices, salesTeam: [rep('sp-r', 'Roveena Mendes')] })
    expect(rows[0]!.ownerName).toBe('Roveena Mendes')
    expect(rows[0]!.ownerInitials).toBe('RM')
  })

  it('falls back to "unassigned" when salesPersonId is null', () => {
    const m = mou({ id: 'M1', salesPersonId: null })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildRecentMouUpdates({ slices, salesTeam: [] })
    expect(rows[0]!.ownerName).toBe('unassigned')
  })

  it('captures the most recent action label', () => {
    const m = mou({
      id: 'M1', auditLog: [
        { timestamp: '2026-04-10T00:00:00Z', user: 'u', action: 'create' },
        { timestamp: '2026-04-25T00:00:00Z', user: 'u', action: 'pi-issued' },
      ],
    })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildRecentMouUpdates({ slices, salesTeam: [] })
    expect(rows[0]!.lastAction).toBe('pi-issued')
    expect(rows[0]!.updateDate).toBe('2026-04-25')
  })
})

describe('buildActionCenter', () => {
  it('returns 5 tiles in fixed order', () => {
    const slices = computeSlices({
      mous: [], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const data = buildActionCenter({
      slices, dispatchRequests: [], inventoryItems: [], now: FIXED_NOW,
    })
    expect(data.tiles.map((t) => t.key)).toEqual([
      'pending-signature', 'orders-awaiting-approval', 'shipments-delayed',
      'escalations-unresolved', 'inventory-low-stock',
    ])
  })

  it('totalOpen sums tile counts', () => {
    const m1 = mou({ id: 'M1', status: 'Pending Signature' })
    const m2 = mou({ id: 'M2', status: 'Pending Signature' })
    const e1 = esc({ id: 'E1', status: 'Open', mouId: 'M1' })
    const slices = computeSlices({
      mous: [m1, m2], schools: [], dispatches: [], escalations: [e1],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const data = buildActionCenter({
      slices,
      dispatchRequests: [
        dispatchRequest({ id: 'DR1' }), dispatchRequest({ id: 'DR2' }),
      ],
      inventoryItems: [
        inv({ id: 'I1', currentStock: 5, reorderThreshold: 10 }),
      ],
      now: FIXED_NOW,
    })
    // 2 pending-sig + 2 orders-awaiting + 0 delayed + 1 esc + 1 low-stock = 6
    expect(data.totalOpen).toBe(6)
  })

  it('singular vs plural label flip', () => {
    const m = mou({ status: 'Pending Signature' })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const data = buildActionCenter({
      slices, dispatchRequests: [], inventoryItems: [], now: FIXED_NOW,
    })
    expect(data.tiles[0]!.label).toBe('MOU pending signature')
  })
})

describe('buildOrdersTracker', () => {
  it('maps stage -> order/shipment status correctly', () => {
    const m = mou({ id: 'M1' })
    const sch = school({ id: 'SCH-X' })
    const dPending = dispatch({ id: 'D-PENDING', mouId: 'M1', stage: 'pending' })
    const dShipped = dispatch({
      id: 'D-SHIPPED', mouId: 'M1', stage: 'dispatched',
      dispatchedAt: '2026-05-05T00:00:00Z',  // recent, within 7d
    })
    const dDelivered = dispatch({ id: 'D-DELIVERED', mouId: 'M1', stage: 'delivered' })
    const slices = computeSlices({
      mous: [m], schools: [sch], dispatches: [dPending, dShipped, dDelivered], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildOrdersTracker({ slices, schools: [sch], mous: [m], now: FIXED_NOW })
    const byId = new Map(rows.map((r) => [r.dispatchId, r]))
    expect(byId.get('D-PENDING')!.shipmentStatus).toBe('packed')
    expect(byId.get('D-SHIPPED')!.shipmentStatus).toBe('shipped')
    expect(byId.get('D-DELIVERED')!.shipmentStatus).toBe('delivered')
  })

  it('flags delayed shipment when isDelayed trips', () => {
    const m = mou({ id: 'M1' })
    const d = dispatch({
      id: 'D-OLD', mouId: 'M1', stage: 'dispatched',
      dispatchedAt: '2026-04-25T00:00:00Z',  // > 7d before FIXED_NOW
      acknowledgedAt: null,
    })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [d], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildOrdersTracker({ slices, schools: [], mous: [m], now: FIXED_NOW })
    expect(rows[0]!.shipmentStatus).toBe('delayed')
  })

  it('joins school name via schoolId', () => {
    const m = mou({ id: 'M1', schoolId: 'SCH-X' })
    const s = school({ id: 'SCH-X', name: 'Greenwood Intl' })
    const d = dispatch({ id: 'D-X', mouId: 'M1', schoolId: 'SCH-X' })
    const slices = computeSlices({
      mous: [m], schools: [s], dispatches: [d], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildOrdersTracker({ slices, schools: [s], mous: [m], now: FIXED_NOW })
    expect(rows[0]!.schoolName).toBe('Greenwood Intl')
  })

  it('falls back to programme label when lineItem is the legacy placeholder', () => {
    const m = mou({ id: 'M1', programme: 'STEAM' })
    const d = dispatch({
      id: 'D-X', mouId: 'M1',
      lineItems: [{ kind: 'flat', skuName: 'Legacy single-line item (pre-W4-D)', quantity: 1 }],
    })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [d], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildOrdersTracker({ slices, schools: [], mous: [m], now: FIXED_NOW })
    expect(rows[0]!.product).toBe('STEAM kit')
  })

  it('honours custom limit', () => {
    const m = mou({ id: 'M1' })
    const ds = Array.from({ length: 12 }, (_, i) => dispatch({ id: `D${i}`, mouId: 'M1' }))
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: ds, escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    expect(buildOrdersTracker({ slices, schools: [], mous: [m], now: FIXED_NOW, limit: 3 })).toHaveLength(3)
  })

  it('Action href targets /mous/[id]/dispatch when MOU is set', () => {
    const m = mou({ id: 'M1' })
    const d = dispatch({ id: 'D-X', mouId: 'M1' })
    const slices = computeSlices({
      mous: [m], schools: [], dispatches: [d], escalations: [],
      filters: { fiscalYear: null, programme: null, fromDate: null, toDate: null },
    })
    const rows = buildOrdersTracker({ slices, schools: [], mous: [m], now: FIXED_NOW })
    expect(rows[0]!.href).toBe('/mous/M1/dispatch')
  })
})

describe('COMMUNICATION_BUTTONS', () => {
  it('exposes 3 buttons in fixed order with valid variants', () => {
    expect(COMMUNICATION_BUTTONS.map((b) => b.key)).toEqual(['welcome', 'thank-you', 'follow-up'])
    expect(COMMUNICATION_BUTTONS.map((b) => b.variant)).toEqual(['navy', 'teal', 'outline'])
  })

  it('every href links to /admin/templates with a useCase', () => {
    for (const b of COMMUNICATION_BUTTONS) {
      expect(b.href).toMatch(/^\/admin\/templates\?useCase=/)
    }
  })
})

function opp(overrides: Partial<SalesOpportunity> = {}): SalesOpportunity {
  return {
    id: 'OPP-X', schoolName: 'X', schoolId: null, city: 'P', state: 'M',
    region: 'South-West', salesRepId: 'sp-x', programmeProposed: null,
    gslModel: null, commitmentsMade: null, outOfScopeRequirements: null,
    recceStatus: null, recceCompletedAt: null, status: 'open',
    approvalNotes: null, conversionMouId: null, lossReason: null,
    schoolMatchDismissed: false, createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u', auditLog: [],
    ...overrides,
  }
}

describe('buildSalesPipelineSummary', () => {
  it('counts opportunities total + this-month + converted + lost', () => {
    const opps = [
      opp({ id: 'O1', createdAt: '2026-05-03T00:00:00Z' }),                      // this month
      opp({ id: 'O2', createdAt: '2026-05-07T00:00:00Z', conversionMouId: 'M' }), // this month + converted
      opp({ id: 'O3', createdAt: '2026-04-01T00:00:00Z', lossReason: 'price' }),  // lost
      opp({ id: 'O4', createdAt: '2026-03-15T00:00:00Z' }),
    ]
    const summary = buildSalesPipelineSummary({ opportunities: opps, now: FIXED_NOW })
    expect(summary.totalOpportunities).toBe(4)
    expect(summary.addedThisMonth).toBe(2)
    expect(summary.converted).toBe(1)
    expect(summary.lost).toBe(1)
  })

  it('returns zeros for empty input', () => {
    const summary = buildSalesPipelineSummary({ opportunities: [], now: FIXED_NOW })
    expect(summary).toEqual({
      totalOpportunities: 0, addedThisMonth: 0, converted: 0, lost: 0,
    })
  })
})

describe('COMMUNICATION_TEMPLATE_PREVIEWS', () => {
  it('exposes welcome + thank-you previews with edit hrefs', () => {
    expect(COMMUNICATION_TEMPLATE_PREVIEWS.map((t) => t.key)).toEqual([
      'welcome', 'thank-you',
    ])
    for (const t of COMMUNICATION_TEMPLATE_PREVIEWS) {
      expect(t.editHref).toMatch(/^\/admin\/templates\?useCase=/)
      expect(t.preview.length).toBeGreaterThan(10)
    }
  })
})

describe('fiscalYearOptions', () => {
  it('returns distinct values sorted desc', () => {
    const mous = [
      mou({ academicYear: '2024-25' }),
      mou({ academicYear: '2026-27' }),
      mou({ academicYear: '2025-26' }),
      mou({ academicYear: '2026-27' }),
    ]
    expect(fiscalYearOptions(mous)).toEqual(['2026-27', '2025-26', '2024-25'])
  })

  it('returns empty array when no MOUs', () => {
    expect(fiscalYearOptions([])).toEqual([])
  })
})
