/*
 * W4-F.3 editOpportunity tests.
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  PendingUpdate,
  SalesOpportunity,
  SalesPerson,
  User,
} from '@/lib/types'
import { editOpportunity, type EditOpportunityDeps } from './editOpportunity'

const NOW = new Date('2026-04-28T12:00:00.000Z')

function user(id: string, role: User['role']): User {
  return {
    id, name: id, email: `${id}@getsetlearn.info`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  }
}

const SP_VIKRAM: SalesPerson = {
  id: 'sp-vikram', name: 'Vikram', email: 'vikram@x.in',
  phone: null, territories: [], programmes: ['STEAM'],
  active: true, joinedDate: '2025-04-01',
}

function opp(overrides: Partial<SalesOpportunity> = {}): SalesOpportunity {
  return {
    id: 'OPP-2627-001', schoolName: 'Test School', schoolId: null,
    city: 'Pune', state: 'Maharashtra', region: 'South-West',
    salesRepId: 'sp-vikram', programmeProposed: 'STEAM',
    gslModel: null, commitmentsMade: null, outOfScopeRequirements: null,
    recceStatus: null, recceCompletedAt: null, status: 'recce-needed',
    approvalNotes: null, conversionMouId: null, lossReason: null,
    schoolMatchDismissed: false,
    createdAt: NOW.toISOString(), createdBy: 'vishwanath.g', auditLog: [],
    ...overrides,
  }
}

function makeDeps(overrides: Partial<EditOpportunityDeps> = {}): {
  deps: EditOpportunityDeps
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
  }) as unknown as EditOpportunityDeps['enqueue']
  return {
    deps: {
      opportunities: [opp()],
      salesPersons: [SP_VIKRAM, { ...SP_VIKRAM, id: 'sp-rohan', name: 'Rohan' }],
      users: [
        user('vishwanath.g', 'SalesRep'),
        user('pratik.d', 'SalesHead'),
        user('anish.d', 'Admin'),
        user('shubhangi.g', 'Finance'),
      ],
      enqueue,
      now: () => NOW,
      ...overrides,
    },
    calls,
  }
}

describe('W4-F.3 editOpportunity status fidelity', () => {
  it('captures verbatim before/after on a status change in the audit entry', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      {
        id: 'OPP-2627-001',
        patch: { status: 'awaiting Pratik approval' },
        editedBy: 'vishwanath.g',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changedFields).toEqual(['status'])
    const audit = result.opportunity.auditLog[result.opportunity.auditLog.length - 1]!
    expect(audit.action).toBe('opportunity-edited')
    expect(audit.before?.status).toBe('recce-needed')
    expect(audit.after?.status).toBe('awaiting Pratik approval')
  })

  it('captures multiple changed fields in one audit entry', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      {
        id: 'OPP-2627-001',
        patch: { status: 'recce done', recceStatus: 'Done', recceCompletedAt: '2026-04-25' },
        editedBy: 'vishwanath.g',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changedFields.sort()).toEqual(
      ['recceCompletedAt', 'recceStatus', 'status'].sort(),
    )
  })
})

describe('W4-F.3 editOpportunity ownership', () => {
  it('SalesRep cannot edit another rep\'s opportunity', async () => {
    const ownedByOther = opp({ createdBy: 'pratik.d' })
    const { deps } = makeDeps({ opportunities: [ownedByOther] })
    const result = await editOpportunity(
      { id: ownedByOther.id, patch: { status: 'changed' }, editedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-creator-and-not-lead')
  })

  it('SalesHead can edit any opportunity', async () => {
    const ownedByOther = opp({ createdBy: 'someone-else' })
    const { deps } = makeDeps({ opportunities: [ownedByOther] })
    const result = await editOpportunity(
      { id: ownedByOther.id, patch: { status: 'pratik approved' }, editedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('Finance has no sales-opportunity:edit permission', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      { id: 'OPP-2627-001', patch: { status: 'x' }, editedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('permission')
  })
})

describe('W4-F.3 editOpportunity validation', () => {
  it('rejects no-op patches with no-changes', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      { id: 'OPP-2627-001', patch: { status: 'recce-needed' }, editedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-changes')
  })

  it('rejects empty status', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      { id: 'OPP-2627-001', patch: { status: '   ' }, editedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-status')
  })

  it('rejects invalid region', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      { id: 'OPP-2627-001', patch: { region: 'Atlantis' }, editedBy: 'vishwanath.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-region')
  })
})

describe('W4-F.3 editOpportunity school-match dismissal', () => {
  it('captures schoolMatchDismissed flip in the audit log', async () => {
    const { deps } = makeDeps()
    const result = await editOpportunity(
      {
        id: 'OPP-2627-001',
        patch: { schoolMatchDismissed: true },
        editedBy: 'vishwanath.g',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.opportunity.schoolMatchDismissed).toBe(true)
    expect(result.changedFields).toEqual(['schoolMatchDismissed'])
  })
})
