import { describe, it, expect } from 'vitest'
import { buildCsv, csvCell, csvRow } from './csv'

describe('csvCell', () => {
  it('returns empty string for null + undefined', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('stringifies numbers without quoting', () => {
    expect(csvCell(42)).toBe('42')
  })

  it('returns raw text when no special chars', () => {
    expect(csvCell('hello')).toBe('hello')
  })

  it('quotes when comma is present', () => {
    expect(csvCell('a, b')).toBe('"a, b"')
  })

  it('escapes inner quotes by doubling', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes when newline is present', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('quotes when carriage return is present', () => {
    expect(csvCell('a\rb')).toBe('"a\rb"')
  })
})

describe('csvRow', () => {
  it('joins cells with comma', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('handles mixed types', () => {
    expect(csvRow(['name', 42, null])).toBe('name,42,')
  })
})

describe('buildCsv', () => {
  it('emits header + rows with LF separators', () => {
    const csv = buildCsv(
      ['A', 'B'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
    )
    expect(csv).toBe('A,B\n1,2\n3,4')
  })

  it('escapes commas inside cells', () => {
    const csv = buildCsv(['A'], [['x, y']])
    expect(csv).toBe('A\n"x, y"')
  })
})
