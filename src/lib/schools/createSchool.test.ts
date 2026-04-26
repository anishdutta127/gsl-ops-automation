import { describe, expect, it, vi } from 'vitest'
import { createSchool, type CreateSchoolDeps } from './createSchool'
import type { PendingUpdate, School, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function existing(id: string): School {
  return {
    id, name: id, legalEntity: null, city: 'X', state: 'X', region: 'East',
    pinCode: null, contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: FIXED_TS, auditLog: [],
  }
}

function makeDeps(opts: {
  schools?: School[]
  users: User[]
}): { deps: CreateSchoolDeps; calls: Array<Record<string, unknown>> } {
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
      schools: opts.schools ?? [],
      users: opts.users,
      enqueue: enqueue as unknown as CreateSchoolDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

const happyArgs = {
  id: 'SCH-NEW-DELHI',
  name: 'New Delhi Public School',
  legalEntity: 'NDPS Educational Trust',
  city: 'Delhi',
  state: 'Delhi',
  region: 'North',
  pinCode: '110001',
  contactPerson: 'Ravi K.',
  email: 'spoc.ndps@example.test',
  phone: '+91-98000-00100',
  billingName: 'NDPS Educational Trust',
  pan: 'AAAPN1234C',
  gstNumber: '07AAAPN1234C1Z9',
  notes: null,
  createdBy: 'misba.m',
}

describe('createSchool', () => {
  it('happy path: OpsHead creates school with audit entry, queue enqueued', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSchool(happyArgs, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.school.id).toBe('SCH-NEW-DELHI')
    expect(result.school.active).toBe(true)
    expect(result.school.auditLog).toHaveLength(1)
    expect(result.school.auditLog[0]?.action).toBe('create')
    expect(calls[0]).toMatchObject({ entity: 'school', operation: 'create' })
  })

  it('Admin can create (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, createdBy: 'anish.d' }, deps)
    expect(result.ok).toBe(true)
  })

  it('SalesRep is REJECTED (school:create not granted)', async () => {
    const u = user('SalesRep', 'sp-vikram')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, createdBy: 'sp-vikram' }, deps)
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects duplicate id', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      users: [u],
      schools: [existing('SCH-NEW-DELHI')],
    })
    const result = await createSchool(happyArgs, deps)
    expect(result).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('rejects id without SCH- prefix', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, id: 'NEW-DELHI' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })

  it('rejects empty name', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, name: '   ' }, deps)
    expect(result).toEqual({ ok: false, reason: 'missing-name' })
  })

  it('rejects malformed PIN code', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, pinCode: '12345' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-pin' })
  })

  it('accepts null PIN (optional)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, pinCode: null }, deps)
    expect(result.ok).toBe(true)
  })

  it('rejects malformed PAN', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, pan: 'BADPAN' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-pan' })
  })

  it('rejects malformed GSTIN', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, gstNumber: 'NOT-VALID' }, deps)
    expect(result).toEqual({ ok: false, reason: 'invalid-gst' })
  })

  it('accepts null GSTIN (Phase 1 backfill in progress per Item F)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchool({ ...happyArgs, gstNumber: null }, deps)
    expect(result.ok).toBe(true)
  })
})
