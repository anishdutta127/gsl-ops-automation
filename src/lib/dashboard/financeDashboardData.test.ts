/*
 * Unit tests for financeDashboardData lib (Gate 4.95 Session 2).
 *
 * Covers: filter parsing, MOU overlap window, VEX OR semantics, KPI
 * strip math, high-priority alerts ranking, top overdue ordering,
 * renewal bucketing, amount receipt window scoping, VEX kit orders
 * roll-up, programme breakdown bar math.
 */

import { describe, it, expect } from 'vitest'
import type {
  Escalation,
  MOU,
  Payment,
  School,
  VexDispatch,
  VexPi,
} from '@/lib/types'
import {
  applyFilters,
  computeAmountReceiptSummary,
  computeHighPriorityAlerts,
  computeKpiStrip,
  computeProgrammeBreakdown,
  computeRenewalNeeded,
  computeTopOverduePayments,
  computeVexKitOrders,
  fyOptionsList,
  fyToRange,
  parseFinanceFilters,
  resolveWindow,
  filterSubtitle,
} from './financeDashboardData'

// ---------------------------------------------------------------------------
// Fixture builders
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
    cohortStatus: 'pre-launch',
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
    received: 25000,
    tds: 0,
    balance: 75000,
    receivedPct: 25,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 180,
    auditLog: [],
    salesChannel: 'School Programs (Course)',
    ...over,
  } as MOU
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
    description: 'Q1 instalment',
    dueDateRaw: '01-Apr-2026',
    dueDateIso: '2026-04-01',
    expectedAmount: 25000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'PI not raised',
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

function escalation(over: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-001',
    createdAt: '2026-05-01T00:00:00Z',
    createdBy: 'anish.d',
    schoolId: 'SCH-001',
    mouId: 'MOU-STEAM-2627-001',
    stage: 'sales',
    lane: 'OPS',
    level: 'L1',
    origin: 'feedback',
    originId: null,
    severity: 'critical',
    description: 'Payment overdue',
    assignedTo: null,
    notifiedEmails: [],
    status: 'Open',
    category: 'Payment Issue',
    type: 'Operational',
    ...over,
  } as Escalation
}

function school(over: Partial<School> = {}): School {
  return {
    id: 'SCH-001',
    name: 'Test School',
    legalEntity: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    region: 'West',
    cluster: null,
    type: 'School',
    active: true,
    notes: null,
    auditLog: [],
    ...over,
  } as unknown as School
}

// ---------------------------------------------------------------------------
// parseFinanceFilters
// ---------------------------------------------------------------------------

