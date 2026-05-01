import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editIntake, type EditIntakeDeps } from './editIntake'
import type { IntakeRecord, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-01T10:00:00.000Z'

function user(id = 'misba.m'): User {
  return {
    id, name: id, email: `${id}@example.test`, role: 'OpsHead',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function record(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  return {
    id: 'IR-X',
    mouId: 'MOU-X',
    completedAt: '2026-04-01T10:00:00Z',
    completedBy: 'system-w4c-backfill',
    salesOwnerId: 'sp-roveena',
    location: 'Pune',
    grades: '1-8',
    recipientName: 'Principal',
    recipientDesignation: 'Principal',
    recipientEmail: 'principal@school.test',
    studentsAtIntake: 200,
    durationYears: 2,
    startDate: '2026-04-01',
    endDate: '2028-03-31',
    physicalSubmissionStatus: 'Pending',
    softCopySubmissionStatus: 'Pending',
    productConfirmed: 'STEAM',
    gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'Mr. Rao',
    schoolPointOfContactPhone: '+919876543210',
    signedMouUrl: 'https://drive.google.com/x',
    thankYouEmailSentAt: null,
    gradeBreakdown: null,
    rechargeableBatteries: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: { records: IntakeRecord[]; users: User[] }):
{ deps: EditIntakeDeps; calls: Array<Record<string, unknown>> } {
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
      intakeRecords: opts.records, users: opts.users,
      enqueue: enqueue as unknown as EditIntakeDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editIntake', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: backfill gradeBreakdown -> queued + audit', async () => {
    const u = user()
    const { deps, calls } = makeDeps({ records: [record()], users: [u] })
    const breakdown = [
      { grade: 1, students: 17 },
      { grade: 2, students: 21 },
      { grade: 3, students: 20 },
    ]
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { gradeBreakdown: breakdown } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.gradeBreakdown).toEqual(breakdown)
    expect(result.changedFields).toEqual(['gradeBreakdown'])
    expect(result.record.auditLog).toHaveLength(1)
    expect(result.record.auditLog[0]!.action).toBe('intake-edited')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'intakeRecord', operation: 'update' })
  })

  it('backfills rechargeableBatteries (Misba PDF: 25 batteries)', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { rechargeableBatteries: 25 } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.rechargeableBatteries).toBe(25)
  })

  it('clears gradeBreakdown when patch sends []', async () => {
    const u = user()
    const r = record({ gradeBreakdown: [{ grade: 1, students: 5 }] })
    const { deps } = makeDeps({ records: [r], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { gradeBreakdown: [] } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.gradeBreakdown).toBeNull()
  })

  it('rejects invalid gradeBreakdown (negative students)', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      {
        id: 'IR-X', editedBy: 'misba.m',
        patch: { gradeBreakdown: [{ grade: 1, students: -5 }] },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-grade-breakdown' })
  })

  it('rejects invalid gradeBreakdown (out of range grade)', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      {
        id: 'IR-X', editedBy: 'misba.m',
        patch: { gradeBreakdown: [{ grade: 13, students: 10 }] },
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-grade-breakdown' })
  })

  it('rejects negative batteries', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { rechargeableBatteries: -1 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-batteries' })
  })

  it('clears batteries when patch sends null', async () => {
    const u = user()
    const r = record({ rechargeableBatteries: 25 })
    const { deps } = makeDeps({ records: [r], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { rechargeableBatteries: null } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.rechargeableBatteries).toBeNull()
  })

  it('edits SPOC name + phone (E.164 normalisation applied)', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      {
        id: 'IR-X', editedBy: 'misba.m',
        patch: {
          schoolPointOfContactName: 'Mr. MK Bansal',
          schoolPointOfContactPhone: '9456838281',
        },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.schoolPointOfContactName).toBe('Mr. MK Bansal')
    expect(result.record.schoolPointOfContactPhone).toBe('+919456838281')
    expect(result.changedFields.sort()).toEqual(['schoolPointOfContactName', 'schoolPointOfContactPhone'].sort())
  })

  it('rejects empty SPOC name with missing-text', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: { schoolPointOfContactName: '   ' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'missing-text' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ records: [record()], users: [] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'ghost', patch: { rechargeableBatteries: 5 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects intake-not-found', async () => {
    const u = user()
    const { deps } = makeDeps({ records: [], users: [u] })
    const result = await editIntake(
      { id: 'IR-NOPE', editedBy: 'misba.m', patch: { rechargeableBatteries: 5 } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'intake-not-found' })
  })

  it('no-op patch returns no-changes', async () => {
    const u = user()
    const { deps, calls } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      { id: 'IR-X', editedBy: 'misba.m', patch: {} },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-changes' })
    expect(calls).toHaveLength(0)
  })

  it('captures full kit allocation in one call (Misba KOLKATA WB sample)', async () => {
    const u = user()
    const { deps, calls } = makeDeps({ records: [record()], users: [u] })
    const result = await editIntake(
      {
        id: 'IR-X', editedBy: 'misba.m',
        patch: {
          location: 'KOLKATA WB',
          schoolPointOfContactName: 'Mr. MK Bansal',
          schoolPointOfContactPhone: '9456838281',
          gradeBreakdown: [
            { grade: 1, students: 17 }, { grade: 2, students: 21 },
            { grade: 3, students: 20 }, { grade: 4, students: 15 },
            { grade: 5, students: 24 }, { grade: 6, students: 25 },
            { grade: 7, students: 26 }, { grade: 8, students: 25 },
            { grade: 9, students: 0 }, { grade: 10, students: 0 },
          ],
          rechargeableBatteries: 25,
        },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.gradeBreakdown).toHaveLength(10)
    expect(result.record.rechargeableBatteries).toBe(25)
    expect(result.changedFields.length).toBeGreaterThanOrEqual(4)
    expect(calls).toHaveLength(1)
  })
})
