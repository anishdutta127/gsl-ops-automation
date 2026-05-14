/*
 * Gate 5A.8 Step 4: tests for the TypeScript classify port.
 *
 * Each test builds a tiny aoa_to_sheet workbook, runs the parser, and
 * feeds the result into classifyRefresh alongside hand-built MOU /
 * Payment / School arrays. The cases mirror the four classification
 * paths plus the multi-product schools alignment.
 */

import { describe, expect, it } from 'vitest'
import xlsx from 'xlsx'
import { parsePranavRefresh, type ParseResult } from './pranavRefresh'
import { classifyRefresh } from './pranavDiff'
import type { MOU, School } from '../types'

const HEADER_ROW = [
  'Sr. No.', 'Name of School', 'Status', 'No. of Schools', 'Sales Rep',
  'Physical', 'MOU', 'Kits', 'Model', 'Duration', 'City', 'State',
  'Students', 'Sale', 'Actual', 'SPwo', 'SPw', 'SA', 'Recv', 'TDS',
  'Bal', '%',
]

function parseOneRow(row: (string | number | Date | null)[]): ParseResult {
  const sheet = xlsx.utils.aoa_to_sheet([
    [], [], [], [], [],
    HEADER_ROW,
    row,
  ])
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, '2026-27PD')
  return parsePranavRefresh(book)
}

function parseMultipleRows(rows: (string | number | Date | null)[][]): ParseResult {
  const sheet = xlsx.utils.aoa_to_sheet([
    [], [], [], [], [],
    HEADER_ROW,
    ...rows,
  ])
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, '2026-27PD')
  return parsePranavRefresh(book)
}

function mouFixture(over: Partial<MOU>): MOU {
  return {
    id: 'MOU-STEAM-2627-001',
    schoolId: 'sch-test',
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
    ...over,
  } as MOU
}

function schoolFixture(over: Partial<School>): School {
  return {
    id: 'sch-test',
    name: 'Test School',
    legalEntity: null,
    city: '',
    state: '',
    region: '',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    auditLog: [],
    ...over,
  } as School
}

describe('classifyRefresh', () => {
  it('classifies a row with no school match as NEW', () => {
    const parsed = parseOneRow([
      1, 'Brand New School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      100, 100000, null, 850, 1000, 100000, 0, 0, 100000, 0,
    ])
    const result = classifyRefresh({ parsed, mous: [], payments: [], schools: [] })
    expect(result.summary.NEW).toBe(1)
    expect(result.classified[0]!.classification).toBe('NEW')
    expect(result.classified[0]!.matchedMouId).toBeNull()
  })

  it('classifies a matching row with no field differences as UNCHANGED', () => {
    const parsed = parseOneRow([
      1, 'Test School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      100, 100000, null, 850, 1000, 100000, 0, 0, 100000, 0,
    ])
    const mou = mouFixture({
      schoolName: 'Test School',
      trainerModel: 'TT',
      contractValue: 100000,
      studentsMou: 100,
      spWithoutTax: 850,
      spWithTax: 1000,
    })
    const school = schoolFixture({ city: 'CityX', state: 'StateX' })
    const result = classifyRefresh({
      parsed,
      mous: [mou],
      payments: [],
      schools: [school],
    })
    expect(result.summary.UNCHANGED).toBe(1)
    expect(result.classified[0]!.classification).toBe('UNCHANGED')
    expect(result.classified[0]!.matchedMouId).toBe('MOU-STEAM-2627-001')
  })

  it('classifies a row that fills a blank field as UPDATE', () => {
    const parsed = parseOneRow([
      1, 'Test School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      150, 100000, 100, 850, 1000, 100000, 0, 0, 100000, 0,
    ])
    const mou = mouFixture({
      schoolName: 'Test School',
      trainerModel: 'TT',
      contractValue: 100000,
      studentsMou: 0,
      spWithoutTax: 850,
      spWithTax: 1000,
    })
    const result = classifyRefresh({
      parsed,
      mous: [mou],
      payments: [],
      schools: [],
    })
    expect(result.summary.UPDATE).toBe(1)
    expect(result.classified[0]!.classification).toBe('UPDATE')
    const studentsDiff = result.classified[0]!.mouDiffs.find((d) => d.field === 'studentsMou')
    expect(studentsDiff?.kind).toBe('fill')
  })

  it('classifies a contradiction on a non-null field as CONFLICT', () => {
    const parsed = parseOneRow([
      1, 'Test School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      150, 100000, 100, 850, 1000, 100000, 0, 0, 100000, 0,
    ])
    const mou = mouFixture({
      schoolName: 'Test School',
      trainerModel: 'TT',
      contractValue: 100000,
      studentsMou: 200,            // disagrees with refresh 150 (non-null overwrite)
      studentsActual: 175,         // disagrees with refresh 100 (non-null overwrite)
      spWithoutTax: 850,
      spWithTax: 1000,
    })
    const result = classifyRefresh({
      parsed,
      mous: [mou],
      payments: [],
      schools: [],
    })
    expect(result.summary.CONFLICT).toBe(1)
    expect(result.classified[0]!.classification).toBe('CONFLICT')
    const studentsDiff = result.classified[0]!.mouDiffs.find((d) => d.field === 'studentsMou')
    expect(studentsDiff?.kind).toBe('overwrite')
  })

  it('aligns multi-product schools by trainerModel and contractValue', () => {
    const parsed = parseMultipleRows([
      [
        1, 'MultiProduct School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
        '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
        100, 100000, null, 850, 1000, 100000, 0, 0, 100000, 0,
      ],
      [
        null, 'MultiProduct School', 'New', 1, 'Rep', 'No', 'No', '', 'GSL-T',
        '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
        200, 250000, null, 1000, 1250, 250000, 0, 0, 250000, 0,
      ],
    ])
    const mouTt = mouFixture({
      id: 'MOU-STEAM-2627-100',
      schoolName: 'MultiProduct School',
      trainerModel: 'TT',
      contractValue: 100000,
      studentsMou: 100,
      spWithoutTax: 850,
      spWithTax: 1000,
    })
    const mouGslt = mouFixture({
      id: 'MOU-STEAM-2627-101',
      schoolName: 'MultiProduct School',
      trainerModel: 'GSL-T',
      contractValue: 250000,
      studentsMou: 200,
      spWithoutTax: 1000,
      spWithTax: 1250,
    })
    const result = classifyRefresh({
      parsed,
      mous: [mouTt, mouGslt],
      payments: [],
      schools: [],
    })
    // Both rows should align to the right MOU and classify as UNCHANGED.
    expect(result.classified).toHaveLength(2)
    const ttRow = result.classified.find((c) => c.refreshRow.trainerModel === 'TT')
    const gsltRow = result.classified.find((c) => c.refreshRow.trainerModel === 'GSL-T')
    expect(ttRow?.matchedMouId).toBe('MOU-STEAM-2627-100')
    expect(gsltRow?.matchedMouId).toBe('MOU-STEAM-2627-101')
  })
})