describe('parseFinanceFilters', () => {
  it('parses programme + sales channel + fy + from + to from string params', () => {
    const filters = parseFinanceFilters({
      p: 'STEAM,VEX',
      sc: 'Bootcamps',
      fy: '2026-27',
      from: '2026-05-01',
      to: '2026-05-31',
    })
    expect(filters.programmes).toEqual(['STEAM', 'VEX'])
    expect(filters.salesChannels).toEqual(['Bootcamps'])
    expect(filters.fy).toBe('2026-27')
    expect(filters.from).toBe('2026-05-01')
    expect(filters.to).toBe('2026-05-31')
  })

  it('drops unknown programmes and channels silently', () => {
    const filters = parseFinanceFilters({
      p: 'STEAM,Astrophysics',
      sc: 'Bootcamps,NotARealChannel',
    })
    expect(filters.programmes).toEqual(['STEAM'])
    expect(filters.salesChannels).toEqual(['Bootcamps'])
  })

  it('rejects malformed FY + dates', () => {
    const filters = parseFinanceFilters({
      fy: '202627',
      from: '01-04-2026',
      to: '2026-13-99',
    })
    expect(filters.fy).toBeNull()
    expect(filters.from).toBeNull()
    expect(filters.to).toBeNull()
  })

  it('accepts arrays of values (Next.js shape with repeated query params)', () => {
    const filters = parseFinanceFilters({
      p: ['STEAM', 'Robotics'],
    })
    expect(filters.programmes).toEqual(['STEAM', 'Robotics'])
  })

  it('empty searchParams yields the empty filter', () => {
    const filters = parseFinanceFilters({})
    expect(filters.programmes).toEqual([])
    expect(filters.salesChannels).toEqual([])
    expect(filters.fy).toBeNull()
    expect(filters.from).toBeNull()
    expect(filters.to).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fyToRange + resolveWindow + fyOptionsList
// ---------------------------------------------------------------------------

describe('fyToRange', () => {
  it('maps "2026-27" to April-March', () => {
    expect(fyToRange('2026-27')).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    })
  })
  it('returns null for malformed FY', () => {
    expect(fyToRange('202627')).toBeNull()
    expect(fyToRange('2026')).toBeNull()
  })
})

describe('resolveWindow', () => {
  it('prefers explicit from/to over FY', () => {
    expect(
      resolveWindow({
        programmes: [],
        salesChannels: [],
        fy: '2026-27',
        from: '2026-06-01',
        to: '2026-06-30',
      }),
    ).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })
  it('maps FY-only to its range', () => {
    expect(
      resolveWindow({
        programmes: [],
        salesChannels: [],
        fy: '2025-26',
        from: null,
        to: null,
      }),
    ).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })
  it('returns null window when nothing set', () => {
    expect(
      resolveWindow({
        programmes: [],
        salesChannels: [],
        fy: null,
        from: null,
        to: null,
      }),
    ).toEqual({ from: null, to: null })
  })
})

describe('fyOptionsList', () => {
  it('returns distinct FYs across MOUs plus current FY, sorted desc', () => {
    const list = fyOptionsList(
      [mou({ academicYear: '2025-26' }), mou({ academicYear: '2026-27' })],
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(list).toEqual(['2026-27', '2025-26'])
  })
  it('adds current FY when no MOU carries it', () => {
    const list = fyOptionsList(
      [mou({ academicYear: '2024-25' })],
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(list).toContain('2026-27')
    expect(list).toContain('2024-25')
  })
})

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('applyFilters', () => {
  it('no filter set returns everything', () => {
    const m = [mou({ id: 'a' }), mou({ id: 'b', programme: 'Robotics' })]
    const p = [payment({ mouId: 'a' }), payment({ mouId: 'b' })]
    const res = applyFilters({
      mous: m,
      payments: p,
      filters: parseFinanceFilters({}),
    })
    expect(res.filteredMous).toHaveLength(2)
    expect(res.filteredPayments).toHaveLength(2)
  })

  it('programme filter keeps only matching MOUs and their payments', () => {
    const m = [
      mou({ id: 'a', programme: 'STEAM' }),
      mou({ id: 'b', programme: 'Robotics' }),
    ]
    const p = [payment({ mouId: 'a' }), payment({ mouId: 'b' })]
    const res = applyFilters({
      mous: m,
      payments: p,
      filters: parseFinanceFilters({ p: 'STEAM' }),
    })
    expect(res.filteredMous.map((x) => x.id)).toEqual(['a'])
    expect(res.filteredPayments.map((x) => x.mouId)).toEqual(['a'])
  })

  it('VEX chip uses OR across Programme + productSelection (forward-compatible)', () => {
    const vexMou = mou({
      id: 'v',
      programme: 'STEAM',
      productSelection: 'VEX' as unknown as never,
    })
    const steamMou = mou({ id: 's', programme: 'STEAM' })
    const res = applyFilters({
      mous: [vexMou, steamMou],
      payments: [],
      filters: parseFinanceFilters({ p: 'VEX' }),
    })
    expect(res.filteredMous.map((x) => x.id)).toEqual(['v'])
  })

  it('VEX chip combined with STEAM returns both VEX and STEAM rows', () => {
    const vexMou = mou({
      id: 'v',
      programme: 'STEAM',
      productSelection: 'VEX' as unknown as never,
    })
    const steamMou = mou({ id: 's', programme: 'STEAM' })
    const roboticsMou = mou({ id: 'r', programme: 'Robotics' })
    const res = applyFilters({
      mous: [vexMou, steamMou, roboticsMou],
      payments: [],
      filters: parseFinanceFilters({ p: 'STEAM,VEX' }),
    })
    expect(res.filteredMous.map((x) => x.id).sort()).toEqual(['s', 'v'])
  })

  it('sales channel filter excludes mous with unmatched channel', () => {
    const m = [
      mou({ id: 'a', salesChannel: 'School Programs (Course)' }),
      mou({ id: 'b', salesChannel: 'Bootcamps' }),
    ]
    const res = applyFilters({
      mous: m,
      payments: [],
      filters: parseFinanceFilters({ sc: 'Bootcamps' }),
    })
    expect(res.filteredMous.map((x) => x.id)).toEqual(['b'])
  })

  it('MOU overlap window: MOU running April 2026 - March 2027 stays inside a May 2026 window', () => {
    const m = [mou({ startDate: '2026-04-01', endDate: '2027-03-31' })]
    const res = applyFilters({
      mous: m,
      payments: [],
      filters: parseFinanceFilters({ from: '2026-05-01', to: '2026-05-31' }),
    })
    expect(res.filteredMous).toHaveLength(1)
  })

  it('MOU overlap window: MOU ending before window start is excluded', () => {
    const m = [mou({ startDate: '2024-04-01', endDate: '2025-03-31' })]
    const res = applyFilters({
      mous: m,
      payments: [],
      filters: parseFinanceFilters({ from: '2026-05-01', to: '2026-05-31' }),
    })
    expect(res.filteredMous).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computeKpiStrip
// ---------------------------------------------------------------------------

describe('computeKpiStrip', () => {
  const NOW = new Date('2026-05-13T00:00:00Z')

  it('sums contract value across the filtered set and counts schools distinctly', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'S1', contractValue: 100 }),
      mou({ id: 'b', schoolId: 'S1', contractValue: 50 }), // same school
      mou({ id: 'c', schoolId: 'S2', contractValue: 200 }),
    ]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: [],
      filteredMouIds: new Set(['a', 'b', 'c']),
      now: NOW,
    })
    expect(data.contractValue).toBe(350)
    expect(data.schoolsCount).toBe(2)
  })

  it('collectedPct = received / contractValue * 100', () => {
    const mous = [mou({ contractValue: 1000 })]
    const payments = [payment({ receivedAmount: 250 })]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: payments,
      filteredMouIds: new Set(['MOU-STEAM-2627-001']),
      now: NOW,
    })
    expect(data.collectedAmount).toBe(250)
    expect(data.collectedPct).toBe(25)
    expect(data.outstandingAmount).toBe(750)
  })

  it('outstandingSchoolsCount counts distinct schools whose contract value exceeds collected', () => {
    const mous = [
      mou({ id: 'a', schoolId: 'S1', contractValue: 100 }),
      mou({ id: 'b', schoolId: 'S2', contractValue: 200 }),
      mou({ id: 'c', schoolId: 'S3', contractValue: 300 }),
    ]
    const payments = [
      payment({ mouId: 'a', receivedAmount: 100 }), // S1 settled
      payment({ mouId: 'b', receivedAmount: 50 }), // S2 has balance
      // S3: no payment, full balance
    ]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: payments,
      filteredMouIds: new Set(['a', 'b', 'c']),
      now: NOW,
    })
    expect(data.outstandingSchoolsCount).toBe(2)
  })

  it('overduePaymentsCount counts past-due unpaid payments with positive balance', () => {
    const mous = [mou({ id: 'a' })]
    const payments = [
      payment({ id: 'p1', mouId: 'a', dueDateIso: '2026-04-01', expectedAmount: 1000 }), // overdue
      payment({ id: 'p2', mouId: 'a', dueDateIso: '2026-06-01', expectedAmount: 1000 }), // future
      payment({ id: 'p3', mouId: 'a', dueDateIso: '2026-04-01', expectedAmount: 1000, receivedAmount: 1000, status: 'Received' }), // settled
    ]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: payments,
      filteredMouIds: new Set(['a']),
      now: NOW,
    })
    expect(data.overduePaymentsCount).toBe(1)
  })

  it('stalledPiCount counts PIs raised more than 30 days ago without payment', () => {
    const mous = [mou({ id: 'a' })]
    // Pull due dates into the future so the overdue rule does not fire and
    // muddy the stalled-PI assertion.
    const payments = [
      payment({ id: 'p1', mouId: 'a', dueDateIso: '2026-08-01', piGeneratedAt: '2026-04-01T00:00:00Z', receivedDate: null }), // > 30 days
      payment({ id: 'p2', mouId: 'a', dueDateIso: '2026-08-01', piGeneratedAt: '2026-05-10T00:00:00Z', receivedDate: null }), // < 30 days
      payment({ id: 'p3', mouId: 'a', dueDateIso: '2026-08-01', piGeneratedAt: '2026-04-01T00:00:00Z', receivedDate: '2026-04-15', status: 'Received' }), // paid
    ]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: payments,
      filteredMouIds: new Set(['a']),
      now: NOW,
    })
    expect(data.stalledPiCount).toBe(1)
  })

  it('needsAttentionCount counts each payment at most once even when both overdue and stalled', () => {
    const mous = [mou({ id: 'a' })]
    const payments = [
      // Overdue only (no PI raised yet).
      payment({
        id: 'p1', mouId: 'a',
        dueDateIso: '2026-04-01', expectedAmount: 1000,
        piGeneratedAt: null,
      }),
      // Stalled-PI only (due in the future so not overdue).
      payment({
        id: 'p2', mouId: 'a',
        dueDateIso: '2026-08-01', expectedAmount: 1000,
        piGeneratedAt: '2026-04-01T00:00:00Z', receivedDate: null,
      }),
      // Both overdue AND stalled: should count once in needsAttentionCount
      // but increment both subcounts.
      payment({
        id: 'p3', mouId: 'a',
        dueDateIso: '2026-04-01', expectedAmount: 1000,
        piGeneratedAt: '2026-04-01T00:00:00Z', receivedDate: null,
      }),
    ]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: payments,
      filteredMouIds: new Set(['a']),
      now: NOW,
    })
    expect(data.overduePaymentsCount).toBe(2) // p1 + p3
    expect(data.stalledPiCount).toBe(2) // p2 + p3
    expect(data.needsAttentionCount).toBe(3) // p1 + p2 + p3 (p3 once)
  })

  it('zero contract value yields collectedPct = 0', () => {
    const mous = [mou({ contractValue: 0 })]
    const data = computeKpiStrip({
      filteredMous: mous,
      filteredPayments: [payment({ receivedAmount: 100 })],
      filteredMouIds: new Set(['MOU-STEAM-2627-001']),
      now: NOW,
    })
    expect(data.collectedPct).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeHighPriorityAlerts
// ---------------------------------------------------------------------------

describe('computeHighPriorityAlerts', () => {
  it('returns only critical + high, sorted critical-first, capped at limit', () => {
    const escalations = [
      escalation({ id: 'e1', severity: 'medium' }),
      escalation({ id: 'e2', severity: 'high' }),
      escalation({ id: 'e3', severity: 'critical' }),
      escalation({ id: 'e4', severity: 'critical', status: 'Closed' }),
    ]
    const rows = computeHighPriorityAlerts({
      escalations,
      schools: [school()],
      filteredMouIds: new Set(['MOU-STEAM-2627-001']),
    })
    expect(rows.map((r) => r.id)).toEqual(['e3', 'e2'])
  })

  it('caps at the requested limit', () => {
    const escalations = [
      escalation({ id: 'e1', severity: 'critical' }),
      escalation({ id: 'e2', severity: 'critical' }),
      escalation({ id: 'e3', severity: 'critical' }),
      escalation({ id: 'e4', severity: 'critical' }),
      escalation({ id: 'e5', severity: 'critical' }),
    ]
    const rows = computeHighPriorityAlerts({
      escalations,
      schools: [school()],
      filteredMouIds: new Set(['MOU-STEAM-2627-001']),
      limit: 3,
    })
    expect(rows).toHaveLength(3)
  })

  it('excludes escalations tied to a MOU outside the filter set', () => {
    const escalations = [
      escalation({ id: 'e1', mouId: 'out-of-set', severity: 'critical' }),
      escalation({ id: 'e2', mouId: 'in-set', severity: 'critical' }),
      escalation({ id: 'e3', mouId: null, severity: 'critical' }),
    ]
    const rows = computeHighPriorityAlerts({
      escalations,
      schools: [school()],
      filteredMouIds: new Set(['in-set']),
    })
    // e1 dropped; e2 kept; e3 (no mouId) kept.
    expect(rows.map((r) => r.id).sort()).toEqual(['e2', 'e3'])
  })
})

// ---------------------------------------------------------------------------
// computeTopOverduePayments
// ---------------------------------------------------------------------------

describe('computeTopOverduePayments', () => {
  it('keeps only past-due payments with positive balance, sorted by balance desc', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const payments = [
      payment({ id: 'p1', dueDateIso: '2026-04-01', expectedAmount: 1000 }),
      payment({ id: 'p2', dueDateIso: '2026-05-01', expectedAmount: 5000 }),
      payment({ id: 'p3', dueDateIso: '2026-07-01', expectedAmount: 9999 }), // future
      payment({ id: 'p4', dueDateIso: '2026-03-01', expectedAmount: 200 }),
    ]
    const rows = computeTopOverduePayments({ filteredPayments: payments, now })
    expect(rows.map((r) => r.paymentId)).toEqual(['p2', 'p1', 'p4'])
    expect(rows[0].balance).toBe(5000)
  })

  it('drops payments with status Paid or zero balance', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const payments = [
      payment({ id: 'p1', dueDateIso: '2026-04-01', status: 'Paid' }),
      payment({
        id: 'p2',
        dueDateIso: '2026-04-01',
        expectedAmount: 1000,
        receivedAmount: 1000,
      }),
      payment({ id: 'p3', dueDateIso: '2026-04-01', expectedAmount: 1000 }),
    ]
    const rows = computeTopOverduePayments({ filteredPayments: payments, now })
    expect(rows.map((r) => r.paymentId)).toEqual(['p3'])
  })

  it('computes daysOverdue correctly', () => {
    const now = new Date('2026-05-12T00:00:00Z')
    const payments = [payment({ dueDateIso: '2026-04-01', expectedAmount: 1000 })]
    const rows = computeTopOverduePayments({ filteredPayments: payments, now })
    expect(rows[0].daysOverdue).toBe(41)
  })
})

