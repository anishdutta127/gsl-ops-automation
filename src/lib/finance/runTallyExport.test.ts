/*
 * Gate 2 Step 6 V5: runTallyExport lib tests.
 *
 * Pins the rules locked by STEP6_QUESTIONS Q7 + Q8 + the brief's V5
 * edge case (empty FY with no PIs returns a valid XML envelope with no
 * voucher messages, NOT an error).
 */

import { describe, expect, it } from 'vitest'
import { runTallyExport } from './runTallyExport'
import type { MOU, Payment, School } from '@/lib/types'

function emptyMou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-T',
    schoolId: 'SCH-T',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: null,
    endDate: null,
    studentsMou: 0,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 0,
    spWithTax: 0,
    contractValue: 0,
    received: 0,
    tds: 0,
    balance: 0,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
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

function emptyPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-T-i1',
    mouId: 'MOU-T',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 1',
    instalmentSeq: 1,
    totalInstalments: 1,
    description: 'Instalment 1',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 100000,
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

function emptySchool(): School {
  return {
    id: 'SCH-T',
    name: 'Test School',
    legalEntity: null,
    city: 'Mumbai',
    state: 'Maharashtra',
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
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  }
}

describe('runTallyExport: empty FY edge case (V5)', () => {
  it('returns valid XML envelope with no VOUCHER messages when no PIs in FY', async () => {
    const result = await runTallyExport(
      { fiscalYear: '99-99', entity: 'both' },
      { payments: [], mous: [], schools: [] },
    )
    expect(result.voucherCount).toBe(0)
    expect(result.xml).toContain('<ENVELOPE>')
    expect(result.xml).toContain('<HEADER>')
    expect(result.xml).toContain('Import Data')
    expect(result.xml).not.toContain('<VOUCHER')
    expect(result.filename).toBe('tally-export-both-99-99.xml')
  })

  it('filters by FY: piGeneratedAt outside selected FY is excluded', async () => {
    const p2425 = emptyPayment({
      id: 'P-OLD',
      piNumber: 'MTPL/UP/24-25/0001',
      piGeneratedAt: '2024-08-01T00:00:00Z',
    })
    const p2627 = emptyPayment({
      id: 'P-NEW',
      piNumber: 'MTPL/UP/26-27/0001',
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const result = await runTallyExport(
      { fiscalYear: '26-27', entity: 'both' },
      { payments: [p2425, p2627], mous: [emptyMou()], schools: [emptySchool()] },
    )
    expect(result.voucherCount).toBe(1)
  })

  it('filters by entity selection: STEAM routes to UP only', async () => {
    const steamPayment = emptyPayment({
      piNumber: 'MTPL/UP/26-27/0001',
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const ypPayment = emptyPayment({
      id: 'MOU-YP-i1',
      mouId: 'MOU-YP',
      programme: 'Young Pioneers',
      piNumber: 'MTPL/MH/26-27/0001',
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const ypMou = emptyMou({ id: 'MOU-YP', programme: 'Young Pioneers' })
    const upOnly = await runTallyExport(
      { fiscalYear: '26-27', entity: 'UP' },
      { payments: [steamPayment, ypPayment], mous: [emptyMou(), ypMou], schools: [emptySchool()] },
    )
    expect(upOnly.voucherCount).toBe(1)
    const mhOnly = await runTallyExport(
      { fiscalYear: '26-27', entity: 'MH' },
      { payments: [steamPayment, ypPayment], mous: [emptyMou(), ypMou], schools: [emptySchool()] },
    )
    expect(mhOnly.voucherCount).toBe(1)
    const both = await runTallyExport(
      { fiscalYear: '26-27', entity: 'both' },
      { payments: [steamPayment, ypPayment], mous: [emptyMou(), ypMou], schools: [emptySchool()] },
    )
    expect(both.voucherCount).toBe(2)
  })

  it('skips payments with no piNumber (Q8: only piNumber !== null)', async () => {
    const p1 = emptyPayment({
      piNumber: null,
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const p2 = emptyPayment({
      id: 'P2',
      piNumber: 'MTPL/UP/26-27/0001',
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const result = await runTallyExport(
      { fiscalYear: '26-27', entity: 'both' },
      { payments: [p1, p2], mous: [emptyMou()], schools: [emptySchool()] },
    )
    expect(result.voucherCount).toBe(1)
  })

  it('skips payments with null piGeneratedAt', async () => {
    const p = emptyPayment({
      piNumber: 'MTPL/UP/26-27/0001',
      piGeneratedAt: null,
    })
    const result = await runTallyExport(
      { fiscalYear: '26-27', entity: 'both' },
      { payments: [p], mous: [emptyMou()], schools: [emptySchool()] },
    )
    expect(result.voucherCount).toBe(0)
  })

  it('Indian fiscal year: Jan-Mar belongs to previous April-March cycle', async () => {
    // Payment piGeneratedAt 2026-02-15 belongs to FY 25-26 (April 2025 - March 2026)
    const feb2026 = emptyPayment({
      piNumber: 'MTPL/UP/25-26/0005',
      piGeneratedAt: '2026-02-15T00:00:00Z',
    })
    const apr2026 = emptyPayment({
      id: 'P-APR',
      piNumber: 'MTPL/UP/26-27/0001',
      piGeneratedAt: '2026-04-15T00:00:00Z',
    })
    const fy2526 = await runTallyExport(
      { fiscalYear: '25-26', entity: 'both' },
      { payments: [feb2026, apr2026], mous: [emptyMou()], schools: [emptySchool()] },
    )
    expect(fy2526.voucherCount).toBe(1)
    const fy2627 = await runTallyExport(
      { fiscalYear: '26-27', entity: 'both' },
      { payments: [feb2026, apr2026], mous: [emptyMou()], schools: [emptySchool()] },
    )
    expect(fy2627.voucherCount).toBe(1)
  })
})
