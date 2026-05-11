import { describe, it, expect } from 'vitest'
import type { MOU } from '@/lib/types'
import {
  defaultFyOptions,
  fyOptionsFor,
  isoInWindow,
  parseReportFilters,
  reportSubtitle,
  resolveReportWindow,
  serializeReportFilters,
} from './filters'

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'S',
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
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 365,
    auditLog: [],
    ...over,
  }
}

describe('reports/filters parseReportFilters', () => {
  it('parses canonical query params', () => {
    const f = parseReportFilters({
      fy: '2026-27',
      dept: 'ops',
      from: '2026-04-01',
      to: '2026-12-31',
    })
    expect(f).toEqual({
      fy: '2026-27',
      dept: 'ops',
      from: '2026-04-01',
      to: '2026-12-31',
    })
  })

  it('defaults dept to "All" on unknown value', () => {
    const f = parseReportFilters({ dept: 'banana' })
    expect(f.dept).toBe('All')
  })

  it('rejects invalid FY format', () => {
    expect(parseReportFilters({ fy: 'bad' }).fy).toBeNull()
    expect(parseReportFilters({ fy: '2026-2027' }).fy).toBeNull()
  })

  it('rejects malformed dates', () => {
    expect(parseReportFilters({ from: '13-99-99' }).from).toBeNull()
    expect(parseReportFilters({ from: '2026-13-99' }).from).toBeNull()
  })

  it('accepts empty searchParams as empty filters', () => {
    const f = parseReportFilters({})
    expect(f.fy).toBeNull()
    expect(f.dept).toBe('All')
    expect(f.from).toBeNull()
    expect(f.to).toBeNull()
  })
})

describe('reports/filters serializeReportFilters', () => {
  it('emits canonical query string', () => {
    const s = serializeReportFilters({
      fy: '2026-27',
      dept: 'sales',
      from: '2026-04-01',
      to: '2026-12-31',
    })
    expect(s).toContain('fy=2026-27')
    expect(s).toContain('dept=sales')
    expect(s).toContain('from=2026-04-01')
    expect(s).toContain('to=2026-12-31')
  })

  it('omits dept when "All"', () => {
    const s = serializeReportFilters({
      fy: '2026-27',
      dept: 'All',
      from: null,
      to: null,
    })
    expect(s).not.toContain('dept=')
    expect(s).toContain('fy=2026-27')
  })
})

describe('reports/filters resolveReportWindow', () => {
  it('returns explicit from/to when both set', () => {
    const w = resolveReportWindow({
      fy: '2026-27',
      dept: 'All',
      from: '2026-05-01',
      to: '2026-06-30',
    })
    expect(w).toEqual({ from: '2026-05-01', to: '2026-06-30' })
  })

  it('falls back to FY range when only fy is set', () => {
    const w = resolveReportWindow({
      fy: '2026-27',
      dept: 'All',
      from: null,
      to: null,
    })
    expect(w.from).toBe('2026-04-01')
    expect(w.to).toBe('2027-03-31')
  })

  it('returns null window when nothing is set', () => {
    const w = resolveReportWindow({
      fy: null,
      dept: 'All',
      from: null,
      to: null,
    })
    expect(w).toEqual({ from: null, to: null })
  })
})

describe('reports/filters fyOptions helpers', () => {
  it('fyOptionsFor returns distinct sorted-desc list', () => {
    const m1 = mou({ academicYear: '2024-25' })
    const m2 = mou({ id: 'M2', academicYear: '2026-27' })
    const m3 = mou({ id: 'M3', academicYear: '2025-26' })
    const opts = fyOptionsFor([m1, m2, m3], new Date('2026-05-01T00:00:00Z'))
    expect(opts[0]).toBe('2026-27')
    expect(opts).toContain('2025-26')
    expect(opts).toContain('2024-25')
  })

  it('defaultFyOptions returns at most 3', () => {
    const mous = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'].map(
      (ay, i) => mou({ id: `M${i}`, academicYear: ay }),
    )
    expect(
      defaultFyOptions(mous, new Date('2026-05-01T00:00:00Z')).length,
    ).toBeLessThanOrEqual(3)
  })
})

describe('reports/filters isoInWindow', () => {
  it('returns false for null iso', () => {
    expect(isoInWindow(null, '2026-04-01', '2026-12-31')).toBe(false)
  })

  it('returns true when both bounds are null', () => {
    expect(isoInWindow('2026-05-01', null, null)).toBe(true)
  })

  it('respects inclusive bounds', () => {
    expect(isoInWindow('2026-04-01', '2026-04-01', '2026-12-31')).toBe(true)
    expect(isoInWindow('2026-12-31', '2026-04-01', '2026-12-31')).toBe(true)
    expect(isoInWindow('2026-03-31', '2026-04-01', '2026-12-31')).toBe(false)
  })
})

describe('reports/filters reportSubtitle', () => {
  it('renders FY when set', () => {
    const s = reportSubtitle(
      { fy: '2026-27', dept: 'All', from: null, to: null },
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(s).toContain('FY 2026-27')
  })

  it('renders department when not All', () => {
    const s = reportSubtitle(
      { fy: null, dept: 'finance', from: null, to: null },
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(s).toContain('Dept: finance')
  })

  it('falls back to "As of" when nothing is set', () => {
    const s = reportSubtitle(
      { fy: null, dept: 'All', from: null, to: null },
      new Date('2026-05-12T00:00:00Z'),
    )
    expect(s).toContain('As of')
  })
})
