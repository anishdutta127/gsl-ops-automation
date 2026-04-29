import { describe, expect, it } from 'vitest'
import {
  SUPER_REGION_MEMBERS,
  regionsForSuperRegion,
  superRegionFor,
} from './regions'

describe('SUPER_REGION_MEMBERS', () => {
  it('NE covers North + East', () => {
    expect(SUPER_REGION_MEMBERS.NE).toEqual(['North', 'East'])
  })

  it('SW covers South-West + South + West (Ameet grouping; superset across both taxonomies)', () => {
    expect(SUPER_REGION_MEMBERS.SW).toEqual(['South-West', 'South', 'West'])
  })
})

describe('regionsForSuperRegion', () => {
  it('returns NE members', () => {
    expect(regionsForSuperRegion('NE')).toEqual(['North', 'East'])
  })
  it('returns SW members', () => {
    expect(regionsForSuperRegion('SW')).toEqual(['South-West', 'South', 'West'])
  })
})

describe('superRegionFor', () => {
  it.each([
    ['North', 'NE'],
    ['East', 'NE'],
    ['South-West', 'SW'],
    ['South', 'SW'],
    ['West', 'SW'],
  ])('maps %s -> %s', (region, expected) => {
    expect(superRegionFor(region)).toBe(expected)
  })

  it('returns null for Central (belongs to neither super-region)', () => {
    expect(superRegionFor('Central')).toBeNull()
  })

  it('returns null for unknown region', () => {
    expect(superRegionFor('Antarctica')).toBeNull()
  })
})
