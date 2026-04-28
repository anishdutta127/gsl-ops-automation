/*
 * W4-F.3 markOpportunityLost tests.
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  PendingUpdate,
  SalesOpportunity,
  User,
} from '@/lib/types'
import {
  markOpportunityLost,
  type MarkOpportunityLostDeps,
} from './markOpportunityLost'

const NOW = new Date('2026-04-28T12:00:00.000Z')

function user(id: string, role: User['role']): User {
  return {
    id, name: id, email: `${id}@getsetlearn.info`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  }
}

function opp(overrides: Partial<SalesOpportunity> = {}): SalesOpportunity {
  return {
    id: 'OPP-2627-001', schoolName: 'Test', schoolId: null,
    city: 'Pune', state: 'Maharashtra', region: 'South-West',
    salesRepId: 'sp-vikram', programmeProposed: null,
    gslModel: null, commitmentsMade: null, outOfScopeRequirements: null,
    recceStatus: null, recceCompletedAt: null, status: 'x',
    approvalNotes: null, conversionMouId: null, lossReason: null,
    schoolMatchDismissed: false,
    createdAt: NOW.toISOString(), createdBy: 'vishwanath.g', auditLog: [],
    ...overrides,
  }
}

function makeDeps(overrides: Partial<MarkOpportunityLostDeps> = {}): {
  deps: MarkOpportunityLostDeps
  calls: PendingUpdate[]
} {
  const calls: PendingUpdate[] = []
  let i = 0
  const enqueue = vi.fn(async (params) => {
    const entry: PendingUpdate = {
      id: 'P-' + ++i, queuedAt: NOW.toISOString(), retryCount: 0, ...params,
    }
    calls.push(entry)
    return entry
  }) as unknown as MarkOpportunityLostDeps['enqueue']
  return {
    deps: {
      opportunities: [opp()],
      users: [
        user('vishwanath.g', 'SalesRep'),
        user('pratik.d', 'SalesHead'),
        user('shubhangi.g', 'Finance'),
      ],
      enqueue,
      now: () => NOW,
      ...overrides,
    },
    calls,
  }
}

describe('W4-F.3 markOpportunityLost', () => {
  it('sets lossReason and writes opportunity-marked-lost audit', async () => {
    const { deps } = makeDeps()
    const result = await markOpportunityLost(
      {
        id: 'OPP-2627-001',
        lossReason: 'School chose competitor',
        markedBy: 'vishwanath.g',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.opportunity.lossReason).toBe('School chose competitor')
    const last = result.opportunity.auditLog[result.opportunity.auditLog.length - 1]!
    expect(last.action).toBe('opportunity-marked-lost')
  })

  it('rejects empty lossReason', async () => {
    const { deps } = makeDeps()
    const result = await markOpportunityLost(
      { id: 'OPP-2627-001', lossReason: '   ', markedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-loss-reason')
  })

  it('rejects already-lost opportunity (idempotent)', async () => {
    const lost = opp({ lossReason: 'Already gone' })
    const { deps } = makeDeps({ opportunities: [lost] })
    const result = await markOpportunityLost(
      { id: lost.id, lossReason: 'New reason', markedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('already-lost')
  })

  it('SalesRep cannot mark another rep\'s opportunity as lost', async () => {
    const ownedByOther = opp({ createdBy: 'pratik.d' })
    const { deps } = makeDeps({ opportunities: [ownedByOther] })
    const result = await markOpportunityLost(
      { id: ownedByOther.id, lossReason: 'X', markedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-creator-and-not-lead')
  })

  it('Finance has no permission', async () => {
    const { deps } = makeDeps()
    const result = await markOpportunityLost(
      { id: 'OPP-2627-001', lossReason: 'X', markedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('permission')
  })
})
