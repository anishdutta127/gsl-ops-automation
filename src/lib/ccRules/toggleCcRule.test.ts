import { describe, expect, it, vi } from 'vitest'
import { toggleCcRule, type ToggleCcRuleDeps } from './toggleCcRule'
import type { CcRule, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
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
}): { deps: ToggleCcRuleDeps; calls: Array<Record<string, unknown>> } {
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
      enqueue: enqueue as unknown as ToggleCcRuleDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('toggleCcRule', () => {
  it('disable: OpsHead disables an enabled rule, audit action cc-rule-toggle-off, disabled metadata set', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule({ enabled: true })
    const { deps, calls } = makeDeps({ rules: [r], users: [u] })
    const result = await toggleCcRule(
      {
        ruleId: 'CCR-NORTH-DELHI',
        enabled: false,
        toggledBy: 'misba.m',
        reason: 'paused for SPOC review',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.enabled).toBe(false)
    expect(result.rule.disabledAt).toBe(FIXED_TS)
    expect(result.rule.disabledBy).toBe('misba.m')
    expect(result.rule.disabledReason).toBe('paused for SPOC review')
    expect(result.rule.auditLog).toHaveLength(1)
    expect(result.rule.auditLog[0]?.action).toBe('cc-rule-toggle-off')
    expect(calls[0]).toMatchObject({ entity: 'ccRule', operation: 'update' })
  })

  it('enable: re-enabling a disabled rule clears disabled metadata, audit action cc-rule-toggle-on', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule({
      enabled: false,
      disabledAt: '2026-04-20T00:00:00Z',
      disabledBy: 'misba.m',
      disabledReason: 'paused',
    })
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await toggleCcRule(
      { ruleId: 'CCR-NORTH-DELHI', enabled: true, toggledBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.enabled).toBe(true)
    expect(result.rule.disabledAt).toBeNull()
    expect(result.rule.disabledBy).toBeNull()
    expect(result.rule.disabledReason).toBeNull()
    expect(result.rule.auditLog[0]?.action).toBe('cc-rule-toggle-on')
  })

  it('SalesHead is REJECTED (cc-rule:toggle not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const r = rule()
    const { deps, calls } = makeDeps({ rules: [r], users: [u] })
    const result = await toggleCcRule(
      { ruleId: 'CCR-NORTH-DELHI', enabled: false, toggledBy: 'pratik.d', reason: 'X' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects already-in-state when target matches current', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule({ enabled: true })
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await toggleCcRule(
      { ruleId: 'CCR-NORTH-DELHI', enabled: true, toggledBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'already-in-state' })
  })

  it('rejects disabling without a reason (audit anchor needs context)', async () => {
    const u = user('OpsHead', 'misba.m')
    const r = rule({ enabled: true })
    const { deps } = makeDeps({ rules: [r], users: [u] })
    const result = await toggleCcRule(
      { ruleId: 'CCR-NORTH-DELHI', enabled: false, toggledBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'reason-required' })
  })

  it('rejects rule-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ rules: [], users: [u] })
    const result = await toggleCcRule(
      { ruleId: 'CCR-NOPE', enabled: false, toggledBy: 'misba.m', reason: 'X' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'rule-not-found' })
  })
})
