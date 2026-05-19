import { describe, expect, it } from 'vitest'
import type { MOU, Payment } from '@/lib/types'
import {
  filterMousByFinancialYear,
  getAllRelevantFinancialYears,
  getCurrentFinancialYear,
  getFinancialYearsForMou,
  getYearSpecificInstalments,
} from './yearMembership'

function makeMou(overrides: Partial<MOU> = {}): MOU {
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
    spWithoutTax: 0,
    spWithTax: 0,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
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

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-A-i1',
    mouId: 'MOU-A',
    schoolName: 'A',
    programme: 'STEAM',
    instalmentLabel: '1 of 1',
    instalmentSeq: 1,
    totalInstalments: 1,
    description: '',
    dueDateRaw: null,
    dueDateIso: '2026-07-01',
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
    auditLog: [],
    ...overrides,
  }
}

describe('getCurrentFinancialYear', () => {
  it('returns 2026-27 for May 2026 (Indian FY April-March)', () => {
    expect(getCurrentFinancialYear(new Date('2026-05-19T00:00:00Z'))).toBe('2026-27')
  })

  it('returns 2025-26 for January 2026 (still in FY 25-26)', () => {
    expect(getCurrentFinancialYear(new Date('2026-01-15T00:00:00Z'))).toBe('2025-26')
  })

  it('returns 2026-27 for April 2026 (FY flip on April 1)', () => {
    expect(getCurrentFinancialYear(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27')
  })

  it('returns 2025-26 for March 2026 (last day of FY 25-26)', () => {
    expect(getCurrentFinancialYear(new Date('2026-03-31T00:00:00Z'))).toBe('2025-26')
  })
})

describe('getFinancialYearsForMou', () => {
  it('single-year MOU with one instalment returns one FY', () => {
    const mou = makeMou({ id: 'M-1' })
    const payments = [makePayment({ mouId: 'M-1', dueDateIso: '2026-07-01' })]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2026-27'])
  })

  it('two-year MOU with split instalments returns two FYs sorted ascending', () => {
    const mou = makeMou({ id: 'M-2', startDate: '2026-04-01', endDate: '2028-03-31' })
    const payments = [
      makePayment({ id: 'M-2-i1', mouId: 'M-2', instalmentSeq: 1, dueDateIso: '2026-07-01' }),
      makePayment({ id: 'M-2-i2', mouId: 'M-2', instalmentSeq: 2, dueDateIso: '2027-01-15' }),
      makePayment({ id: 'M-2-i3', mouId: 'M-2', instalmentSeq: 3, dueDateIso: '2027-07-15' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2026-27', '2027-28'])
  })

  it('three-year MOU returns three FYs', () => {
    const mou = makeMou({ id: 'M-3' })
    const payments = [
      makePayment({ mouId: 'M-3', dueDateIso: '2025-12-01' }),
      makePayment({ mouId: 'M-3', dueDateIso: '2026-12-01' }),
      makePayment({ mouId: 'M-3', dueDateIso: '2027-12-01' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual([
      '2025-26',
      '2026-27',
      '2027-28',
    ])
  })

  it('draft MOU with no instalments falls back to startDate / endDate range', () => {
    const mou = makeMou({
      id: 'M-draft',
      startDate: '2026-04-01',
      endDate: '2028-03-31',
    })
    expect(getFinancialYearsForMou(mou, [])).toEqual(['2026-27', '2027-28'])
  })

  it('MOU with no instalments and no duration falls back to academicYear', () => {
    const mou = makeMou({
      id: 'M-bare',
      startDate: null,
      endDate: null,
      academicYear: '2025-26',
    })
    expect(getFinancialYearsForMou(mou, [])).toEqual(['2025-26'])
  })

  it('MOU starting before April uses prior FY (boundary edge)', () => {
    const mou = makeMou({ id: 'M-edge' })
    const payments = [
      makePayment({ mouId: 'M-edge', dueDateIso: '2026-03-15' }),
      makePayment({ mouId: 'M-edge', dueDateIso: '2026-04-15' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2025-26', '2026-27'])
  })

  it('payments without dueDateIso are ignored', () => {
    const mou = makeMou({ id: 'M-nodue' })
    const payments = [
      makePayment({ mouId: 'M-nodue', dueDateIso: null }),
      makePayment({ mouId: 'M-nodue', dueDateIso: '2026-07-01' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2026-27'])
  })

  it('only counts payments belonging to this MOU', () => {
    const mou = makeMou({ id: 'M-self' })
    const payments = [
      makePayment({ mouId: 'M-self', dueDateIso: '2026-07-01' }),
      makePayment({ mouId: 'M-other', dueDateIso: '2027-07-01' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2026-27'])
  })

  it('deduplicates when multiple instalments fall in the same FY', () => {
    const mou = makeMou({ id: 'M-dedup' })
    const payments = [
      makePayment({ mouId: 'M-dedup', dueDateIso: '2026-07-01' }),
      makePayment({ mouId: 'M-dedup', dueDateIso: '2026-12-01' }),
      makePayment({ mouId: 'M-dedup', dueDateIso: '2027-01-31' }),
    ]
    expect(getFinancialYearsForMou(mou, payments)).toEqual(['2026-27'])
  })
})

describe('getAllRelevantFinancialYears', () => {
  it('returns empty array for empty MOU list', () => {
    expect(getAllRelevantFinancialYears([], [])).toEqual([])
  })

  it('returns union of all MOU FYs sorted descending (most recent first)', () => {
    const mous = [
      makeMou({ id: 'M-a', academicYear: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31' }),
      makeMou({ id: 'M-b', academicYear: '2027-28', startDate: '2027-04-01', endDate: '2028-03-31' }),
      makeMou({ id: 'M-c', academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' }),
    ]
    expect(getAllRelevantFinancialYears(mous, [])).toEqual([
      '2027-28',
      '2026-27',
      '2025-26',
    ])
  })

  it('uses payment FYs when available (multi-year MOU expands to multiple FYs)', () => {
    const mous = [makeMou({ id: 'M-multi' })]
    const payments = [
      makePayment({ mouId: 'M-multi', dueDateIso: '2026-07-01' }),
      makePayment({ mouId: 'M-multi', dueDateIso: '2027-07-01' }),
      makePayment({ mouId: 'M-multi', dueDateIso: '2028-07-01' }),
    ]
    expect(getAllRelevantFinancialYears(mous, payments)).toEqual([
      '2028-29',
      '2027-28',
      '2026-27',
    ])
  })
})

describe('filterMousByFinancialYear', () => {
  it('returns multi-year MOU in each of its FYs', () => {
    const multi = makeMou({ id: 'M-multi' })
    const single = makeMou({ id: 'M-single', academicYear: '2026-27' })
    const payments = [
      makePayment({ mouId: 'M-multi', dueDateIso: '2026-07-01' }),
      makePayment({ mouId: 'M-multi', dueDateIso: '2027-07-01' }),
      makePayment({ mouId: 'M-single', dueDateIso: '2026-07-01' }),
    ]
    expect(filterMousByFinancialYear([multi, single], payments, '2026-27')).toEqual([multi, single])
    expect(filterMousByFinancialYear([multi, single], payments, '2027-28')).toEqual([multi])
  })

  it('returns empty when no MOU touches the requested FY', () => {
    const mous = [makeMou({ id: 'M-a', academicYear: '2026-27' })]
    expect(filterMousByFinancialYear(mous, [], '2099-00')).toEqual([])
  })
})

describe('getYearSpecificInstalments', () => {
  it('returns only the instalments that fall in the requested FY', () => {
    const mou = makeMou({ id: 'M-x' })
    const payments = [
      makePayment({ id: 'M-x-i1', mouId: 'M-x', instalmentSeq: 1, dueDateIso: '2026-07-01' }),
      makePayment({ id: 'M-x-i2', mouId: 'M-x', instalmentSeq: 2, dueDateIso: '2027-01-15' }),
      makePayment({ id: 'M-x-i3', mouId: 'M-x', instalmentSeq: 3, dueDateIso: '2027-07-15' }),
    ]
    const fy2627 = getYearSpecificInstalments(mou, '2026-27', payments)
    expect(fy2627.map((p) => p.id)).toEqual(['M-x-i1', 'M-x-i2'])
    const fy2728 = getYearSpecificInstalments(mou, '2027-28', payments)
    expect(fy2728.map((p) => p.id)).toEqual(['M-x-i3'])
  })

  it('sorts by instalmentSeq ascending', () => {
    const mou = makeMou({ id: 'M-sort' })
    const payments = [
      makePayment({ id: 'M-sort-i3', mouId: 'M-sort', instalmentSeq: 3, dueDateIso: '2026-12-01' }),
      makePayment({ id: 'M-sort-i1', mouId: 'M-sort', instalmentSeq: 1, dueDateIso: '2026-07-01' }),
      makePayment({ id: 'M-sort-i2', mouId: 'M-sort', instalmentSeq: 2, dueDateIso: '2026-10-01' }),
    ]
    const out = getYearSpecificInstalments(mou, '2026-27', payments)
    expect(out.map((p) => p.instalmentSeq)).toEqual([1, 2, 3])
  })

  it('excludes payments without dueDateIso', () => {
    const mou = makeMou({ id: 'M-null' })
    const payments = [
      makePayment({ mouId: 'M-null', dueDateIso: null }),
      makePayment({ mouId: 'M-null', dueDateIso: '2026-07-01' }),
    ]
    expect(getYearSpecificInstalments(mou, '2026-27', payments)).toHaveLength(1)
  })

  it('excludes payments belonging to other MOUs', () => {
    const mou = makeMou({ id: 'M-self' })
    const payments = [
      makePayment({ mouId: 'M-self', dueDateIso: '2026-07-01' }),
      makePayment({ mouId: 'M-other', dueDateIso: '2026-07-01' }),
    ]
    expect(getYearSpecificInstalments(mou, '2026-27', payments)).toHaveLength(1)
  })
})
