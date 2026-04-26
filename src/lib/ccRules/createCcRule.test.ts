import { describe, expect, it, vi } from 'vitest'
import {
  createCcRule,
  type CreateCcRuleDeps,
} from './createCcRule'
import type { CcRule, PendingUpdate, SalesPerson, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function salesPerson(id: string): SalesPerson {
  return {
    id, name: id, email: `${id}@example.test`, phone: null,
    territories: [], programmes: ['STEAM'],
    active: true, joinedDate: '2025-06-01',
  }
}

function rule(overrides: Partial<CcRule> = {}): CcRule {
  return {
    id: 'CCR-EXISTING', sheet: 'East', scope: 'region',
    scopeValue: 'East', contexts: ['all-communications'],
    ccUserIds: ['someone'], enabled: true,
    sourceRuleText: 'Existing rule',
    createdAt: FIXED_TS, createdBy: 'import',
    disabledAt: null, disabledBy: null, disabledReason: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  rules?: CcRule[]
  users: User[]
  salesTeam?: SalesPerson[]
}): { deps: CreateCcRuleDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      rules: opts.rules ?? [],
      users: opts.users,
      salesTeam: opts.salesTeam ?? [],
      enqueue: enqueue as unknown as CreateCcRuleDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

const happyArgs = {
  id: 'CCR-NORTH-DELHI',
  sheet: 'North' as const,
  scope: 'sub-region' as const,
  scopeValue: ['Delhi', 'Gurugram'],
  contexts: ['all-communications' as const],
  ccUserIds: ['anish.d'],
  sourceRuleText: 'Cc Anish on Delhi and Gurugram comms',
  createdBy: 'anish.d',
}

describe('createCcRule', () => {
  it('happy path: Admin creates rule, audit entry recorded, queue enqueued', async () => {
    const u = user('Admin', 'anish.d')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createCcRule(happyArgs, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.id).toBe('CCR-NORTH-DELHI')
    expect(result.rule.enabled).toBe(true)
    expect(result.rule.createdBy).toBe('anish.d')
    expect(result.rule.auditLog).toHaveLength(1)
    expect(result.rule.auditLog[0]?.action).toBe('cc-rule-created')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'ccRule', operation: 'create' })
  })

  it('OpsHead is REJECTED (cc-rule:create is Admin-only for the 30-day window)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, createdBy: 'misba.m' }, deps)
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('OpsEmployee with testingOverride [OpsHead] is REJECTED (cc-rule:create still Admin-only)', async () => {
    const u: User = {
      ...user('OpsEmployee', 'misba.m'),
      testingOverride: true,
      testingOverridePermissions: ['OpsHead'],
    }
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, createdBy: 'misba.m' }, deps)
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ users: [] })
    const result = await createCcRule({ ...happyArgs, createdBy: 'ghost' }, deps)
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects duplicate id (existing rule with same id)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({
      users: [u],
      rules: [rule({ id: 'CCR-NORTH-DELHI' })],
    })
    const result = await createCcRule(happyArgs, deps)
    expect(result).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('rejects id missing CCR- prefix', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, id: 'NORTH-DELHI' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })

  it('rejects id with lowercase characters (uppercase + hyphens convention)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, id: 'CCR-north-delhi' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })

  it('rejects empty contexts array', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, contexts: [] }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-contexts' })
  })

  it('rejects empty scopeValue array', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, scopeValue: [] }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-scope-value' })
  })

  it('rejects empty-string scopeValue (single token)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, scopeValue: '   ' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-scope-value' })
  })

  it('rejects ccUserIds that do not resolve in users.json or sales_team.json', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule(
      { ...happyArgs, ccUserIds: ['anish.d', 'sp-ghost'] },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-cc-user-ids' })
  })

  it('accepts ccUserIds that resolve via sales_team.json', async () => {
    const u = user('Admin', 'anish.d')
    const sp = salesPerson('sp-vikram')
    const { deps } = makeDeps({ users: [u], salesTeam: [sp] })
    const result = await createCcRule(
      { ...happyArgs, ccUserIds: ['sp-vikram'] },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects empty sourceRuleText', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule({ ...happyArgs, sourceRuleText: '   ' }, deps)
    expect(result).toEqual({ ok: false, reason: 'missing-source-rule-text' })
  })

  it('accepts a single-token scopeValue (e.g., scope:school with one schoolId)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createCcRule(
      { ...happyArgs, scope: 'school', scopeValue: 'SCH-DPS-DELHI' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rule.scopeValue).toBe('SCH-DPS-DELHI')
  })
})
