/*
 * Unit tests for chainReconciliation (Gate 5A Step 4).
 *
 * Covers: candidate listing with dismissal filtering, source tagging
 * (snapshot vs fy26-27 import), chain-name suggestion via common prefix,
 * consolidation building (SchoolGroup record + School audit entries).
 */

import { describe, it, expect } from 'vitest'
import type { School } from '@/lib/types'
import {
  TECHNO_INDIA_CHAIN_IDS,
  buildChainCandidates,
  buildConsolidation,
  suggestChainName,
} from './chainReconciliation'

function school(over: Partial<School> & { id: string }): School {
  return {
    name: over.name ?? 'School',
    legalEntity: null,
    city: 'Mumbai',
    state: 'MH',
    region: 'East',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...over,
  } as School
}

describe('buildChainCandidates', () => {
  it('lists every snapshot entry when no dismissals', () => {
    const rows = buildChainCandidates({
      snapshotCandidates: [
        { schoolId: 'SCH-A', name: 'A' },
        { schoolId: 'SCH-B', name: 'B' },
      ],
      dismissedIds: [],
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.schoolId)).toEqual(['SCH-A', 'SCH-B'])
  })

  it('filters out dismissed candidates', () => {
    const rows = buildChainCandidates({
      snapshotCandidates: [
        { schoolId: 'SCH-A', name: 'A' },
        { schoolId: 'SCH-B', name: 'B' },
        { schoolId: 'SCH-C', name: 'C' },
      ],
      dismissedIds: ['SCH-B'],
    })
    expect(rows.map((r) => r.schoolId)).toEqual(['SCH-A', 'SCH-C'])
  })

  it('tags Techno India branches with source fy26-27-import', () => {
    const rows = buildChainCandidates({
      snapshotCandidates: [
        { schoolId: TECHNO_INDIA_CHAIN_IDS[0]!, name: 'TIG Kalyani' },
        { schoolId: 'SCH-OTHER', name: 'Some other chain' },
      ],
      dismissedIds: [],
    })
    expect(rows[0]!.source).toBe('fy26-27-import')
    expect(rows[1]!.source).toBe('snapshot')
  })
})

describe('suggestChainName', () => {
  it('returns the common prefix when one exists', () => {
    expect(
      suggestChainName([
        'Sri R. N. Singh Memorial High School',
        'Sri R. N. Singh Memorial High School (For Class 8)',
      ]),
    ).toBe('Sri R. N. Singh Memorial High School')
  })

  it('returns the first name when no common prefix is long enough', () => {
    expect(suggestChainName(['A Trust', 'B Group'])).toBe('A Trust')
  })

  it('returns the only name when one member', () => {
    expect(suggestChainName(['Solo School'])).toBe('Solo School')
  })

  it('returns empty string when no members', () => {
    expect(suggestChainName([])).toBe('')
  })

  it('trims punctuation from the prefix tail', () => {
    expect(
      suggestChainName([
        'Techno India Group Public School Kalyani',
        'Techno India Group Public School Asansol',
      ]),
    ).toBe('Techno India Group Public School')
  })
})

describe('buildConsolidation', () => {
  it('emits a new SchoolGroup row with members + correct id slug', () => {
    const members = [school({ id: 'SCH-A' }), school({ id: 'SCH-B' })]
    const result = buildConsolidation({
      members,
      input: {
        memberSchoolIds: ['SCH-A', 'SCH-B'],
        chainName: 'Techno India Group',
        region: 'East',
        createdBy: 'anish.d',
      },
      now: new Date('2026-05-12T10:00:00Z'),
    })
    expect(result.group.id).toBe('SG-TECHNO_INDIA_GROUP')
    expect(result.group.memberSchoolIds).toEqual(['SCH-A', 'SCH-B'])
    expect(result.group.createdBy).toBe('anish.d')
    expect(result.group.region).toBe('East')
    expect(result.group.auditLog).toHaveLength(1)
    expect(result.group.auditLog[0]!.action).toBe('create')
  })

  it('appends audit entries to each member school carrying schoolGroupId in after', () => {
    const members = [school({ id: 'SCH-A' }), school({ id: 'SCH-B' })]
    const result = buildConsolidation({
      members,
      input: {
        memberSchoolIds: ['SCH-A', 'SCH-B'],
        chainName: 'Test Chain',
        region: 'East',
        createdBy: 'admin.user',
      },
      now: new Date('2026-05-12T10:00:00Z'),
    })
    expect(result.updatedSchools).toHaveLength(2)
    for (const s of result.updatedSchools) {
      const lastEntry = s.auditLog[s.auditLog.length - 1]!
      expect(lastEntry.action).toBe('update')
      expect(lastEntry.after).toEqual({ schoolGroupId: 'SG-TEST_CHAIN' })
      expect(lastEntry.user).toBe('admin.user')
    }
  })

  it('truncates id slug at 40 characters', () => {
    const result = buildConsolidation({
      members: [school({ id: 'SCH-A' })],
      input: {
        memberSchoolIds: ['SCH-A'],
        chainName: 'A Very Very Very Very Very Very Very Very Long Chain Name That Exceeds The Limit',
        region: 'East',
        createdBy: 'anish.d',
      },
      now: new Date('2026-05-12T10:00:00Z'),
    })
    // 'SG-' prefix + 40-char slug = max 43 chars total.
    expect(result.group.id.length).toBeLessThanOrEqual(43)
    expect(result.group.id.startsWith('SG-')).toBe(true)
  })
})
