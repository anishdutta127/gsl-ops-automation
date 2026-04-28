/*
 * W4-F.2 createOpportunity tests.
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  PendingUpdate,
  SalesOpportunity,
  SalesPerson,
  User,
} from '@/lib/types'
import {
  createOpportunity,
  REGION_OPTIONS,
  type CreateOpportunityDeps,
} from './createOpportunity'

const NOW = new Date('2026-04-28T12:00:00.000Z')

function user(id: string, role: User['role'] = 'SalesRep'): User {
  return {
    id,
    name: id,
    email: `${id}@getsetlearn.info`,
    role,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

const SP_VIKRAM: SalesPerson = {
  id: 'sp-vikram',
  name: 'Vikram T.',
  email: 'vikram.t@getsetlearn.info',
  phone: null,
  territories: ['Pune'],
  programmes: ['STEAM'],
  active: true,
  joinedDate: '2025-04-01',
}

function makeDeps(overrides: Partial<CreateOpportunityDeps> = {}): {
  deps: CreateOpportunityDeps
  calls: PendingUpdate[]
} {
  const calls: PendingUpdate[] = []
  let i = 0
  const enqueue = vi.fn(async (params) => {
    const entry: PendingUpdate = {
      id: 'P-' + ++i,
      queuedAt: NOW.toISOString(),
      retryCount: 0,
      ...params,
    }
    calls.push(entry)
    return entry
  }) as unknown as CreateOpportunityDeps['enqueue']
  return {
    deps: {
      opportunities: [],
      salesPersons: [SP_VIKRAM],
      users: [user('vishwanath.g'), user('anish.d', 'Admin')],
      enqueue,
      uuid: () => 'uuid1',
      now: () => NOW,
      ...overrides,
    },
    calls,
  }
}

const VALID_ARGS = {
  schoolName: 'Test School',
  schoolId: null,
  city: 'Pune',
  state: 'Maharashtra',
  region: 'South-West',
  salesRepId: 'sp-vikram',
  programmeProposed: 'STEAM' as const,
  gslModel: 'GSL-Trainer',
  commitmentsMade: 'Recce by 2026-05-15.',
  outOfScopeRequirements: null,
  recceStatus: 'pending',
  recceCompletedAt: null,
  status: 'recce-needed',
  approvalNotes: null,
  createdBy: 'vishwanath.g',
}

describe('W4-F.2 createOpportunity happy path', () => {
  it('creates an OPP-2627-001 opportunity with audit + enqueue', async () => {
    const { deps, calls } = makeDeps()
    const result = await createOpportunity(VALID_ARGS, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.opportunity.id).toBe('OPP-2627-001')
    expect(result.opportunity.schoolName).toBe('Test School')
    expect(result.opportunity.region).toBe('South-West')
    expect(result.opportunity.status).toBe('recce-needed')
    expect(result.opportunity.auditLog[0]!.action).toBe('opportunity-created')
    expect(calls.length).toBe(1)
    expect(calls[0]!.entity).toBe('salesOpportunity')
  })

  it('increments OPP id sequentially within an academic year', async () => {
    const existing: SalesOpportunity = {
      id: 'OPP-2627-001', schoolName: 'X', schoolId: null, city: 'X', state: 'X',
      region: 'East', salesRepId: 'sp-vikram', programmeProposed: null,
      gslModel: null, commitmentsMade: null, outOfScopeRequirements: null,
      recceStatus: null, recceCompletedAt: null, status: 'recce-done',
      approvalNotes: null, conversionMouId: null, lossReason: null,
      schoolMatchDismissed: false,
      createdAt: NOW.toISOString(), createdBy: 'vishwanath.g', auditLog: [],
    }
    const { deps } = makeDeps({ opportunities: [existing] })
    const result = await createOpportunity(VALID_ARGS, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.opportunity.id).toBe('OPP-2627-002')
  })
})

describe('W4-F.2 createOpportunity validation', () => {
  it('returns permission failure when user lacks sales-opportunity:create', async () => {
    const finance = user('shubhangi.g', 'Finance')
    const { deps } = makeDeps({ users: [finance] })
    const result = await createOpportunity(
      { ...VALID_ARGS, createdBy: finance.id },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('permission')
  })

  it('rejects empty school name', async () => {
    const { deps } = makeDeps()
    const result = await createOpportunity({ ...VALID_ARGS, schoolName: '   ' }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-school-name')
  })

  it('rejects invalid region', async () => {
    const { deps } = makeDeps()
    const result = await createOpportunity({ ...VALID_ARGS, region: 'Atlantis' }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-region')
  })

  it('rejects empty status (required free-text)', async () => {
    const { deps } = makeDeps()
    const result = await createOpportunity({ ...VALID_ARGS, status: '   ' }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-status')
  })

  it('rejects unknown salesRepId', async () => {
    const { deps } = makeDeps()
    const result = await createOpportunity({ ...VALID_ARGS, salesRepId: 'sp-ghost' }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown-sales-rep')
  })

  it('rejects malformed recceCompletedAt', async () => {
    const { deps } = makeDeps()
    const result = await createOpportunity(
      { ...VALID_ARGS, recceCompletedAt: '2026/04/28' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-recce-completed-at')
  })

  it('exposes the 6 region options the form binds to', () => {
    expect(REGION_OPTIONS).toEqual([
      'South-West',
      'East',
      'North',
      'Central',
      'West',
      'South',
    ])
  })
})
