import { describe, expect, it } from 'vitest'
import { parseDimensions, applyDimensionFilters, applyTextSearch } from './filterParsing'

describe('parseDimensions', () => {
  it('returns empty arrays for absent params', () => {
    expect(parseDimensions({}, ['a', 'b'])).toEqual({ a: [], b: [] })
  })

  it('splits comma-separated values', () => {
    expect(parseDimensions({ a: 'x,y,z' }, ['a'])).toEqual({ a: ['x', 'y', 'z'] })
  })

  it('trims whitespace + drops empty values', () => {
    expect(parseDimensions({ a: ' x , , y ' }, ['a'])).toEqual({ a: ['x', 'y'] })
  })

  it('handles array-shaped query params (rare but possible)', () => {
    expect(parseDimensions({ a: ['x', 'y'] }, ['a'])).toEqual({ a: ['x', 'y'] })
  })
})

describe('applyDimensionFilters', () => {
  const rows = [
    { id: 'r1', region: 'East', programme: 'STEAM' },
    { id: 'r2', region: 'East', programme: 'TinkRworks' },
    { id: 'r3', region: 'North', programme: 'STEAM' },
  ]
  const sel = {
    region: (r: typeof rows[0]) => r.region,
    programme: (r: typeof rows[0]) => r.programme,
  }

  it('returns all rows when no filter set', () => {
    expect(applyDimensionFilters(rows, { region: [], programme: [] }, sel)).toEqual(rows)
  })

  it('AND across dimensions', () => {
    const result = applyDimensionFilters(
      rows,
      { region: ['East'], programme: ['STEAM'] },
      sel,
    )
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('OR within a single dimension', () => {
    const result = applyDimensionFilters(
      rows,
      { region: ['East', 'North'], programme: [] },
      sel,
    )
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('selector returning null filters the row out when dimension is active', () => {
    const result = applyDimensionFilters(
      rows.concat({ id: 'r4', region: '', programme: 'STEAM' }),
      { region: ['East'], programme: [] },
      { ...sel, region: (r) => (r.region === '' ? null : r.region) },
    )
    expect(result.map((r) => r.id)).not.toContain('r4')
  })
})

describe('applyTextSearch', () => {
  const rows = [
    { id: 'r1', name: 'Greenfield Academy' },
    { id: 'r2', name: 'Oakwood Senior' },
  ]
  it('returns all rows when query is empty / undefined', () => {
    expect(applyTextSearch(rows, undefined, (r) => [r.name])).toEqual(rows)
    expect(applyTextSearch(rows, '', (r) => [r.name])).toEqual(rows)
    expect(applyTextSearch(rows, '   ', (r) => [r.name])).toEqual(rows)
  })

  it('case-insensitive substring match across selected fields', () => {
    const result = applyTextSearch(rows, 'oak', (r) => [r.name])
    expect(result.map((r) => r.id)).toEqual(['r2'])
  })
})
