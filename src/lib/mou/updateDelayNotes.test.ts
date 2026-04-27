import { describe, expect, it, vi } from 'vitest'
import {
  truncateForAudit,
  updateDelayNotes,
  type UpdateDelayNotesDeps,
} from './updateDelayNotes'
import type { MOU, PendingUpdate, Programme, User } from '@/lib/types'

const FIXED_TS = '2026-04-27T22:00:00.000Z'

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'anish.d@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function rep(): User {
  return {
    id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null,
    salesPersonId: null, templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  mous: MOU[]
  users: User[]
}): { deps: UpdateDelayNotesDeps; calls: Array<Record<string, unknown>> } {
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
      mous: opts.mous, users: opts.users,
      enqueue: enqueue as unknown as UpdateDelayNotesDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('truncateForAudit', () => {
  it('returns null unchanged', () => {
    expect(truncateForAudit(null)).toBeNull()
  })

  it('returns short strings unchanged', () => {
    expect(truncateForAudit('Awaiting GST upload from school')).toBe(
      'Awaiting GST upload from school',
    )
  })

  it('truncates strings longer than 200 chars and appends the suffix marker', () => {
    const long = 'x'.repeat(500)
    const out = truncateForAudit(long)
    expect(out).not.toBeNull()
    if (out !== null) {
      expect(out.startsWith('x'.repeat(200))).toBe(true)
      expect(out.endsWith('[truncated; full notes on MOU]')).toBe(true)
    }
  })
})

describe('updateDelayNotes', () => {
  it('persists notes; writes mou-delay-notes-updated audit entry; queues update', async () => {
    const m = mou({ id: 'M-A', delayNotes: null })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-A', rawNotes: 'Awaiting GST upload from school.', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.mou.delayNotes).toBe('Awaiting GST upload from school.')
      expect(res.mou.auditLog).toHaveLength(1)
      const entry = res.mou.auditLog[0]
      expect(entry?.action).toBe('mou-delay-notes-updated')
      expect(entry?.before).toEqual({ delayNotes: null })
      expect(entry?.after).toEqual({ delayNotes: 'Awaiting GST upload from school.' })
    }
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entity).toBe('mou')
  })

  it('SalesRep can edit (W3-B principle: no role gate on this surface)', async () => {
    const m = mou({ id: 'M-B' })
    const { deps, calls } = makeDeps({ mous: [m], users: [rep()] })
    const res = await updateDelayNotes(
      { mouId: 'M-B', rawNotes: 'Trainer reschedule pending.', changedBy: 'sp-vikram' },
      deps,
    )
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('whitespace-only normalises to null; empty -> empty also normalises to null', async () => {
    const m = mou({ id: 'M-C', delayNotes: 'Existing.' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-C', rawNotes: '   \n   ', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.mou.delayNotes).toBeNull()
      expect(res.mou.auditLog[0]?.after).toEqual({ delayNotes: null })
    }
  })

  it('null -> null no-change short-circuits with no audit, no queue write', async () => {
    const m = mou({ id: 'M-D', delayNotes: null })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-D', rawNotes: '', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no-change')
    expect(calls).toHaveLength(0)
  })

  it('same-string no-change short-circuits', async () => {
    const m = mou({ id: 'M-E', delayNotes: 'Same' })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-E', rawNotes: 'Same', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no-change')
    expect(calls).toHaveLength(0)
  })

  it('long notes are truncated in the audit but stored in full on the MOU', async () => {
    const longNotes = 'x'.repeat(500)
    const m = mou({ id: 'M-F', delayNotes: null })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-F', rawNotes: longNotes, changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      // Full text on the MOU
      expect(res.mou.delayNotes).toBe(longNotes)
      // Truncated in audit
      const after = res.mou.auditLog[0]?.after as { delayNotes?: string | null }
      expect(after.delayNotes).not.toBe(longNotes)
      expect(after.delayNotes?.endsWith('[truncated; full notes on MOU]')).toBe(true)
    }
  })

  it('unknown user -> reason=unknown-user; no queue write', async () => {
    const { deps, calls } = makeDeps({ mous: [mou({ id: 'M' })], users: [] })
    const res = await updateDelayNotes(
      { mouId: 'M', rawNotes: 'x', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown-user')
    expect(calls).toHaveLength(0)
  })

  it('unknown mouId -> reason=mou-not-found; no queue write', async () => {
    const { deps, calls } = makeDeps({ mous: [], users: [admin()] })
    const res = await updateDelayNotes(
      { mouId: 'M-NOPE', rawNotes: 'x', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('mou-not-found')
    expect(calls).toHaveLength(0)
  })
})
