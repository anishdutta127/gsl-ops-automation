import { describe, expect, it } from 'vitest'
import { regionForSalesPerson } from './regions'

describe('regionForSalesPerson (salesperson -> region slice)', () => {
  it('returns a single territory as-is', () => {
    expect(regionForSalesPerson({ territories: ['West Bengal'] })).toBe('West Bengal')
  })

  it('joins multiple territories', () => {
    expect(regionForSalesPerson({ territories: ['Tamil Nadu', 'Karnataka'] })).toBe('Tamil Nadu, Karnataka')
  })

  it('trims and drops blank territories', () => {
    expect(regionForSalesPerson({ territories: ['  Kerala ', '', '  '] })).toBe('Kerala')
  })

  it('returns null when no territory is set (caller must surface, not save blank)', () => {
    expect(regionForSalesPerson({ territories: [] })).toBeNull()
    expect(regionForSalesPerson({ territories: ['', ' '] })).toBeNull()
    expect(regionForSalesPerson(null)).toBeNull()
    expect(regionForSalesPerson(undefined)).toBeNull()
  })
})
