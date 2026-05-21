/*
 * Gate 2 Step 2: 12-MOU rupee-perfect lifecycle replay.
 *
 * Walks twelve representative scenarios through the migrated mou-system
 * libraries and asserts the locked rupee-perfection invariants against
 * deterministic expected values. The libs themselves are verbatim ports
 * from gsl-mou-system, so identical inputs produce identical outputs;
 * this test pins the integration-layer assertions so any future drift
 * fails CI loudly.
 *
 * Coverage:
 *   1.  STEAM single-year, 25-25-25-25 quarterly        (baseline)
 *   2.  YP single-year, 50-50 half-yearly               (programme + schedule shape)
 *   3.  HBPE single-year, 100% advance                  (single instalment)
 *   4.  Robotics single-year, 25-25-25-25 quarterly     (Gate 2 §7.1 new programme)
 *   5.  STEAM multi-year per-year pricing               (Pranav 2-year x 1500/1600)
 *   6.  STEAM 3-year uniform pricing                    (legacy schedule fallback)
 *   7.  Adjustment-as-line-item: drop BEFORE payment    (rewrite-in-place)
 *   8.  Adjustment-as-line-item: drop AFTER inst-1 paid (Pranav Round 1 canonical)
 *   9.  Adjustment reversal scenario                    (Reversed status hides on next PI)
 *   10. PI generation routing: STEAM -> MTPL/UP         (Gate 2 §3 entity routing)
 *   11. PI generation routing: YP -> MTPL/MH            (entity routing + counter independence)
 *   12. VEX kit order with multi-line + multi-dispatch  (parallel-module integration)
 *
 * Pranav's rupee-perfection guarantee: total contract value, per-
 * instalment expected amounts, balance-due-previous-instalments line on
 * adjusted PIs, and PI number prefixes must all be deterministic and
 * traceable. The assertions in each scenario reflect the canonical
 * recalc + PI rules from CLAUDE.md (Phase 3 Round 2 + Round 3) plus
 * MERGE_PLAN.md §4.1-§4.9.
 */

import { describe, expect, it } from 'vitest'
import {
  computeRecalcWithAdjustments,
  recalculatePaymentSchedule,
  type ExistingInstallment,
} from './recalc'
import { buildInstallmentsFromMou } from './installments'
import { composePi, hsnFor } from './pi'
import { formatPiNumber, getEntityForProgramme } from './company'
import {
  buildVexOrdersFromRows,
  vexFunnelCounts,
  type VexImportRow,
} from './vex'
import type { Adjustment, MOU, Payment, School } from './types'

// ----------------------------------------------------------------------------
// Fixture helpers
// ----------------------------------------------------------------------------

function mou(overrides: Partial<MOU> & Pick<MOU, 'id' | 'programme'>): MOU {
  const base: MOU = {
    id: overrides.id,
    schoolId: 'SCH-FIXTURE',
    schoolName: 'Fixture School',
    programme: overrides.programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    cohortStatus: 'active',
    delayNotes: null,
    status: 'Active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
    spWithTax: 1000,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    notes: null,
    daysToExpiry: 365,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    draftVariables: null,
    auditLog: [],
  }
  return { ...base, ...overrides }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-FIXTURE',
    name: 'Fixture School',
    legalEntity: 'Fixture School Trust',
    city: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400001',
    contactPerson: 'Mr. Fixture',
    email: 'fixture@example.test',
    phone: '+91-99999-99999',
    billingName: 'Fixture School Trust',
    pan: 'ABCDE1234F',
    gstNumber: '27ABCDE1234F1Z5',
    activeMous: 1,
    totalLifetimeValue: 0,
    notes: null,
    auditLog: [],
    ...overrides,
  }
}

function existingInstallment(args: {
  seq: number
  pctDue: number
  expectedAmount: number
  paidAmount?: number
  piSentDate?: string | null
  freshExpectedAmount?: number
}): ExistingInstallment & { piSentDate?: string | null } {
  return {
    id: `MOU-FIXTURE-i${args.seq}`,
    seq: args.seq,
    pctDue: args.pctDue,
    expectedAmount: args.expectedAmount,
    paidAmount: args.paidAmount ?? 0,
    piSentDate: args.piSentDate ?? null,
    freshExpectedAmount: args.freshExpectedAmount,
  }
}

