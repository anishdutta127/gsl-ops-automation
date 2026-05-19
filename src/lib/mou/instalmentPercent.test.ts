import { describe, expect, it } from 'vitest'
import { formatInstalmentPercent } from './instalmentPercent'

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
