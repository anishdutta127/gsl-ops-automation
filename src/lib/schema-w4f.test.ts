/*
 * W4-F.1 schema sanity. Verifies the SalesOpportunity entity shape
 * compiles, the seed JSON is a well-formed empty array, the new
 * permission Actions are wired into the matrix, and the new
 * PendingUpdateEntity value is queue-reachable.
 *
 * Free-text fields (status / recceStatus / gslModel / approvalNotes)
 * are accepted as-is; no enum normalisation is performed in Phase 1
 * per Anish's option C decision. D-026 captures the post-round-2
 * workflow vocabulary that lands the state machine + approval +
 * conversion-to-MOU flows.
 */

import { describe, expect, it } from 'vitest'
import type {
  PendingUpdateEntity,
  SalesOpportunity,
} from '@/lib/types'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import { canPerform } from '@/lib/auth/permissions'

describe('W4-F.1 SalesOpportunity schema', () => {
  it('sales_opportunities.json seeds as an empty array; W4-F.2 list page renders empty-state until operators create rows', () => {
    const rows = salesOpportunitiesJson as unknown as SalesOpportunity[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBe(0)
  })

  it('SalesOpportunity carries the 12 W4-F.1 fields plus standard metadata + auditLog', () => {
    const sample: SalesOpportunity = {
      id: 'OPP-2627-001',
      schoolName: 'Example School',
      schoolId: null,
      city: 'Bangalore',
      state: 'Karnataka',
      region: 'South-West',
      salesRepId: 'sp-vikram',
      programmeProposed: 'STEAM',
      gslModel: 'GSL-Trainer (free text)',
      commitmentsMade: 'Recce by 2026-05-15; MOU draft by 2026-05-30.',
      outOfScopeRequirements: null,
      recceStatus: 'pending',
      recceCompletedAt: null,
      status: 'recce-needed',
      approvalNotes: null,
      conversionMouId: null,
      lossReason: null,
      schoolMatchDismissed: false,
      createdAt: '2026-04-28T00:00:00Z',
      createdBy: 'sp-vikram',
      auditLog: [],
    }
    expect(sample.id).toMatch(/^OPP-/)
    expect(sample.schoolId).toBeNull()
    expect(sample.programmeProposed).toBe('STEAM')
    expect(sample.gslModel).toBe('GSL-Trainer (free text)')
    expect(sample.recceStatus).toBe('pending')
    expect(typeof sample.status).toBe('string')
    expect(sample.status.length).toBeGreaterThan(0)
  })
})

describe('W4-F.1 permission Actions wired into the matrix', () => {
  function user(
    id: string,
    role: 'Admin' | 'SalesHead' | 'SalesRep' | 'OpsEmployee' | 'Finance',
  ): import('@/lib/types').User {
    return {
      id,
      name: id,
      email: `${id}@getsetlearn.info`,
      role,
      testingOverride: false,
      active: true,
      passwordHash: 'bcrypt:placeholder',
      createdAt: '2026-04-28T00:00:00Z',
      auditLog: [],
    }
  }

  it('Admin wildcard grants the 4 sales-opportunity actions', () => {
    const admin = user('anish.d', 'Admin')
    expect(canPerform(admin, 'sales-opportunity:create')).toBe(true)
    expect(canPerform(admin, 'sales-opportunity:edit')).toBe(true)
    expect(canPerform(admin, 'sales-opportunity:view')).toBe(true)
    expect(canPerform(admin, 'sales-opportunity:mark-lost')).toBe(true)
  })

  it('SalesRep can create / edit / view / mark-lost; OpsEmployee gets view-only', () => {
    const rep = user('vishwanath.g', 'SalesRep')
    expect(canPerform(rep, 'sales-opportunity:create')).toBe(true)
    expect(canPerform(rep, 'sales-opportunity:edit')).toBe(true)
    expect(canPerform(rep, 'sales-opportunity:view')).toBe(true)
    expect(canPerform(rep, 'sales-opportunity:mark-lost')).toBe(true)

    const ops = user('test.ops', 'OpsEmployee')
    expect(canPerform(ops, 'sales-opportunity:view')).toBe(true)
    expect(canPerform(ops, 'sales-opportunity:create')).toBe(false)
    expect(canPerform(ops, 'sales-opportunity:edit')).toBe(false)
    expect(canPerform(ops, 'sales-opportunity:mark-lost')).toBe(false)
  })

  it('Finance gets view-only (read-only access for cross-team awareness)', () => {
    const fin = user('shubhangi.g', 'Finance')
    expect(canPerform(fin, 'sales-opportunity:view')).toBe(true)
    expect(canPerform(fin, 'sales-opportunity:create')).toBe(false)
    expect(canPerform(fin, 'sales-opportunity:edit')).toBe(false)
    expect(canPerform(fin, 'sales-opportunity:mark-lost')).toBe(false)
  })
})

describe('W4-F.1 PendingUpdateEntity reaches the new entity', () => {
  it('salesOpportunity is a valid queue entity value', () => {
    const entity: PendingUpdateEntity = 'salesOpportunity'
    expect(typeof entity).toBe('string')
    expect(entity.length).toBeGreaterThan(0)
  })
})