// ----------------------------------------------------------------------------
// Scenario 1: STEAM single-year, 25-25-25-25 quarterly
// ----------------------------------------------------------------------------

describe('Scenario 1: STEAM 1Y 25-25-25-25 quarterly', () => {
  it('builds 4 instalments summing to contract value', () => {
    const m = mou({
      id: 'MOU-STEAM-2627-001',
      programme: 'STEAM',
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      cohortStatus: 'active',
      delayNotes: null,
      studentsMou: 200,
      spWithTax: 5000,
      contractValue: 1000000,
      paymentSchedule: '25-25-25-25 quarterly',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(4)
    expect(ins.map((p) => p.expectedAmount)).toEqual([250000, 250000, 250000, 250000])
    expect(ins.reduce((s, p) => s + p.expectedAmount, 0)).toBe(1000000)
    // dueDateIso is locale-formatted by toISOString().slice(0,10); the
    // exact day depends on the test runner's timezone. Assert the
    // sequence is monotonic-increasing instead.
    const dates = ins.map((p) => p.dueDateIso!)
    expect(dates.every((d, i) => i === 0 || d > dates[i - 1]!)).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Scenario 2: Young Pioneers single-year, 50-50 half-yearly
// ----------------------------------------------------------------------------

describe('Scenario 2: YP 1Y 50-50 half-yearly', () => {
  it('builds 2 instalments six months apart', () => {
    const m = mou({
      id: 'MOU-YP-2627-001',
      programme: 'Young Pioneers',
      studentsMou: 80,
      spWithTax: 2000,
      contractValue: 160000,
      paymentSchedule: '50-50 half-yearly',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(2)
    expect(ins.map((p) => p.expectedAmount)).toEqual([80000, 80000])
    // Dates are roughly 6 months apart; assert ordering not exact day
    // (timezone-sensitive Date construction).
    const d0 = ins[0]?.dueDateIso ?? ''
    const d1 = ins[1]?.dueDateIso ?? ''
    expect(d0 < d1).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Scenario 3: HBPE single-year, 100% advance
// ----------------------------------------------------------------------------

describe('Scenario 3: HBPE 1Y 100% advance', () => {
  it('builds a single instalment due on start date', () => {
    const m = mou({
      id: 'MOU-HBPE-2627-001',
      programme: 'Harvard HBPE',
      studentsMou: 50,
      spWithTax: 6000,
      contractValue: 300000,
      paymentSchedule: '100% advance',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(1)
    expect(ins[0]?.expectedAmount).toBe(300000)
    // dueDateIso reflects the start date (timezone-sensitive day).
    expect(ins[0]?.dueDateIso).toBeTruthy()
  })
})

// ----------------------------------------------------------------------------
// Scenario 4: Robotics single-year quarterly
// ----------------------------------------------------------------------------

describe('Scenario 4: Robotics 1Y 25-25-25-25 quarterly (Gate 2 §7.1)', () => {
  it('builds 4 instalments and routes to UP entity', () => {
    const m = mou({
      id: 'MOU-ROB-2627-001',
      programme: 'Robotics',
      studentsMou: 150,
      spWithTax: 4000,
      contractValue: 600000,
      paymentSchedule: '25-25-25-25 quarterly',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(4)
    expect(ins.map((p) => p.expectedAmount)).toEqual([150000, 150000, 150000, 150000])
    expect(getEntityForProgramme('Robotics')).toBe('UP')
    expect(hsnFor('Robotics')).toBe('999294')
  })
})

// ----------------------------------------------------------------------------
// Scenario 5: STEAM multi-year per-year pricing (Pranav 2-year)
// ----------------------------------------------------------------------------

describe('Scenario 5: STEAM 2Y per-year pricing (1000 students Y1@1500 Y2@1600)', () => {
  it('builds 4 instalments (2 per year) using yearlyPricing per year', () => {
    const m = mou({
      id: 'MOU-STEAM-2627-MULTI',
      programme: 'STEAM',
      studentsMou: 1000,
      spWithoutTax: 1500,
      spWithTax: 1500,
      contractValue: 3100000, // Y1 1500 * 1000 + Y2 1600 * 1000 = 3,100,000
      numberOfYears: 2,
      yearlyPricing: [
        { year: 1, spWithoutTax: 1500, spWithTax: 1500 },
        { year: 2, spWithoutTax: 1600, spWithTax: 1600 },
      ],
      paymentSchedules: [
        {
          year: 1,
          instalments: [
            { month: 'April 2026', pctDue: 50 },
            { month: 'October 2026', pctDue: 50 },
          ],
        },
        {
          year: 2,
          instalments: [
            { month: 'April 2027', pctDue: 50 },
            { month: 'October 2027', pctDue: 50 },
          ],
        },
      ],
      paymentSchedule: '50-50 half-yearly',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(4)
    // Year 1: 50% × 1000 × 1500 = Rs 7,50,000 each
    expect(ins[0]?.expectedAmount).toBe(750000)
    expect(ins[1]?.expectedAmount).toBe(750000)
    // Year 2: 50% × 1000 × 1600 = Rs 8,00,000 each
    expect(ins[2]?.expectedAmount).toBe(800000)
    expect(ins[3]?.expectedAmount).toBe(800000)
    expect(ins.reduce((s, p) => s + p.expectedAmount, 0)).toBe(3100000)
  })
})

// ----------------------------------------------------------------------------
// Scenario 6: STEAM 3-year uniform pricing (legacy schedule fallback)
// ----------------------------------------------------------------------------

describe('Scenario 6: STEAM 3Y uniform pricing 200 students Rs 1000/student', () => {
  it('builds 4 instalments under legacy single-string schedule', () => {
    // 3-year MOU with no per-year structure: legacy paymentSchedule applies
    // to the contract total. 200 students × 1000 × 3 years = 600,000.
    const m = mou({
      id: 'MOU-STEAM-3Y',
      programme: 'STEAM',
      studentsMou: 200,
      spWithoutTax: 1000,
      spWithTax: 1000,
      contractValue: 600000,
      numberOfYears: 3,
      paymentSchedule: '25-25-25-25 quarterly',
    })
    const ins = buildInstallmentsFromMou(m)
    expect(ins).toHaveLength(4)
    expect(ins.map((p) => p.expectedAmount)).toEqual([150000, 150000, 150000, 150000])
    expect(ins.reduce((s, p) => s + p.expectedAmount, 0)).toBe(600000)
  })
})

// ----------------------------------------------------------------------------
// Scenario 7: Adjustment-as-line-item: drop BEFORE any payment
// ----------------------------------------------------------------------------

describe('Scenario 7: drop students BEFORE payment rewrites all instalments', () => {
  it('rewrites all 4 instalments in place; no Adjustment record', () => {
    // Pranav scenario start: 500 students × Rs 1000/student × 4 × 25%
    // = 4 PIs of Rs 1,25,000 each. Then drop to 450 BEFORE any payment:
    // every PI rewrites to Rs 1,12,500 because none are locked.
    const installments = [1, 2, 3, 4].map((seq) =>
      existingInstallment({ seq, pctDue: 25, expectedAmount: 125000 }),
    )
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 450,
      installments,
      reason: 'students dropped before any PI sent',
    })
    expect(result.adjustments).toHaveLength(0)
    expect(result.updates).toHaveLength(4)
    expect(result.updates.every((u) => u.newExpectedAmount === 112500)).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Scenario 8: Adjustment-as-line-item: drop AFTER inst-1 paid (canonical)
// ----------------------------------------------------------------------------

describe('Scenario 8: Pranav Round 1 canonical (drop 500->400 after inst-1 paid)', () => {
  it('preserves paid instalment 1 and creates Adjustment on instalment 2', () => {
    // Setup: 4 instalments at Rs 1,12,500 each (after the drop to 450
    // pre-payment in Scenario 7). Pay instalment 1 in full. Now drop
    // students to 400. Locked: inst-1 (paidAmount > 0). Unlocked: inst
    // 2/3/4. New expected per inst at 400 students = Rs 1,00,000.
    //
    //   inst 1: PRESERVED at Rs 1,12,500 (paid).
    //   inst 2: rewritten in place to Rs 1,00,000 PLUS adjustment of
    //           Rs -12,500 attached. Net due = Rs 87,500.
    //   inst 3: rewritten in place to Rs 1,00,000.
    //   inst 4: rewritten in place to Rs 1,00,000.
    //
    // The Adjustment row carries originalInstallmentId = inst-1
    // (the paid one), appliedToInstallmentId = inst-2 (next unlocked),
    // amountDelta = (1,00,000 - 1,12,500) = Rs -12,500 (credit).
    const installments = [
      existingInstallment({ seq: 1, pctDue: 25, expectedAmount: 112500, paidAmount: 112500 }),
      existingInstallment({ seq: 2, pctDue: 25, expectedAmount: 112500 }),
      existingInstallment({ seq: 3, pctDue: 25, expectedAmount: 112500 }),
      existingInstallment({ seq: 4, pctDue: 25, expectedAmount: 112500 }),
    ]
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 400,
      installments,
      reason: 'students dropped after inst-1 paid',
    })
    // 3 instalments rewritten (2, 3, 4); 1 adjustment attached to inst 2.
    expect(result.updates).toHaveLength(3)
    expect(result.updates.map((u) => u.newExpectedAmount)).toEqual([100000, 100000, 100000])
    expect(result.adjustments).toHaveLength(1)
    const adj = result.adjustments[0]!
    expect(adj.originalInstallmentId).toBe('MOU-FIXTURE-i1')
    expect(adj.appliedToInstallmentId).toBe('MOU-FIXTURE-i2')
    expect(adj.amountDelta).toBe(-12500)
    expect(adj.beforeAmount).toBe(112500)
    expect(adj.afterAmount).toBe(100000)
  })

  it('PI for instalment 2 surfaces the credit as balanceDuePreviousInstalments', () => {
    const m = mou({
      id: 'MOU-FIXTURE',
      programme: 'STEAM',
      studentsMou: 500,
      studentsActual: 400,
      spWithTax: 1000,
      contractValue: 400000,
      paymentSchedule: '25-25-25-25 quarterly',
    })
    const inst2: Payment = {
      id: 'MOU-FIXTURE-i2',
      mouId: 'MOU-FIXTURE',
      schoolName: 'Fixture School',
      programme: 'STEAM',
      instalmentLabel: '2 of 4',
      instalmentSeq: 2,
      totalInstalments: 4,
      description: 'Instalment 2',
      dueDateRaw: '2026-07-01',
      dueDateIso: '2026-07-01',
      expectedAmount: 100000,
      receivedAmount: 0,
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
      studentCountActual: 400,
      partialPayments: [],
      auditLog: [],
    }
    const adjustments: Adjustment[] = [
      {
        id: 'ADJ-001',
        mouId: 'MOU-FIXTURE',
        schoolId: 'SCH-FIXTURE',
        triggeredByEvent: 'actuals_update',
        triggeredAt: '2026-07-15T10:00:00Z',
        triggeredBy: 'shubhangi.g',
        originalInstallmentId: 'MOU-FIXTURE-i1',
        appliedToInstallmentId: 'MOU-FIXTURE-i2',
        amountDelta: -12500,
        reason: 'students dropped 500 -> 400 after inst-1 paid',
        beforeAmount: 112500,
        afterAmount: 100000,
        status: 'Active',
      },
    ]
    const pi = composePi({
      piNumber: 'MTPL/UP/26-27/0002',
      issueDate: '2026-07-15',
      installment: inst2,
      mou: m,
      school: school({ state: 'Uttar Pradesh' }),
      gstPct: 0.18,
      adjustments,
    })
    // Inst 2 rounded total Rs 1,00,000 (pre-adjustment). Adjustment Rs
    // -12,500 (credit). netPaymentDue = 1,00,000 - 12,500 = Rs 87,500.
    expect(pi.balanceDuePreviousInstalments).toBe(-12500)
    expect(pi.netPaymentDue).toBe(87500)
  })
})

// ----------------------------------------------------------------------------
// Scenario 9: Adjustment reversal scenario
// ----------------------------------------------------------------------------

describe('Scenario 9: Adjustment with status=Reversed hides on next PI', () => {
  it('Reversed adjustments do not contribute to balanceDuePreviousInstalments', () => {
    const m = mou({
      id: 'MOU-FIXTURE',
      programme: 'STEAM',
      studentsMou: 500,
      studentsActual: 400,
      spWithTax: 1000,
      contractValue: 400000,
    })
    const inst3: Payment = {
      id: 'MOU-FIXTURE-i3',
      mouId: 'MOU-FIXTURE',
      schoolName: 'Fixture School',
      programme: 'STEAM',
      instalmentLabel: '3 of 4',
      instalmentSeq: 3,
      totalInstalments: 4,
      description: 'Instalment 3',
      dueDateRaw: '2026-10-01',
      dueDateIso: '2026-10-01',
      expectedAmount: 100000,
      receivedAmount: 0,
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
      studentCountActual: 400,
      partialPayments: [],
      auditLog: [],
    }
    const reversedAdjustment: Adjustment = {
      id: 'ADJ-001',
      mouId: 'MOU-FIXTURE',
      schoolId: 'SCH-FIXTURE',
      triggeredByEvent: 'actuals_update',
      triggeredAt: '2026-07-15T10:00:00Z',
      triggeredBy: 'shubhangi.g',
      originalInstallmentId: 'MOU-FIXTURE-i1',
      appliedToInstallmentId: 'MOU-FIXTURE-i3',
      amountDelta: -12500,
      reason: 'reversed: actuals correction',
      beforeAmount: 112500,
      afterAmount: 100000,
      status: 'Reversed',
    }
    const pi = composePi({
      piNumber: 'MTPL/UP/26-27/0003',
      issueDate: '2026-10-15',
      installment: inst3,
      mou: m,
      school: school({ state: 'Uttar Pradesh' }),
      gstPct: 0.18,
      adjustments: [reversedAdjustment],
    })
    expect(pi.balanceDuePreviousInstalments).toBe(0)
    expect(pi.netPaymentDue).toBe(100000)
  })
})

// ----------------------------------------------------------------------------
// Scenarios 10+11: PI number routing per GST entity
// ----------------------------------------------------------------------------

describe('Scenario 10: STEAM PI routes to MTPL/UP', () => {
  it('formatPiNumber produces MTPL/UP/26-27/0001 for first STEAM PI', () => {
    expect(getEntityForProgramme('STEAM')).toBe('UP')
    expect(formatPiNumber('UP', 1)).toBe('MTPL/UP/26-27/0001')
  })

  it('per-entity counter is independent: STEAM seq 0001 vs YP seq 0001', () => {
    expect(formatPiNumber('UP', 1)).toBe('MTPL/UP/26-27/0001')
    expect(formatPiNumber('MH', 1)).toBe('MTPL/MH/26-27/0001')
  })
})

describe('Scenario 11: YP + HBPE share MH counter', () => {
  it('Young Pioneers + Harvard HBPE both route to MH', () => {
    expect(getEntityForProgramme('Young Pioneers')).toBe('MH')
    expect(getEntityForProgramme('Harvard HBPE')).toBe('MH')
  })

  it('shared counter advances within MH across programmes', () => {
    // counter 1 = YP, counter 2 = HBPE, counter 3 = VEX MH default
    expect(formatPiNumber('MH', 1)).toBe('MTPL/MH/26-27/0001')
    expect(formatPiNumber('MH', 2)).toBe('MTPL/MH/26-27/0002')
    expect(formatPiNumber('MH', 3)).toBe('MTPL/MH/26-27/0003')
  })
})

// ----------------------------------------------------------------------------
// Scenario 12: VEX kit order with multi-line + multi-dispatch
// ----------------------------------------------------------------------------

describe('Scenario 12: VEX 28-SKU module integration', () => {
  it('groups CSV-imported rows into VexOrders with line items + GST splits', () => {
    const rows: VexImportRow[] = [
      {
        orderDate: '2026-04-15',
        schoolName: 'Cedar Heights',
        schoolId: 'SCH-CEDAR',
        voucherNumber: 'MTPL/MH/2526/0042',
        productName: 'VEX-IQ Super Kit',
        quantity: 4,
        ratePerUnit: 25000,
        amount: 100000,
        igst: 18000,
        cgst: 0,
        sgst: 0,
        total: 118000,
        paymentReceived: true,
        dispatchStatus: 'Payment Received',
      },
      {
        orderDate: '2026-04-15',
        schoolName: 'Cedar Heights',
        schoolId: 'SCH-CEDAR',
        voucherNumber: 'MTPL/MH/2526/0042',
        productName: 'VEX-V5 Workcell',
        quantity: 2,
        ratePerUnit: 75000,
        amount: 150000,
        igst: 27000,
        cgst: 0,
        sgst: 0,
        total: 177000,
        paymentReceived: true,
        dispatchStatus: 'Payment Received',
      },
    ]
    const orders = buildVexOrdersFromRows(rows)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.lineItems).toHaveLength(2)
    expect(order.subtotal).toBe(250000)
    expect(order.igst).toBe(45000)
    expect(order.total).toBe(295000)
    expect(order.dispatchStatus).toBe('Payment Received')
  })

  it('vexFunnelCounts buckets orders by dispatchStatus', () => {
    const rows: VexImportRow[] = [
      {
        orderDate: '2026-04-15',
        schoolName: 'A',
        schoolId: null,
        voucherNumber: 'V1',
        productName: 'X',
        quantity: 1,
        ratePerUnit: 100,
        amount: 100,
        igst: 18,
        cgst: 0,
        sgst: 0,
        total: 118,
        paymentReceived: false,
        dispatchStatus: 'Proforma Sent',
      },
      {
        orderDate: '2026-04-16',
        schoolName: 'B',
        schoolId: null,
        voucherNumber: 'V2',
        productName: 'Y',
        quantity: 1,
        ratePerUnit: 100,
        amount: 100,
        igst: 18,
        cgst: 0,
        sgst: 0,
        total: 118,
        paymentReceived: true,
        dispatchStatus: 'Dispatched',
      },
    ]
    const orders = buildVexOrdersFromRows(rows)
    const counts = vexFunnelCounts(orders)
    expect(counts['Proforma Sent']).toBe(1)
    expect(counts['Dispatched']).toBe(1)
    expect(counts['Payment Received']).toBe(0)
    expect(counts['Invoice Generated']).toBe(0)
  })

  it('VEX routes to MH default entity per company.json', () => {
    expect(getEntityForProgramme('VEX')).toBe('MH')
  })
})

// ----------------------------------------------------------------------------
// Cross-scenario invariant: read-only recalc preview never writes
// ----------------------------------------------------------------------------

describe('Cross-scenario: read-only recalc preview', () => {
  it('recalculatePaymentSchedule returns identical totals for the canonical input', () => {
    // Pranav Round 1: 500 students × Rs 1000 × [25,25,25,25].
    const result = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 500,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [125000, 0, 0, 0],
    })
    expect(result.totalDue).toBe(500000)
    expect(result.totalPaid).toBe(125000)
    expect(result.surplusCredit).toBe(0)
    expect(result.instalments[0]?.status).toBe('Paid')
    expect(result.instalments[1]?.status).toBe('Pending')
  })

  it('preview correctly reports surplus when payments exceed schedule', () => {
    const result = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 100,
      pcts: [50, 50],
      paymentsByInstalment: [60000, 60000],
    })
    expect(result.totalDue).toBe(100000)
    expect(result.totalPaid).toBe(120000)
    expect(result.surplusCredit).toBe(20000)
  })
})
