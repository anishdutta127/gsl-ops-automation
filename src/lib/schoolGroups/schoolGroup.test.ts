import { describe, expect, it, vi } from 'vitest'
import {
  createSchoolGroup,
  editSchoolGroupMembers,
  type SchoolGroupDeps,
} from './schoolGroup'
import type { PendingUpdate, School, SchoolGroup, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function school(id: string): School {
  return {
    id, name: id, legalEntity: null, city: 'X', state: 'X', region: 'East',
    pinCode: null, contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: FIXED_TS, auditLog: [],
  }
}

function group(overrides: Partial<SchoolGroup> = {}): SchoolGroup {
  return {
    id: 'SG-NARAYANA_WB', name: 'Narayana WB', region: 'East',
    createdAt: FIXED_TS, createdBy: 'anish.d',
    memberSchoolIds: ['SCH-NARAYANA-ASN', 'SCH-NARAYANA-DUR'],
    groupMouId: null, notes: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  groups?: SchoolGroup[]
  schools?: School[]
  users: User[]
}): { deps: SchoolGroupDeps; calls: Array<Record<string, unknown>> } {
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
      groups: opts.groups ?? [],
      schools: opts.schools ?? [],
      users: opts.users,
      enqueue: enqueue as unknown as SchoolGroupDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('createSchoolGroup', () => {
  it('happy path: OpsHead creates group with empty members, audit recorded', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSchoolGroup(
      {
        id: 'SG-NEW',
        name: 'New Group',
        region: 'North',
        memberSchoolIds: [],
        notes: null,
        createdBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.group.id).toBe('SG-NEW')
    expect(result.group.memberSchoolIds).toEqual([])
    expect(result.group.groupMouId).toBeNull()
    expect(calls[0]).toMatchObject({ entity: 'schoolGroup', operation: 'create' })
  })

  it('accepts initial members that resolve in schools.json', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      users: [u],
      schools: [school('SCH-A'), school('SCH-B')],
    })
    const result = await createSchoolGroup(
      {
        id: 'SG-CHAIN',
        name: 'Chain',
        region: 'East',
        memberSchoolIds: ['SCH-A', 'SCH-B'],
        notes: null,
        createdBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.group.memberSchoolIds).toEqual(['SCH-A', 'SCH-B'])
  })

  it('rejects unknown member schoolId', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      users: [u],
      schools: [school('SCH-A')],
    })
    const result = await createSchoolGroup(
      {
        id: 'SG-X',
        name: 'X',
        region: 'East',
        memberSchoolIds: ['SCH-A', 'SCH-GHOST'],
        notes: null,
        createdBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-member-school-ids' })
  })

  it('SalesHead is REJECTED (school-group:create not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createSchoolGroup(
      {
        id: 'SG-X', name: 'X', region: 'East',
        memberSchoolIds: [], notes: null, createdBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects duplicate id', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      users: [u],
      groups: [group({ id: 'SG-EXISTING' })],
    })
    const result = await createSchoolGroup(
      {
        id: 'SG-EXISTING', name: 'X', region: 'East',
        memberSchoolIds: [], notes: null, createdBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('rejects id without SG- prefix', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createSchoolGroup(
      {
        id: 'NOTSG', name: 'X', region: 'East',
        memberSchoolIds: [], notes: null, createdBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-id-format' })
  })
})

describe('editSchoolGroupMembers', () => {
  it('happy path: adds + removes members, returns deltas, audit recorded', async () => {
    const u = user('OpsHead', 'misba.m')
    const g = group({ memberSchoolIds: ['SCH-A', 'SCH-B'] })
    const { deps, calls } = makeDeps({
      users: [u],
      groups: [g],
      schools: [school('SCH-A'), school('SCH-B'), school('SCH-C'), school('SCH-D')],
    })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NARAYANA_WB',
        memberSchoolIds: ['SCH-A', 'SCH-C', 'SCH-D'],
        editedBy: 'misba.m',
        notes: 'Added two campuses',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toEqual(['SCH-C', 'SCH-D'])
    expect(result.removed).toEqual(['SCH-B'])
    expect(result.group.memberSchoolIds).toEqual(['SCH-A', 'SCH-C', 'SCH-D'])
    expect(result.group.auditLog).toHaveLength(1)
    expect(result.group.auditLog[0]?.action).toBe('update')
    expect(calls[0]).toMatchObject({ entity: 'schoolGroup', operation: 'update' })
  })

  it('rejects no-change (target list matches current)', async () => {
    const u = user('OpsHead', 'misba.m')
    const g = group({ memberSchoolIds: ['SCH-A'] })
    const { deps, calls } = makeDeps({
      users: [u], groups: [g], schools: [school('SCH-A')],
    })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NARAYANA_WB',
        memberSchoolIds: ['SCH-A'],
        editedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-change' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown schoolId in member list', async () => {
    const u = user('OpsHead', 'misba.m')
    const g = group()
    const { deps } = makeDeps({
      users: [u], groups: [g], schools: [school('SCH-NARAYANA-ASN'), school('SCH-NARAYANA-DUR')],
    })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NARAYANA_WB',
        memberSchoolIds: ['SCH-NARAYANA-ASN', 'SCH-GHOST'],
        editedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-member-school-ids' })
  })

  it('rejects group-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NOPE',
        memberSchoolIds: [],
        editedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'group-not-found' })
  })

  it('SalesHead is REJECTED (school-group:edit-members not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const g = group()
    const { deps } = makeDeps({
      users: [u], groups: [g], schools: [school('SCH-NARAYANA-ASN'), school('SCH-NARAYANA-DUR')],
    })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NARAYANA_WB',
        memberSchoolIds: [],
        editedBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('deduplicates identical schoolIds in input', async () => {
    const u = user('OpsHead', 'misba.m')
    const g = group({ memberSchoolIds: [] })
    const { deps } = makeDeps({
      users: [u], groups: [g], schools: [school('SCH-A')],
    })
    const result = await editSchoolGroupMembers(
      {
        groupId: 'SG-NARAYANA_WB',
        memberSchoolIds: ['SCH-A', 'SCH-A'],
        editedBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.group.memberSchoolIds).toEqual(['SCH-A'])
  })
})
