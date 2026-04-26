import { describe, expect, it, vi } from 'vitest'
import { editCcRule, type EditCcRuleDeps } from './editCcRule'
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
    id: 'CCR-NORTH-DELHI', sheet: 'North', scope: 'sub-region',
    scopeValue: ['Delhi'], contexts: ['all-communications'],
    ccUserIds: ['anish.d'], enabled: true,
    sourceRuleText: 'Cc Anish on Delhi comms',
    createdAt: FIXED_TS, createdBy: 'anish.d',
    disabledAt: null, disabledBy: null, disabledReason: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  rules: CcRule[]
  users: User[]
  salesTeam?: SalesPerson[]
}): { deps: EditCcRuleDeps; calls: Array<Record<string, unknown>> } {
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
      rules: opts.rules, users: opts.users,
      salesTeam: opts.salesTeam ?? [],
      enqueue: enqueue as unknown as EditCcRuleDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editCcRule', () => {
  it('happy path: OpsHead edits sourceRuleText, diffed audit entry recorded', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule()
    const { deps, calls } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { sourceRuleText: 'Updated rule text' },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.sourceRuleText).toBe('Updated rule text')
    expect(result.rule.auditLog).toHaveLength(1)
    const entry = result.rule.auditLog[0]!
    expect(entry.action).toBe('update')
    expect(entry.before).toMatchObject({ sourceRuleText: 'Cc Anish on Delhi comms' })
    expect(entry.after).toMatchObject({ sourceRuleText: 'Updated rule text' })
    expect(calls[0]).toMatchObject({ entity: 'ccRule', operation: 'update' })
  })

  it('Admin can edit (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const r = rule()
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'anish.d',
        patch: { contexts: ['welcome-note', 'dispatch-notification'] },
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (cc-rule:edit not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const r = rule()
    const { deps, calls } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'pratik.d',
        patch: { sourceRuleText: 'Hijack' },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects rule-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ rules: [], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NOPE',
        editedBy: 'misba.m',
        patch: { sourceRuleText: 'X' },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'rule-not-found' })
  })

  it('rejects no-change (patch fields all match existing values)', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule({ sourceRuleText: 'Same text' })
    const { deps, calls } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { sourceRuleText: 'Same text' },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-change' })
    expect(calls).toHaveLength(0)
  })

  it('rejects invalid contexts (empty array)', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule()
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { contexts: [] },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-contexts' })
  })

  it('rejects ccUserIds containing unknown id', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule()
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { ccUserIds: ['ghost'] },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-cc-user-ids' })
  })

  it('accepts ccUserIds resolving via sales_team.json', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule()
    const sp = salesPerson('sp-vikram')
    const { deps } = makeDeps({ rules: [r], users: [u], salesTeam: [sp] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { ccUserIds: ['sp-vikram'] },
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects scopeValue empty string', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule()
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await editCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        editedBy: 'misba.m',
        patch: { scopeValue: '   ' },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-scope-value' })
  })
})
