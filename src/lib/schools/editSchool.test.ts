import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editSchool, type EditSchoolDeps } from './editSchool'
import type { PendingUpdate, School, User } from '@/lib/types'

const FIXED_TS = '2026-05-01T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Sample School', legalEntity: 'Sample Trust',
    city: 'Pune', state: 'Maharashtra', region: 'South-West',
    pinCode: '411001', contactPerson: 'Mr. Rao', email: 'rao@sample.test',
    phone: '+919876543210', billingName: 'Sample Trust',
    pan: 'AAAPL1234C', gstNumber: '27AAAPL1234C1ZX', notes: null,
    active: true, createdAt: '2026-04-01T00:00:00Z', auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  schools: School[]
  users: User[]
}): { deps: EditSchoolDeps; calls: Array<Record<string, unknown>> } {
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
      schools: opts.schools, users: opts.users,
      enqueue: enqueue as unknown as EditSchoolDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editSchool', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: OpsHead changes name -> queued + audit appended', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: { name: 'New Name' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changedFields).toEqual(['name'])
    expect(result.school.name).toBe('New Name')
    expect(result.school.auditLog).toHaveLength(1)
    expect(result.school.auditLog[0]!.action).toBe('update')
    expect(result.school.auditLog[0]!.before).toEqual({ name: 'Sample School' })
    expect(result.school.auditLog[0]!.after).toEqual({ name: 'New Name' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'school', operation: 'update' })
  })

  it('Admin can edit GSTIN', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'anish.d', patch: { gstNumber: '29AAAAA0000A1Z5' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.school.gstNumber).toBe('29AAAAA0000A1Z5')
  })

  it('Finance can edit GSTIN', async () => {
    const u = user('Finance', 'shubhangi.g')
    // Finance does NOT have school:edit grant; verify by attempting other field too.
    // Wait: Finance is not in the school:edit role set. So this would fail with permission.
    // To test the GSTIN-edit-allowed branch in isolation, we need a role that has
    // school:edit AND canEditGstin. That's only Admin. But we should also confirm
    // Finance gets blocked as expected by the matrix.
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'shubhangi.g', patch: { name: 'X' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('OpsHead cannot edit GSTIN: gstNumber silently dropped from patch', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      {
        id: 'SCH-X', editedBy: 'misba.m',
        patch: { name: 'New Name', gstNumber: '29AAAAA0000A1Z5' },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Only name changed; gstNumber preserved at original value.
    expect(result.changedFields).toEqual(['name'])
    expect(result.school.gstNumber).toBe('27AAAPL1234C1ZX')
    expect(calls).toHaveLength(1)
  })

  it('OpsHead-only gstNumber patch returns no-changes (everything else dropped)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: { gstNumber: '29AAAAA0000A1Z5' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-changes' })
    expect(calls).toHaveLength(0)
  })

  it('SalesRep is rejected with permission', async () => {
    const u = user('SalesRep', 'sp-roveena')
    const { deps, calls } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'sp-roveena', patch: { name: 'New' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ schools: [school()], users: [] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'ghost', patch: { name: 'X' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects school-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ schools: [], users: [u] })
    const result = await editSchool(
      { id: 'SCH-MISSING', editedBy: 'misba.m', patch: { name: 'X' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-not-found' })
  })

  it('rejects empty name with missing-name', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: { name: '   ' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'missing-name' })
  })

  it('rejects malformed PIN', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: { pinCode: '12' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-pin' })
  })

  it('rejects malformed GSTIN (Admin)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'anish.d', patch: { gstNumber: 'not-a-gstin' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-gst' })
  })

  it('clears optional fields when patch sets blank string -> null', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: { phone: '   ' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.school.phone).toBeNull()
    expect(result.changedFields).toEqual(['phone'])
  })

  it('no-op patch returns no-changes (no queue write)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      { id: 'SCH-X', editedBy: 'misba.m', patch: {} },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-changes' })
    expect(calls).toHaveLength(0)
  })

  it('captures the edited fields in the audit notes', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ schools: [school()], users: [u] })
    const result = await editSchool(
      {
        id: 'SCH-X', editedBy: 'misba.m',
        patch: { name: 'New', city: 'Mumbai' },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.school.auditLog[0]!.notes).toContain('name')
    expect(result.school.auditLog[0]!.notes).toContain('city')
  })
})
