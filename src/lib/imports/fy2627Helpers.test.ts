import { describe, expect, it } from 'vitest'
import {
  extractCretileGrade,
  inventoryItemId,
  isYes,
  parseDateCell,
  parseDuration,
  parseNumber,
  parseTrainerModel,
  slugify,
} from './fy2627Helpers'

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Sunrise High School')).toBe('sunrise-high-school')
  })

  it('collapses double hyphens', () => {
    expect(slugify('Hello,, World')).toBe('hello-world')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify(' -- foo -- ')).toBe('foo')
  })

  it('handles null/undefined/empty', () => {
    expect(slugify(null)).toBe('')
    expect(slugify(undefined)).toBe('')
    expect(slugify('')).toBe('')
  })

  it('is idempotent on re-application', () => {
    const a = slugify('Riverdale Academy, Delhi')
    expect(slugify(a)).toBe(a)
  })
})

describe('parseNumber', () => {
  it('returns null on null/undefined/empty', () => {
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('strips Rs/INR/commas before parsing', () => {
    expect(parseNumber('Rs 1,50,000')).toBe(150000)
    expect(parseNumber('INR 500')).toBe(500)
    expect(parseNumber('1,000.50')).toBe(1000.5)
  })

  it('returns null for hyphen-only', () => {
    expect(parseNumber('-')).toBeNull()
  })

  it('returns numbers verbatim', () => {
    expect(parseNumber(42)).toBe(42)
    expect(parseNumber(0)).toBe(0)
  })

  it('returns null for unparseable strings', () => {
    expect(parseNumber('not a number')).toBeNull()
  })
})

describe('isYes', () => {
  it('matches YES/Yes/yes/Y case-insensitively', () => {
    expect(isYes('YES')).toBe(true)
    expect(isYes('Yes')).toBe(true)
    expect(isYes('yes')).toBe(true)
    expect(isYes('Y')).toBe(true)
  })

  it('rejects No/blank/null', () => {
    expect(isYes('No')).toBe(false)
    expect(isYes('')).toBe(false)
    expect(isYes(null)).toBe(false)
    expect(isYes(undefined)).toBe(false)
  })
})

describe('parseTrainerModel', () => {
  it('TT stays TT', () => {
    expect(parseTrainerModel('TT')).toBe('TT')
  })

  it('TTT maps to GSL-T', () => {
    expect(parseTrainerModel('TTT')).toBe('GSL-T')
  })

  it('Bootcamp recognised', () => {
    expect(parseTrainerModel('Bootcamp')).toBe('Bootcamp')
  })

  it('AIQ recognised (Gate 4.7 Step 6b enum addition)', () => {
    expect(parseTrainerModel('AIQ')).toBe('AIQ')
    expect(parseTrainerModel('aiq')).toBe('AIQ') // case-insensitive
  })

  it('Out-of-enum value returns null', () => {
    expect(parseTrainerModel('XYZ')).toBeNull()
  })

  it('blank/hyphen returns null', () => {
    expect(parseTrainerModel('')).toBeNull()
    expect(parseTrainerModel('-')).toBeNull()
    expect(parseTrainerModel(null)).toBeNull()
  })
})

describe('parseDuration', () => {
  it('parses ordinal full pattern', () => {
    const d = parseDuration('01st April 2026 to 31st March 2027')
    expect(d.start).toBe('2026-04-01')
    expect(d.end).toBe('2027-03-31')
    expect(d.fallback).toBe(false)
  })

  it('parses two-year MOU duration', () => {
    const d = parseDuration('01st April 2026 to 31st march 2028')
    expect(d.start).toBe('2026-04-01')
    expect(d.end).toBe('2028-03-31')
  })

  it('falls back to FY defaults on unparseable input', () => {
    const d = parseDuration('something weird')
    expect(d.fallback).toBe(true)
    expect(d.start).toBe('2026-04-01')
    expect(d.end).toBe('2027-03-31')
  })

  it('falls back on null/undefined', () => {
    const d = parseDuration(null)
    expect(d.fallback).toBe(true)
  })
})

describe('parseDateCell', () => {
  it('passes through Date instances as ISO date', () => {
    expect(parseDateCell(new Date('2026-04-15T00:00:00Z'))).toBe('2026-04-15')
  })

  it('returns null on null/undefined/empty', () => {
    expect(parseDateCell(null)).toBeNull()
    expect(parseDateCell(undefined)).toBeNull()
    expect(parseDateCell('')).toBeNull()
  })

  it('returns null on garbage strings', () => {
    expect(parseDateCell('not a date')).toBeNull()
  })

  it('extracts ISO prefix from a longer string', () => {
    expect(parseDateCell('2026-04-15 some trailing junk')).toBe('2026-04-15')
  })
})

describe('extractCretileGrade', () => {
  it('extracts the digit run from "Grade 5"', () => {
    expect(extractCretileGrade('Grade 5')).toBe(5)
  })

  it('extracts from "Grade -8" (handles the typo in Misba sheet)', () => {
    expect(extractCretileGrade('Grade -8')).toBe(8)
  })

  it('returns 0 when no digit present', () => {
    expect(extractCretileGrade('Beginner Level')).toBe(0)
  })
})

describe('inventoryItemId', () => {
  it('Cretile -> per-grade id', () => {
    expect(inventoryItemId('Grade 5', 'Cretile', 5)).toBe('INV-CRETILE-G5')
  })

  it('TW -> slugified SKU id', () => {
    expect(inventoryItemId('T-Aske', 'TW', 0)).toBe('INV-TW-T-ASKE')
  })

  it('Hardware -> slugified SKU id with HW prefix', () => {
    expect(inventoryItemId('Smart Board', 'Hardware', 0)).toBe('INV-HW-SMART-BOARD')
  })
})
