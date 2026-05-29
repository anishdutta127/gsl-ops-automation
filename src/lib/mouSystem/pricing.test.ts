/*
 * Round 4 Bug 2: deriveSpWithoutTax pins the per-student without-GST
 * value to the same Math.round(withTax / (1 + gstRate)) derivation
 * generatePi.ts uses for the PI subtotal. Without this anchor the
 * wizard's yearly-pricing grid and the PI receipt drift on round-trip
 * (the "Rs 19" rounding issue the user flagged).
 */

import { describe, expect, it } from 'vitest'
import { deriveSpWithoutTax, DEFAULT_GST_RATE } from './pricing'

describe('deriveSpWithoutTax (Round 4 Bug 2)', () => {
  it('derives Rs 1017 from Rs 1200 with-GST at the default 18% rate', () => {
    expect(deriveSpWithoutTax(1200)).toBe(1017)
  })

  it('matches the PI subtotal derivation Math.round(withTax / (1 + gstRate))', () => {
    // The PI generator's anchor: Math.round(total / (1 + gstRate)).
    for (const withTax of [800, 1200, 2500, 4500, 12345]) {
      const expected = Math.round(withTax / (1 + DEFAULT_GST_RATE))
      expect(deriveSpWithoutTax(withTax)).toBe(expected)
    }
  })

  it('returns 0 for non-positive or non-finite input', () => {
    expect(deriveSpWithoutTax(0)).toBe(0)
    expect(deriveSpWithoutTax(-1)).toBe(0)
    expect(deriveSpWithoutTax(NaN)).toBe(0)
    expect(deriveSpWithoutTax(Infinity)).toBe(0)
  })

  it('respects a caller-supplied GST rate override', () => {
    // 5% rate path (some VEX product variants).
    expect(deriveSpWithoutTax(1050, 0.05)).toBe(1000)
  })

  it('default rate matches config/company.json (currently 0.18)', () => {
    expect(DEFAULT_GST_RATE).toBe(0.18)
  })
})
