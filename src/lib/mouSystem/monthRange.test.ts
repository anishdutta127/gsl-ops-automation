import { describe, it, expect } from 'vitest'
import { monthsInRange, monthsForYear, formatMonthLabel } from './monthRange'

describe('monthsInRange', () => {
  it('returns every month in a 1-year MOU (Apr 2026 - Mar 2027 = 12 months)', () => {
    const out = monthsInRange('2026-04-01', '2027-03-31')
    expect(out).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
    ])
  })

  it('returns 24 months for a 2-year MOU', () => {
    const out = monthsInRange('2026-04-01', '2028-03-31')
    expect(out).toHaveLength(24)
    expect(out[0]).toBe('2026-04')
    expect(out[23]).toBe('2028-03')
  })

  it('handles same-month start and end', () => {
    expect(monthsInRange('2026-04-01', '2026-04-30')).toEqual(['2026-04'])
  })

  it('returns empty when end is before start', () => {
    expect(monthsInRange('2026-06-01', '2026-04-01')).toEqual([])
  })

  it('returns empty when inputs are missing or invalid', () => {
    expect(monthsInRange('', '2026-04-01')).toEqual([])
    expect(monthsInRange('2026-04-01', '')).toEqual([])
    expect(monthsInRange('not-a-date', '2026-04-01')).toEqual([])
  })
})

describe('monthsForYear', () => {
  it('Year 1 of a 2-year MOU returns the first 12 months', () => {
    const out = monthsForYear('2026-04-01', 1, '2028-03-31')
    expect(out[0]).toBe('2026-04')
    expect(out).toHaveLength(12)
    expect(out[11]).toBe('2027-03')
  })

  it('Year 2 of a 2-year MOU returns the next 12 months', () => {
    const out = monthsForYear('2026-04-01', 2, '2028-03-31')
    expect(out[0]).toBe('2027-04')
    expect(out).toHaveLength(12)
    expect(out[11]).toBe('2028-03')
  })

  it('Year beyond duration returns an empty list', () => {
    expect(monthsForYear('2026-04-01', 3, '2028-03-31')).toEqual([])
  })
})

describe('formatMonthLabel', () => {
  it('renders YYYY-MM as a long label', () => {
    expect(formatMonthLabel('2026-04')).toBe('April 2026')
    expect(formatMonthLabel('2027-12')).toBe('December 2027')
  })

  it('returns input verbatim when not in YYYY-MM form', () => {
    expect(formatMonthLabel('Year 1 · Q1')).toBe('Year 1 · Q1')
    expect(formatMonthLabel('')).toBe('')
  })
})
