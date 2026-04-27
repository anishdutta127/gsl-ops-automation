import { describe, expect, it, vi } from 'vitest'
import { editLifecycleRule, type EditLifecycleRuleDeps } from './editLifecycleRule'
import type { LifecycleRule, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-04-27T12:00:00.000Z'

function rule(overrides: Partial<LifecycleRule> & Pick<LifecycleRule, 'stageFromKey' | 'stageToKey'>): LifecycleRule {
  return {
    defaultDays: 14, customNotes: '',
    updatedAt: '2026-04-01T00:00:00Z', updatedBy: 'system',
    auditLog: [],
    ...overrides,
  }
}

function user(overrides: Partial<User> & Pick<User, 'id' | 'role'>): User {
  return {
    name: overrides.id, email: `${overrides.id}@x`,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  rules?: LifecycleRule[]
  users?: User[]
}): { deps: EditLifecycleRuleDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>,
      retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      rules: opts.rules ?? [rule({ stageFromKey: 'invoice-raised', stageToKey: 'payment-received', defaultDays: 30 })],
      users: opts.users ?? [user({ id: 'anish.d', role: 'Admin' })],
      enqueue: enqueue as unknown as EditLifecycleRuleDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editLifecycleRule', () => {
  it('happy path: defaultDays change, audit entry recorded, queue enqueued', async () => {
    const { deps, calls } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 45,
      changeNotes: 'School cohort runs 45-day cycles', editedBy: 'anish.d',
    }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.defaultDays).toBe(45)
    expect(result.rule.updatedBy).toBe('anish.d')
    expect(result.rule.updatedAt).toBe(FIXED_TS)
    expect(result.rule.auditLog).toHaveLength(1)
    expect(result.rule.auditLog[0]).toMatchObject({
      action: 'lifecycle-rule-edited',
      user: 'anish.d',
      before: { defaultDays: 30 },
      after: { defaultDays: 45 },
      notes: 'School cohort runs 45-day cycles',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'lifecycleRule', operation: 'update' })
  })

  it('rejects missing rule', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'not-a-stage', defaultDays: 10, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'rule-not-found' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 45, editedBy: 'ghost',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects non-Admin user (only Admin holds lifecycle-rule:edit)', async () => {
    const { deps } = makeDeps({
      users: [user({ id: 'pratik.d', role: 'SalesHead' })],
    })
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 45, editedBy: 'pratik.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects defaultDays = 0', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 0, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-days' })
  })

  it('rejects defaultDays = -5 (negative)', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: -5, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-days' })
  })

  it('rejects defaultDays = 366 (above ceiling)', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 366, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-days' })
  })

  it('rejects non-integer defaultDays (e.g., 14.5)', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 14.5, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-days' })
  })

  it('rejects no-change submissions (current value resubmitted)', async () => {
    const { deps, calls } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 30, editedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'no-change' })
    expect(calls).toHaveLength(0)
  })

  it('changeNotes empty string normalises to undefined in audit entry', async () => {
    const { deps } = makeDeps({})
    const result = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 45, changeNotes: '   ', editedBy: 'anish.d',
    }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rule.auditLog[0]?.notes).toBeUndefined()
  })

  it('boundary values 1 and 365 are accepted', async () => {
    const { deps: d1 } = makeDeps({})
    const r1 = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 1, editedBy: 'anish.d',
    }, d1)
    expect(r1.ok).toBe(true)

    const { deps: d2 } = makeDeps({})
    const r2 = await editLifecycleRule({
      stageFromKey: 'invoice-raised', defaultDays: 365, editedBy: 'anish.d',
    }, d2)
    expect(r2.ok).toBe(true)
  })
})
