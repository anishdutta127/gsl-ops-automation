import { describe, expect, it } from 'vitest'
import {
  formatInstalmentPercent,
  instalmentSharePct,
  scheduleAddsUp,
} from './instalmentPercent'

describe('formatInstalmentPercent', () => {
  it('returns whole-percent without decimals (25% rather than 25.00%)', () => {
    expect(formatInstalmentPercent(25000, 100000)).toBe('25%')
  })

  it('returns half-percent with single decimal (12.5%)', () => {
    expect(formatInstalmentPercent(12500, 100000)).toBe('12.5%')
  })

  it('returns thirds rounded to two decimals (33.33%)', () => {
    expect(formatInstalmentPercent(33333, 100000)).toBe('33.33%')
  })

  it('returns null when contract value is zero (caller renders dash)', () => {
    expect(formatInstalmentPercent(10000, 0)).toBeNull()
  })

  it('returns null when contract value is negative (corrupted data)', () => {
    expect(formatInstalmentPercent(10000, -1)).toBeNull()
  })

  it('returns 100% for a single-instalment full-payment row', () => {
    expect(formatInstalmentPercent(150000, 150000)).toBe('100%')
  })

  it('strips trailing zero on .50 (50% not 50.0%)', () => {
    expect(formatInstalmentPercent(50000, 100000)).toBe('50%')
  })

  it('handles a 10-30-30-30 split cleanly', () => {
    expect(formatInstalmentPercent(10000, 100000)).toBe('10%')
    expect(formatInstalmentPercent(30000, 100000)).toBe('30%')
  })
})

describe('instalmentSharePct (Add MOU schedule, 1-dp display)', () => {
  it('computes the raw percent share', () => {
    expect(instalmentSharePct(70800, 283200)).toBeCloseTo(25, 5)
    expect(instalmentSharePct(141600, 283200)).toBeCloseTo(50, 5)
  })

  it('formats to one decimal place for display (25.2%)', () => {
    // 71400 / 283200 = 25.21...% -> "25.2" at one decimal place
    expect(instalmentSharePct(71400, 283200).toFixed(1)).toBe('25.2')
  })

  it('returns 0 when contract value is zero or negative', () => {
    expect(instalmentSharePct(10000, 0)).toBe(0)
    expect(instalmentSharePct(10000, -5)).toBe(0)
  })

  it('returns 0 for a non-finite amount (empty input)', () => {
    expect(instalmentSharePct(Number(''), 100000)).toBe(0)
  })
})

describe('scheduleAddsUp (0.1% tolerance gate for the mismatch warning)', () => {
  it('true for an exact 25-25-25-25 split', () => {
    expect(scheduleAddsUp(283200, 283200)).toBe(true)
  })

  it('true within a few rupees of rounding (inside 0.1%)', () => {
    // 283198 is 99.9993% of 283200, well inside 0.1%.
    expect(scheduleAddsUp(283198, 283200)).toBe(true)
  })

  it('false when the total is materially short or over (outside 0.1%)', () => {
    expect(scheduleAddsUp(200000, 283200)).toBe(false)
    expect(scheduleAddsUp(300000, 283200)).toBe(false)
  })

  it('false when the contract value is unknown', () => {
    expect(scheduleAddsUp(50000, 0)).toBe(false)
  })
})
