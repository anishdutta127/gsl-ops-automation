/*
 * Tests for the consolidated landing data helpers (Gate 3.6 Step 5).
 *
 * Each compute function is exercised against deterministic fixtures
 * so a `now` snapshot drives every "X days ago / overdue" branch.
 */

import { describe, expect, it } from 'vitest'
import {
  computeCommercialPosition,
  computeLandingAttention,
  computeOperationalPosition,
  computeTileSlices,
  currentFiscalYear,
} from './landingData'
import type {
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
} from '@/lib/types'

const NOW = new Date('2026-05-11T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-A',
    schoolId: 'SCH-A',
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
    spWithoutTax: 4000,
    spWithTax: 5000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-A',
    name: 'Test School',
    legalEntity: null,
    city: 'Pune',
    state: 'MH',
    region: 'South-West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-A-i1',
    mouId: 'MOU-A',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 125000,
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
    ...overrides,
  }
}

function paymentLog(overrides: Partial<PaymentLog> = {}): PaymentLog {
  return {
    id: 'PL-1',
    date: '2026-05-01',
    amount: 50000,
    mode: 'Bank Transfer',
    reference: null,
    narration: null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: true,
    loggedBy: 'u',
    loggedAt: '2026-05-01T00:00:00Z',
    notes: null,
    ...overrides,
  }
}

function escalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-1',
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'u',
    schoolId: 'SCH-A',
    mouId: 'MOU-A',
    stage: 'kit-dispatch',
    lane: 'OPS',
    level: 'L1',
    origin: 'manual',
    originId: null,
    severity: 'critical',
    description: 'Kit not received',
    assignedTo: null,
    notifiedEmails: [],
    status: 'Open',
    category: null,
    type: null,
    waitingOn: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [],
    ...overrides,
  }
}

