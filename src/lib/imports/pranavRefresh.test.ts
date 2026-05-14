import { describe, expect, it } from 'vitest'
import xlsx from 'xlsx'
import { parsePranavRefresh } from './pranavRefresh'

/*
 * Tests for the Gate 5A.8 Pranav refresh parser. Each test builds a
 * synthetic sheet with aoa_to_sheet so the parser exercises the same
 * cell-shape contract as the real workbook (Date objects, error cells,
 * trailing whitespace, blank Sr. No. continuation rows).
 */

const HEADER_BAND_ROW = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'INSTALLMENT I',
  '',
  '',
  '',
  'INSTALLMENT II',
]
const HEADER_LABEL_ROW = [
  'Sr. No.',
  'Name of School',
  'Status',
  'No. of Schools',
  'Sales Representative',
  'Physical copy & Scanned',
  'MOU',
  'Kits Sent',
  'Model',
  'Duration',
  'City / Location',
  'State',
  'No. of Students (As per MOU)',
  'Sale Amount as per MOU  (including Tax)',
  'Actual No. of Students (As per Invoice)',
  'SP per Student (w/o Tax)',
  'SP per Student (including Tax)',
  'Sales Amount (including Tax)',
  'Amount Received',
  'TDS Amount',
  'Balance Outstanding',
  '% Received',
  '',
  '%',
  'Amount',
  'Month',
  'Payment Receive',
  '%',
  'Amount',
  'Month',
  'Payment Received',
]

function buildSheet(dataRows: unknown[][]): xlsx.WorkSheet {
  const aoa: unknown[][] = [
    [],
    [],
    [],
    [],
    HEADER_BAND_ROW,
    HEADER_LABEL_ROW,
    ...dataRows,
  ]
  return xlsx.utils.aoa_to_sheet(aoa)
}

function wb(sheet: xlsx.WorkSheet, name = '2026-27PD '): xlsx.WorkBook {
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, name)
  return book
}