// ---------------------------------------------------------------------------
// computeRenewalNeeded
// ---------------------------------------------------------------------------

describe('computeRenewalNeeded', () => {
  it('buckets expired + expiring-within-30-days, sorted most-expired-first', () => {
    const now = new Date('2026-05-12T00:00:00Z')
    const mous = [
      mou({ id: 'expired', endDate: '2026-04-30', status: 'Active' }),
      mou({ id: 'soon', endDate: '2026-06-01', status: 'Active' }),
      mou({ id: 'far', endDate: '2027-01-01', status: 'Active' }),
    ]
    const { rows, expiredCount, expiringSoonCount } = computeRenewalNeeded({
      filteredMous: mous,
      now,
    })
    expect(rows.map((r) => r.mouId)).toEqual(['expired', 'soon'])
    expect(expiredCount).toBe(1)
    expect(expiringSoonCount).toBe(1)
  })

  it('drops MOUs that are already Renewed or Completed', () => {
    const now = new Date('2026-05-12T00:00:00Z')
    const mous = [
      mou({ id: 'renewed', endDate: '2026-04-30', status: 'Renewed' }),
      mou({ id: 'completed', endDate: '2026-04-30', status: 'Completed' }),
      mou({ id: 'live', endDate: '2026-04-30', status: 'Active' }),
    ]
    const { rows } = computeRenewalNeeded({ filteredMous: mous, now })
    expect(rows.map((r) => r.mouId)).toEqual(['live'])
  })

  it('caps at the requested limit', () => {
    const now = new Date('2026-05-12T00:00:00Z')
    const mous: MOU[] = []
    for (let i = 0; i < 10; i++) {
      mous.push(mou({ id: `m${i}`, endDate: '2026-04-01', status: 'Active' }))
    }
    const { rows } = computeRenewalNeeded({ filteredMous: mous, now, limit: 3 })
    expect(rows).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// computeAmountReceiptSummary
// ---------------------------------------------------------------------------

describe('computeAmountReceiptSummary', () => {
  it('totals due / received within window; pending = max(0, due - received)', () => {
    const payments = [
      // due inside window: counts toward totalDue
      payment({
        id: 'p1',
        dueDateIso: '2026-05-10',
        expectedAmount: 1000,
      }),
      // due before window: excluded from due
      payment({
        id: 'p2',
        dueDateIso: '2026-04-01',
        expectedAmount: 500,
      }),
      // received inside window: counts toward received
      payment({
        id: 'p3',
        dueDateIso: '2026-04-01',
        receivedDate: '2026-05-15',
        receivedAmount: 200,
        expectedAmount: 200,
      }),
    ]
    const data = computeAmountReceiptSummary({
      filteredPayments: payments,
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    expect(data.totalDue).toBe(1000)
    expect(data.received).toBe(200)
    expect(data.pending).toBe(800)
    expect(data.excessAmount).toBe(0)
  })

  it('excessAmount surfaces when receipts exceed dues for the window', () => {
    const payments = [
      payment({
        id: 'p1',
        dueDateIso: '2026-05-10',
        expectedAmount: 1000,
      }),
      payment({
        id: 'p2',
        receivedDate: '2026-05-12',
        receivedAmount: 1500,
        expectedAmount: 1500,
      }),
    ]
    const data = computeAmountReceiptSummary({
      filteredPayments: payments,
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    expect(data.totalDue).toBe(1000)
    expect(data.received).toBe(1500)
    expect(data.excessAmount).toBe(500)
    expect(data.pending).toBe(0)
  })

  it('counts distinct schools with dues in window', () => {
    const payments = [
      payment({ id: 'p1', schoolName: 'A', dueDateIso: '2026-05-10' }),
      payment({ id: 'p2', schoolName: 'A', dueDateIso: '2026-05-15' }),
      payment({ id: 'p3', schoolName: 'B', dueDateIso: '2026-05-20' }),
      payment({ id: 'p4', schoolName: 'C', dueDateIso: '2026-06-01' }), // out
    ]
    const data = computeAmountReceiptSummary({
      filteredPayments: payments,
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    expect(data.schoolsCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// computeVexKitOrders
// ---------------------------------------------------------------------------

function vexPi(over: Partial<VexPi> = {}): VexPi {
  return {
    id: 'VEXPI-MH-2627-001',
    piNumber: 'MTPL/MH/2627/0001',
    entityKey: 'MH',
    issueDate: '2026-05-10',
    schoolName: 'Test',
    shippingAddress: '',
    billingName: '',
    billingAddress: '',
    schoolGstNumber: null,
    contactPerson: '',
    contactNo: '',
    lineItems: [],
    subtotal: 0,
    freightCharges: 0,
    taxableValue: 0,
    gstPct: 0.18,
    gstAmount: 0,
    total: 100000,
    status: 'Generated',
    generatedBy: 'anish.d',
    generatedAt: '2026-05-10T00:00:00Z',
    paymentReceivedAmount: 0,
    paymentLogIds: [],
    notes: null,
    auditLog: [],
    ...over,
  } as VexPi
}

function vexDispatch(over: Partial<VexDispatch> = {}): VexDispatch {
  return {
    id: 'VEXD-MH-2627-001',
    piId: 'VEXPI-MH-2627-001',
    items: [],
    freight: 0,
    mode: 'Surface',
    status: 'Requested',
    requestedBy: 'anish.d',
    requestedAt: '2026-05-12T00:00:00Z',
    taxInvoiceNumber: null,
    taxInvoicePath: null,
    invoicedAt: null,
    notes: null,
    supportingDocPath: null,
    warehouseEmailSentAt: null,
    warehouseEmailSentBy: null,
    auditLog: [],
    ...over,
  } as VexDispatch
}

describe('computeVexKitOrders', () => {
  it('counts PIs + schools + pipeline in window', () => {
    const pis = [
      vexPi({ id: 'p1', schoolName: 'A', total: 100000, issueDate: '2026-05-10' }),
      vexPi({ id: 'p2', schoolName: 'A', total: 50000, issueDate: '2026-05-20' }),
      vexPi({ id: 'p3', schoolName: 'B', total: 200000, issueDate: '2026-05-15' }),
      vexPi({ id: 'p4', schoolName: 'C', total: 999, issueDate: '2026-06-15' }), // out
    ]
    const data = computeVexKitOrders({
      vexPis: pis,
      vexDispatches: [],
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    expect(data.piCount).toBe(3)
    expect(data.vexSchools).toBe(2)
    expect(data.totalPipeline).toBe(350000)
  })

  it('pendingDispatch counts PIs with payment received but no Shipped dispatch', () => {
    const pis = [
      vexPi({ id: 'p1', total: 100, paymentReceivedAmount: 100, issueDate: '2026-05-10' }),
      vexPi({ id: 'p2', total: 100, paymentReceivedAmount: 100, issueDate: '2026-05-11' }),
      vexPi({ id: 'p3', total: 100, paymentReceivedAmount: 0, issueDate: '2026-05-12' }),
    ]
    const dispatches = [
      vexDispatch({ id: 'd1', piId: 'p1', status: 'Shipped' }),
      vexDispatch({ id: 'd2', piId: 'p2', status: 'Invoiced' }),
    ]
    const data = computeVexKitOrders({
      vexPis: pis,
      vexDispatches: dispatches,
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    // p1 has Shipped (out), p2 is Invoiced (pending), p3 has no payment (out)
    expect(data.pendingDispatch).toBe(1)
  })

  it('salesInvoiceAmount sums PI totals where the linked dispatch is Invoiced or Shipped', () => {
    const pis = [
      vexPi({ id: 'p1', total: 100, issueDate: '2026-05-10' }),
      vexPi({ id: 'p2', total: 200, issueDate: '2026-05-15' }),
      vexPi({ id: 'p3', total: 300, issueDate: '2026-05-20' }),
    ]
    const dispatches = [
      vexDispatch({ id: 'd1', piId: 'p1', status: 'Shipped' }),
      vexDispatch({ id: 'd2', piId: 'p2', status: 'Invoiced' }),
      vexDispatch({ id: 'd3', piId: 'p3', status: 'Requested' }), // not yet
    ]
    const data = computeVexKitOrders({
      vexPis: pis,
      vexDispatches: dispatches,
      windowFrom: '2026-05-01',
      windowTo: '2026-05-31',
    })
    expect(data.salesInvoiceAmount).toBe(300)
  })
})

// ---------------------------------------------------------------------------
// computeProgrammeBreakdown
// ---------------------------------------------------------------------------

describe('computeProgrammeBreakdown', () => {
  it('returns one row per programme, bar pct relative to the max MOU count', () => {
    const mous = [
      mou({ id: 'a', programme: 'STEAM', contractValue: 100, studentsActual: 50 }),
      mou({ id: 'b', programme: 'STEAM', contractValue: 200, studentsActual: 60 }),
      mou({ id: 'c', programme: 'Robotics', contractValue: 50, studentsActual: 30 }),
    ]
    const rows = computeProgrammeBreakdown(mous)
    expect(rows).toHaveLength(4)
    const steam = rows.find((r) => r.programme === 'STEAM')!
    expect(steam.mouCount).toBe(2)
    expect(steam.studentsCount).toBe(110)
    expect(steam.contractValue).toBe(300)
    expect(steam.barPct).toBe(100)
    const robotics = rows.find((r) => r.programme === 'Robotics')!
    expect(robotics.barPct).toBe(50)
    const yp = rows.find((r) => r.programme === 'Young Pioneers')!
    expect(yp.barPct).toBe(0)
  })

  it('falls back to studentsMou when studentsActual is null', () => {
    const mous = [mou({ programme: 'STEAM', studentsActual: null, studentsMou: 75 })]
    const rows = computeProgrammeBreakdown(mous)
    expect(rows.find((r) => r.programme === 'STEAM')!.studentsCount).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// filterSubtitle
// ---------------------------------------------------------------------------

describe('filterSubtitle', () => {
  it('renders "As of YYYY-MM-DD" when nothing filtered', () => {
    const subtitle = filterSubtitle(parseFinanceFilters({}), new Date('2026-05-12T00:00:00Z'))
    expect(subtitle).toBe('As of 2026-05-12')
  })
  it('renders a comma-joined filter summary', () => {
    const subtitle = filterSubtitle(
      parseFinanceFilters({ p: 'STEAM,Robotics', fy: '2026-27' }),
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(subtitle).toContain('STEAM / Robotics')
    expect(subtitle).toContain('FY 2026-27')
    expect(subtitle.startsWith('Filtered view:')).toBe(true)
  })
})