function kitDispatch(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-A',
    mouId: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'Test School',
    productSelected: 'Cretile',
    dispatchStatus: 'Pending',
    allocations: [{ grade: 5, students: 30, kitsQty: 30, kitType: 'Consumable', productName: 'Cretile Grade-band kit Grade 5' } as KitDispatch['allocations'][number]],
    salesApprovalStatus: 'Pending',
    salesApprovedBy: null,
    salesApprovedAt: null,
    salesRejectionReason: null,
    dispatchSummary: null,
    shipmentTracking: null,
    pod: null,
    auditLog: [],
    createdAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeCommercialPosition', () => {
  it('sums chosen-FY contract value + prior FY delta', () => {
    const mous = [
      mou({ id: 'M-1', academicYear: '2026-27', contractValue: 1000000 }),
      mou({ id: 'M-2', academicYear: '2026-27', contractValue: 2000000 }),
      mou({ id: 'M-3', academicYear: '2025-26', contractValue: 2000000 }),
    ]
    const result = computeCommercialPosition({
      mous,
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    expect(result.signedContractValueFy).toBe(3000000)
    expect(result.signedContractValuePriorFy).toBe(2000000)
    expect(result.signedContractValueDeltaPct).toBeCloseTo(50, 0)
  })

  it('returns null delta when prior FY is zero', () => {
    const mous = [mou({ id: 'M-1', academicYear: '2026-27', contractValue: 1000000 })]
    const result = computeCommercialPosition({
      mous,
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    expect(result.signedContractValueDeltaPct).toBeNull()
  })

  it('computes received, collection %, outstanding from FY payments only', () => {
    const mous = [
      mou({ id: 'M-1', academicYear: '2026-27', contractValue: 1000000 }),
      mou({ id: 'M-2', academicYear: '2025-26', contractValue: 500000 }),
    ]
    const payments = [
      payment({ id: 'P-1', mouId: 'M-1', receivedAmount: 250000, receivedDate: '2026-04-20' }),
      payment({ id: 'P-2', mouId: 'M-2', receivedAmount: 100000, receivedDate: '2026-03-15' }),
    ]
    const result = computeCommercialPosition({
      mous,
      payments,
      fy: '2026-27',
      now: NOW,
    })
    expect(result.receivedFy).toBe(250000)
    expect(result.collectionPct).toBeCloseTo(25, 1)
    expect(result.outstanding).toBe(750000)
  })

  it('returns 12 monthly receipt buckets oldest-first', () => {
    const result = computeCommercialPosition({
      mous: [],
      payments: [
        payment({ receivedDate: '2026-05-01', receivedAmount: 100 }),
        payment({ receivedDate: '2025-08-01', receivedAmount: 50 }),
      ],
      fy: '2026-27',
      now: NOW,
    })
    expect(result.monthlyReceipts).toHaveLength(12)
    const first = result.monthlyReceipts[0]!
    const last = result.monthlyReceipts[11]!
    expect(first.month < last.month).toBe(true)
    const may = result.monthlyReceipts.find((m) => m.month === '2026-05')
    expect(may?.amount).toBe(100)
  })

  it('counts distinct active schools in chosen FY', () => {
    const mous = [
      mou({ id: 'M-1', schoolId: 'S-1', academicYear: '2026-27', status: 'Active' }),
      mou({ id: 'M-2', schoolId: 'S-1', academicYear: '2026-27', status: 'Active' }), // duplicate school
      mou({ id: 'M-3', schoolId: 'S-2', academicYear: '2026-27', status: 'Active' }),
      mou({ id: 'M-4', schoolId: 'S-3', academicYear: '2026-27', status: 'Completed' }),
    ]
    const result = computeCommercialPosition({
      mous,
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    expect(result.activeSchools).toBe(2)
  })
})

describe('computeOperationalPosition', () => {
  it('counts active dispatches and in-transit subset', () => {
    const dispatches = [
      kitDispatch({ id: 'D-1', mouId: 'M-1', dispatchStatus: 'Pending' }),
      kitDispatch({ id: 'D-2', mouId: 'M-2', dispatchStatus: 'In Transit' }),
      kitDispatch({ id: 'D-3', mouId: 'M-3', dispatchStatus: 'In Transit' }),
      kitDispatch({ id: 'D-4', mouId: 'M-4', dispatchStatus: 'Delivered' }),
    ]
    const result = computeOperationalPosition({
      mous: [],
      dispatches,
      payments: [],
      now: NOW,
    })
    expect(result.activeDispatches).toBe(3)
    expect(result.inTransit).toBe(2)
  })

  it('counts Active MOUs without allocations as pendingAllocation', () => {
    const mous = [
      mou({ id: 'M-1', status: 'Active' }),
      mou({ id: 'M-2', status: 'Active' }),
      mou({ id: 'M-3', status: 'Active' }),
      mou({ id: 'M-4', status: 'Completed' }),
    ]
    const dispatches = [
      kitDispatch({ id: 'D-1', mouId: 'M-1', allocations: [{ grade: 5, students: 30, kitsQty: 30, kitType: 'Consumable', productName: 'Cretile Grade-band kit Grade 5' } as KitDispatch['allocations'][number]] }),
      kitDispatch({ id: 'D-2', mouId: 'M-2', allocations: [] }),
    ]
    const result = computeOperationalPosition({
      mous,
      dispatches,
      payments: [],
      now: NOW,
    })
    expect(result.pendingAllocation).toBe(2) // M-2 (empty alloc) + M-3 (no record)
  })

  it('returns zero counts on empty inputs', () => {
    const result = computeOperationalPosition({
      mous: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(result.activeDispatches).toBe(0)
    expect(result.inTransit).toBe(0)
    expect(result.pendingAllocation).toBe(0)
    expect(result.byStage.pipeline).toBe(0)
  })

  it('byStage buckets MOUs across lifecycle stages', () => {
    const mous = [
      mou({ id: 'M-1', status: 'Draft' }),
      mou({ id: 'M-2', status: 'Active', studentsActual: 50 }),
    ]
    const result = computeOperationalPosition({
      mous,
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(result.byStage.pipeline).toBe(1)
    expect(result.byStage.active).toBe(1)
  })
})

describe('computeLandingAttention', () => {
  it('surfaces open P0 escalations first', () => {
    const items = computeLandingAttention({
      mous: [mou()],
      schools: [school()],
      escalations: [
        escalation({ id: 'E-1', severity: 'critical', status: 'Open' }),
        escalation({ id: 'E-2', severity: 'medium', status: 'Open' }),
      ],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(items[0]?.severity).toBe('p0')
    expect(items[0]?.href).toBe('/escalations/E-1')
  })

  it('high-value overdue payment surfaces as p1', () => {
    const items = computeLandingAttention({
      mous: [mou({ id: 'M-1', contractValue: 3000000, schoolName: 'Riverdale' })],
      schools: [school()],
      escalations: [],
      dispatches: [],
      payments: [
        payment({
          mouId: 'M-1',
          dueDateIso: '2026-03-01',
          expectedAmount: 420000,
          status: 'Pending',
        }),
      ],
      now: NOW,
    })
    expect(items[0]?.severity).toBe('p1')
    expect(items[0]?.description).toContain('Riverdale')
    expect(items[0]?.description).toContain('overdue')
  })

  it('caps results at 5 items', () => {
    const escalations = Array.from({ length: 10 }, (_, i) =>
      escalation({
        id: `E-${i}`,
        severity: 'critical',
        status: 'Open',
        description: `issue ${i}`,
      }),
    )
    const items = computeLandingAttention({
      mous: [mou()],
      schools: [school()],
      escalations,
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(items).toHaveLength(5)
  })

  it('orders P0 before financial overdue', () => {
    const items = computeLandingAttention({
      mous: [mou({ id: 'M-1', contractValue: 3000000 })],
      schools: [school()],
      escalations: [escalation({ id: 'E-1', severity: 'critical' })],
      dispatches: [],
      payments: [
        payment({
          id: 'P-1',
          mouId: 'M-1',
          dueDateIso: '2026-01-01',
          status: 'Pending',
        }),
      ],
      now: NOW,
    })
    expect(items[0]?.severity).toBe('p0')
    expect(items[1]?.severity).toBe('p1')
  })

  it('returns empty list when nothing matches', () => {
    const items = computeLandingAttention({
      mous: [],
      schools: [],
      escalations: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(items).toHaveLength(0)
  })

  it('recently-signed high-value MOU surfaces as info', () => {
    const recent = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const items = computeLandingAttention({
      mous: [
        mou({
          id: 'M-1',
          contractValue: 6000000,
          generatedAt: recent,
          schoolName: 'Eagle Heights',
        }),
      ],
      schools: [school()],
      escalations: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    expect(items.find((i) => i.severity === 'info')?.description).toContain(
      'Eagle Heights',
    )
  })
})

describe('computeTileSlices', () => {
  it('finance tile carries outstanding, PIs awaiting, unmatched', () => {
    const payments = [
      payment({ id: 'P-1', piGeneratedAt: '2026-04-01T00:00:00Z', receivedDate: null }),
      payment({ id: 'P-2', piGeneratedAt: null, receivedDate: null }),
    ]
    const paymentLogs = [
      paymentLog({ id: 'L-1', unmatched: true, matchedInstallmentIds: [] }),
      paymentLog({ id: 'L-2', unmatched: false, matchedInstallmentIds: ['P-1'] }),
    ]
    const commercial = computeCommercialPosition({
      mous: [mou({ contractValue: 1000000 })],
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    const operational = computeOperationalPosition({
      mous: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    const result = computeTileSlices({
      mous: [],
      payments,
      paymentLogs,
      escalations: [],
      dispatches: [],
      commercial,
      operational,
    })
    expect(result.finance.outstanding).toBe(1000000)
    expect(result.finance.pisAwaitingPayment).toBe(1)
    expect(result.finance.unmatchedPayments).toBe(1)
  })

  it('ops + leadership tiles carry open escalations + P0 subset', () => {
    const escalations = [
      escalation({ id: 'E-1', severity: 'critical', status: 'Open' }),
      escalation({ id: 'E-2', severity: 'medium', status: 'Open' }),
      escalation({ id: 'E-3', severity: 'medium', status: 'Closed' }),
    ]
    const commercial = computeCommercialPosition({
      mous: [],
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    const operational = computeOperationalPosition({
      mous: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    const result = computeTileSlices({
      mous: [],
      payments: [],
      paymentLogs: [],
      escalations,
      dispatches: [],
      commercial,
      operational,
    })
    expect(result.ops.openEscalations).toBe(2)
    expect(result.leadership.openP0Escalations).toBe(1)
  })
})

describe('edge cases: empty data', () => {
  it('commercial position survives empty MOUs + payments', () => {
    const result = computeCommercialPosition({
      mous: [],
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    expect(result.signedContractValueFy).toBe(0)
    expect(result.receivedFy).toBe(0)
    expect(result.outstanding).toBe(0)
    expect(result.collectionPct).toBe(0)
    expect(result.activeSchools).toBe(0)
    expect(result.signedContractValueDeltaPct).toBeNull()
    expect(result.monthlyReceipts).toHaveLength(12)
    expect(result.monthlyReceipts.every((m) => m.amount === 0)).toBe(true)
  })

  it('tile slices survive empty fixtures (brand-new FY)', () => {
    const commercial = computeCommercialPosition({
      mous: [],
      payments: [],
      fy: '2026-27',
      now: NOW,
    })
    const operational = computeOperationalPosition({
      mous: [],
      dispatches: [],
      payments: [],
      now: NOW,
    })
    const tiles = computeTileSlices({
      mous: [],
      payments: [],
      paymentLogs: [],
      escalations: [],
      dispatches: [],
      commercial,
      operational,
    })
    expect(tiles.finance.outstanding).toBe(0)
    expect(tiles.finance.pisAwaitingPayment).toBe(0)
    expect(tiles.finance.unmatchedPayments).toBe(0)
    expect(tiles.ops.activeDispatches).toBe(0)
    expect(tiles.ops.pendingAllocation).toBe(0)
    expect(tiles.ops.openEscalations).toBe(0)
    expect(tiles.leadership.activeSchools).toBe(0)
    expect(tiles.leadership.collectionPct).toBe(0)
    expect(tiles.leadership.openP0Escalations).toBe(0)
  })
})

describe('currentFiscalYear', () => {
  it('Apr 2026 falls in FY 2026-27', () => {
    expect(currentFiscalYear(new Date('2026-04-15T00:00:00Z'))).toBe('2026-27')
  })

  it('Feb 2026 falls in FY 2025-26', () => {
    expect(currentFiscalYear(new Date('2026-02-15T00:00:00Z'))).toBe('2025-26')
  })
})
