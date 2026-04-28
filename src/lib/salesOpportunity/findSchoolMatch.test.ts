/*
 * W4-F.3 findSchoolMatch tests.
 */

import { describe, expect, it } from 'vitest'
import type { School } from '@/lib/types'
import { findSchoolMatch, SCHOOL_MATCH_THRESHOLD } from './findSchoolMatch'

function school(id: string, name: string, city = 'Bangalore'): School {
  return {
    id, name, legalEntity: null, city, state: 'Karnataka',
    region: 'South-West', pinCode: null, contactPerson: null,
    email: null, phone: null, billingName: null, pan: null,
    gstNumber: null, notes: null, active: true,
    createdAt: '2026-04-28T00:00:00Z', auditLog: [],
  }
}

describe('W4-F.3 findSchoolMatch', () => {
  it('returns null when no school crosses the threshold', () => {
    const schools = [
      school('SCH-A', 'Hogwarts School of Witchcraft'),
      school('SCH-B', 'Beauxbatons Academy'),
    ]
    expect(findSchoolMatch('Springfield Elementary', schools)).toBeNull()
  })

  it('returns the top match when one school crosses 0.7', () => {
    const schools = [
      school('SCH-A', 'Frank Public School'),
      school('SCH-B', 'Other Place'),
    ]
    const result = findSchoolMatch('Frank Public', schools)
    expect(result).not.toBeNull()
    expect(result!.schoolId).toBe('SCH-A')
    expect(result!.score).toBeGreaterThanOrEqual(SCHOOL_MATCH_THRESHOLD)
  })

  it('picks the highest score when multiple cross the threshold', () => {
    const schools = [
      school('SCH-A', 'Greenfield Public'),
      school('SCH-B', 'Greenfield Academy'),
    ]
    const result = findSchoolMatch('Greenfield Public', schools)
    expect(result).not.toBeNull()
    expect(result!.schoolId).toBe('SCH-A')
  })

  it('exposes the threshold constant for callers', () => {
    expect(SCHOOL_MATCH_THRESHOLD).toBe(0.7)
  })
})