describe('parsePranavRefresh', () => {
  it('parses a simple complete row', () => {
    const sheet = buildSheet([
      [
        1,
        'Test School',
        'New',
        1,
        'Roveena',
        'No',
        'YES',
        'Sent',
        'TT',
        '01st April 2026 to 31st march 2027',
        'Kargil',
        'Ladakh',
        500,
        400000,
        500,
        678,
        800,
        400000,
        100000,
        0,
        300000,
        0.25,
        '',
        0.5,
        200000,
        new Date('2026-05-31T00:00:00.000Z'),
        'YES',
        0.5,
        200000,
        new Date('2026-08-31T00:00:00.000Z'),
        '',
      ],
    ])
    const result = parsePranavRefresh(wb(sheet))
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]!
    expect(row.schoolName).toBe('Test School')
    expect(row.trainerModel).toBe('TT')
    expect(row.studentsMou).toBe(500)
    expect(row.contractValue).toBe(400000)
    expect(row.installments).toHaveLength(2)
    expect(row.installments[0]!.monthIso).toBe('2026-05-31')
    expect(row.installments[0]!.isReceived).toBe(true)
    expect(row.installments[1]!.isReceived).toBe(false)
    expect(row.needsReview).toBe(false)
  })

  it('treats blank Sr. No. with repeated school name as a continuation row', () => {
    const sheet = buildSheet([
      [44, 'Empyrean School', 'New', 1, 'Sumit', 'No', 'No', '', 'Bootcamp', '01st April 2026 to 31st march 2027', 'X', 'Y', 9, 10800, 9, 1017, 1200, 10800, 10800],
      ['', 'Empyrean School', 'New', 1, 'Sumit', 'No', 'No', '', 'Bootcamp', '01st April 2026 to 31st march 2027', 'X', 'Y', 19, 47500, 19, 2119, 2500, 47500, 47500],
    ])
    const result = parsePranavRefresh(wb(sheet))
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]!.isContinuationRow).toBe(false)
    expect(result.rows[1]!.isContinuationRow).toBe(true)
    expect(result.summary.continuationRows).toBe(1)
    expect(result.summary.multiProductSchools).toEqual([
      { name: 'Empyrean School', rowNums: [7, 8] },
    ])
  })

  it('preserves verbatim non-date Month values and flags needs-review', () => {
    const sheet = buildSheet([
      [
        1,
        'Some School',
        'New',
        1,
        'Rep',
        'No',
        'No',
        '',
        'TT',
        '01st April 2026 to 31st march 2027',
        'X',
        'Y',
        100,
        100000,
        100,
        850,
        1000,
        100000,
        0,
        0,
        100000,
        0,
        '',
        0.5,
        50000,
        'advance',
        '',
        0.5,
        50000,
        'before commencement',
        '',
      ],
    ])
    const result = parsePranavRefresh(wb(sheet))
    const row = result.rows[0]!
    expect(row.installments[0]!.monthRaw).toBe('advance')
    expect(row.installments[0]!.monthIso).toBeNull()
    expect(row.installments[1]!.monthRaw).toBe('before commencement')
    expect(row.installments[1]!.monthIso).toBeNull()
    expect(row.needsReview).toBe(true)
    expect(row.rowWarnings.some((w) => w.includes('not ISO-parseable'))).toBe(true)
  })

  it('parses Apr-26 style short-month strings to ISO', () => {
    const sheet = buildSheet([
      [
        1,
        'Apr School',
        'New',
        1,
        'Rep',
        'No',
        'No',
        '',
        'TT',
        '01st April 2026 to 31st march 2027',
        'X',
        'Y',
        100,
        100000,
        100,
        850,
        1000,
        100000,
        0,
        0,
        100000,
        0,
        '',
        1.0,
        100000,
        'Apr-26',
        '',
      ],
    ])
    const result = parsePranavRefresh(wb(sheet))
    const inst = result.rows[0]!.installments[0]!
    expect(inst.monthIso).toBe('2026-04-01')
    expect(inst.monthRaw).toBe('Apr-26')
  })

  it('skips truly empty rows and records the reason', () => {
    const sheet = buildSheet([
      [],
      [1, 'Real School', 'New', 1, 'Rep', 'No', 'No', '', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
    ])
    const result = parsePranavRefresh(wb(sheet))
    expect(result.rows).toHaveLength(1)
    expect(result.skipped.some((s) => s.reason === 'empty row')).toBe(true)
  })

  it('trims trailing whitespace from school name and sales rep', () => {
    const sheet = buildSheet([
      [1, 'Vijaya English Primary School ', 'New', 1, 'Balachandra ', 'No', 'No', '', 'GSL-T', '01st April 2026 to 31st march 2027', 'X', 'Y', 250, 375000, 250, 1271, 1500, 0],
    ])
    const result = parsePranavRefresh(wb(sheet))
    const row = result.rows[0]!
    expect(row.schoolName).toBe('Vijaya English Primary School')
    expect(row.salesRepName).toBe('Balachandra')
    expect(row.schoolSlug).toBe('vijaya-english-primary-school')
  })

  it('flags trainer model out of enum as needs-review', () => {
    const sheet = buildSheet([
      [1, 'School', 'New', 1, 'Rep', 'No', 'No', '', 'WAT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
    ])
    const result = parsePranavRefresh(wb(sheet))
    const row = result.rows[0]!
    expect(row.trainerModel).toBeNull()
    expect(row.modelRaw).toBe('WAT')
    expect(row.needsReview).toBe(true)
    expect(row.rowWarnings.some((w) => w.includes('out of enum'))).toBe(true)
  })

  it('flags sale-amount=0 with kits-sent as needs-review', () => {
    const sheet = buildSheet([
      [1, 'Jnana School', 'New', 1, 'Rep', 'No', 'No', 'Done', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 200, 0, 200, 0, 0, 0],
    ])
    const result = parsePranavRefresh(wb(sheet))
    const row = result.rows[0]!
    expect(row.contractValue).toBe(0)
    expect(row.kitsSent).toBe('Done')
    expect(row.needsReview).toBe(true)
  })

  it('produces deterministic identical output across two runs (idempotent parse)', () => {
    const sheet = buildSheet([
      [1, 'School A', 'New', 1, 'Rep', 'No', 'No', '', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
      [2, 'School B', 'Retained', 1, 'Rep2', 'Yes', 'YES', '', 'GSL-T', '01st April 2026 to 31st march 2027', 'X', 'Y', 200, 240000, 200, 1017, 1200, 240000, 100000, 0, 140000, 0.42],
    ])
    const a = parsePranavRefresh(wb(sheet))
    const b = parsePranavRefresh(wb(sheet))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('handles Excel error cells by treating them as null', () => {
    const sheet = buildSheet([
      [1, 'Err School', 'New', 1, 'Rep', 'No', 'No', '', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
    ])
    // Inject a #DIV/0! cell at V (col 22, % Received).
    const addr = 'V7'
    sheet[addr] = { t: 'e', v: 7 } as xlsx.CellObject
    const result = parsePranavRefresh(wb(sheet))
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })

  it('reports multi-product schools across non-consecutive rows', () => {
    const sheet = buildSheet([
      [1, 'Acme', 'New', 1, 'Rep', 'No', 'No', '', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
      [2, 'Beta', 'New', 1, 'Rep', 'No', 'No', '', 'TT', '01st April 2026 to 31st march 2027', 'X', 'Y', 100, 100000, 100, 850, 1000, 100000],
      [3, 'Acme', 'New', 1, 'Rep', 'No', 'No', '', 'GSL-T', '01st April 2026 to 31st march 2027', 'X', 'Y', 50, 75000, 50, 1500, 1500, 75000],
    ])
    const result = parsePranavRefresh(wb(sheet))
    expect(result.summary.multiProductSchools).toEqual([
      { name: 'Acme', rowNums: [7, 9] },
    ])
  })

  it('flags installment percentages that sum != 1.0', () => {
    const sheet = buildSheet([
      [
        1,
        'Pct School',
        'New',
        1,
        'Rep',
        'No',
        'No',
        '',
        'TT',
        '01st April 2026 to 31st march 2027',
        'X',
        'Y',
        100,
        100000,
        100,
        850,
        1000,
        100000,
        0,
        0,
        100000,
        0,
        '',
        0.3,
        30000,
        new Date('2026-05-31T00:00:00.000Z'),
        '',
        0.4,
        40000,
        new Date('2026-08-31T00:00:00.000Z'),
        '',
      ],
    ])
    const result = parsePranavRefresh(wb(sheet))
    expect(result.warnings.some((w) => w.message.includes('% sum'))).toBe(true)
  })
})
