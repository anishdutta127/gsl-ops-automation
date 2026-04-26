import { describe, expect, it, vi } from 'vitest'
import {
  createSalesPerson,
  type CreateSalesPersonDeps,
} from './createSalesPerson'
import type { PendingUpdate, SalesPerson, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function existing(id: string): SalesPerson {
  return {
    id, name: id, email: `${id}@example.test`, phone: null,
    territories: ['X'], programmes: ['STEAM'],
    active: true, joinedDate: '2025-06-01',
  }
}

function makeDeps(opts: {
  salesTeam?: SalesPerson[]
  users: User[]
}): { deps: CreateSalesPersonDeps; calls: Array<Record<string, unknown>> } {
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
      salesTeam: opts.salesTeam ?? [],
      users: opts.users,
      enqueue: enqueue as unknown as CreateSalesPersonDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

const happyArgs = {
  id: 'sp-priya',
  name: 'Priya M.',
  email: 'priya.m@getsetlearn.info',
  phone: '+91-98100-00099',
  territories: ['Bangalore', 'Hyderabad'],
  programmes: ['STEAM', 'TinkRworks'] as const,
  joinedDate: '2026-04-15',
  createdBy: 'misba.m',
}

describe('createSalesPerson', () => {
  it('happy path: OpsHead creates sales rep, queue enqueued', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSalesPerson({ ...happyArgs, programmes: [...happyArgs.programmes] }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.salesPerson.id).toBe('sp-priya')
    expect(result.salesPerson.active).toBe(true)
    expect(calls[0]).toMatchObject({ entity: 'salesTeam', operation: 'create' })
  })

  it('Admin can create (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], createdBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (sales-rep:create not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], createdBy: 'pratik.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ users: [] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], createdBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects duplicate id', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      users: [u],
      salesTeam: [existing('sp-priya')],
    })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes] },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('rejects id missing sp- prefix', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], id: 'priya' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })

  it('rejects uppercase id (lowercase convention)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], id: 'sp-PRIYA' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })

  it('rejects malformed email', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], email: 'not-an-email' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-email' })
  })

  it('rejects empty territories', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], territories: [] },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-territories' })
  })

  it('rejects unknown programme', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      {
        ...happyArgs,
        programmes: ['STEAM', 'NotAProgramme' as never],
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-programmes' })
  })

  it('rejects malformed joinedDate (not ISO)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSalesPerson(
      { ...happyArgs, programmes: [...happyArgs.programmes], joinedDate: '15-Apr-2026' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-joined-date' })
  })
})
