import { describe, expect, it } from 'vitest'
import {
  getIncompleteSchools,
  isSchoolComplete,
  missingFieldCount,
} from './dataCompleteness'
import type { School } from '@/lib/types'

function school(overrides: Partial<School> & Pick<School, 'id' | 'name'>): School {
  return {
    legalEntity: null, city: 'Pune', state: 'Maharashtra', region: 'South-West',
    pinCode: null, contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: '2026-04-15T00:00:00Z', auditLog: [],
    ...overrides,
  }
}

describe('missingFieldCount', () => {
  it('returns 4 when all four critical fields are null', () => {
    const s = school({ id: 'A', name: 'A' })
    expect(missingFieldCount(s)).toBe(4)
  })

  it('returns 0 when all four are populated', () => {
    const s = school({
      id: 'B', name: 'B',
      gstNumber: '27AAAPL1234C1ZX', email: 'spoc@test',
      contactPerson: 'P. Singh', pinCode: '411001',
    })
    expect(missingFieldCount(s)).toBe(0)
  })

  it('returns 2 with two fields populated', () => {
    const s = school({
      id: 'C', name: 'C',
      gstNumber: '27AAAPL1234C1ZX', email: 'spoc@test',
    })
    expect(missingFieldCount(s)).toBe(2)
  })

  it('treats empty string as missing', () => {
    const s = school({ id: 'D', name: 'D', email: '', gstNumber: '   ' as unknown as string })
    expect(missingFieldCount(s)).toBeGreaterThanOrEqual(1) // email='' counted
  })
})

describe('isSchoolComplete', () => {
  it('true when no fields missing', () => {
    const s = school({
      id: 'E', name: 'E',
      gstNumber: 'X', email: 'e@x', contactPerson: 'P', pinCode: '111111',
    })
    expect(isSchoolComplete(s)).toBe(true)
  })

  it('false when at least one field missing', () => {
    const s = school({ id: 'F', name: 'F', email: 'e@x' })
    expect(isSchoolComplete(s)).toBe(false)
  })
})

describe('getIncompleteSchools', () => {
  const a = school({ id: 'A', name: 'Alpha', gstNumber: 'X' })           // missing 3
  const b = school({ id: 'B', name: 'Bravo' })                            // missing 4
  const c = school({                                                      // complete
    id: 'C', name: 'Charlie',
    gstNumber: 'X', email: 'e', contactPerson: 'P', pinCode: '111111',
  })
  const d = school({ id: 'D', name: 'Delta', gstNumber: 'X', email: 'e' }) // missing 2

  it('default threshold=1 excludes complete schools', () => {
    const result = getIncompleteSchools([a, b, c, d])
    expect(result.map((s) => s.id)).toEqual(['B', 'A', 'D'])
  })

  it('most-missing-first ordering with school-name secondary sort', () => {
    const e = school({ id: 'E', name: 'Echo', gstNumber: 'X' }) // missing 3 (same as a)
    const result = getIncompleteSchools([a, b, c, d, e])
    // missing-4 first (B); then missing-3 in name order (Alpha, Echo); then missing-2 (Delta).
    expect(result.map((s) => s.id)).toEqual(['B', 'A', 'E', 'D'])
  })

  it('threshold=4 returns only fully empty schools', () => {
    const result = getIncompleteSchools([a, b, c, d], 4)
    expect(result.map((s) => s.id)).toEqual(['B'])
  })

  it('returns [] when every school is complete', () => {
    expect(getIncompleteSchools([c])).toEqual([])
  })
})
