import { describe, expect, it } from 'vitest'
import type {
  DispatchSummary,
  KitDispatch,
  MOU,
  School,
} from '@/lib/types'
import { deriveSummaryRows, rowsToCsv } from './summaryView'

const FIXED_NOW = new Date('2026-05-11T12:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'A',
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
    contractValue: 118000,
    received: 0,
    tds: 0,
    balance: 118000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
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
    name: 'A School',
    legalEntity: null,
    city: 'Pune',
    state: 'MH',
    region: 'South-West',
    pinCode: '411001',
    contactPerson: 'X',
    email: null,
    phone: '9000',
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-04-01',
    auditLog: [],
    ...overrides,
  }
}

function summary(overrides: Partial<DispatchSummary> = {}): DispatchSummary {
  return {
    schoolName: 'A',
    shippingAddress: 'Pune',
    contactPerson: 'X',
    contactNumber: '9000',
    salesRemarks: null,
    approvedBy: 'sp-vikram',
    approvedAt: FIXED_NOW.toISOString(),
    accountsEntries: [
      {
        grade: 6,
        studentsRequested: 30,
        productRequested: 'Launchpad',
        qtyRequested: 8,
        qtyActualDispatched: 7,
      },
    ],
    deliveryChallanPath: null,
    warehouseEmailLoggedAt: null,
    ...overrides,
  }
}

function kd(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-A',
    mouId: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'A School',
    productSelected: 'TinkRworks',
    dispatchStatus: 'In Transit',
    allocations: [],
    salesApprovalStatus: 'Approved',
    salesApprovedBy: 'sp-vikram',
    salesApprovedAt: FIXED_NOW.toISOString(),
    salesRejectionReason: null,
    dispatchSummary: summary(),
    shipmentTracking: null,
    pod: { filePath: '/delivery-pods/DISPATCH-MOU-A.pdf', uploadedAt: FIXED_NOW.toISOString(), uploadedBy: 'shashank.k' },
    auditLog: [
      {
        timestamp: '2026-05-10T09:00:00.000Z',
        user: 'sp-vikram',
        action: 'update',
      },
    ],
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('deriveSummaryRows', () => {
  it('flattens KitDispatch records with totals and POD path', () => {
    const rows = deriveSummaryRows({
      kitDispatches: [kd()],
      mous: [mou()],
      schools: [school()],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.totalDispatchedQty).toBe(7)
    expect(rows[0]?.podPath).toBe('/delivery-pods/DISPATCH-MOU-A.pdf')
    expect(rows[0]?.region).toBe('South-West')
    expect(rows[0]?.salesPersonId).toBe('sp-vikram')
  })
})

describe('rowsToCsv', () => {
  it('emits header + escaped values', () => {
    const rows = deriveSummaryRows({
      kitDispatches: [kd({ schoolName: 'School, with comma' })],
      mous: [mou()],
      schools: [school()],
    })
    const csv = rowsToCsv(rows)
    expect(csv.split('\n')[0]).toBe(
      'dispatchId,schoolName,mouId,productSelected,totalDispatchedQty,dispatchStatus,podPath,lastUpdatedAt',
    )
    expect(csv).toContain('"School, with comma"')
    expect(csv).toContain('/delivery-pods/DISPATCH-MOU-A.pdf')
  })
})
