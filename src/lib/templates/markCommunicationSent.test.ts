import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markCommunicationSent, type MarkCommunicationSentDeps } from './markCommunicationSent'
import type {
  CommunicationTemplate,
  MOU,
  PendingUpdate,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-05-08T10:00:00.000Z'

function user(id = 'misba.m'): User {
  return {
    id, name: id, email: `${id}@x.test`, role: 'OpsHead',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 0, spWithTax: 0,
    contractValue: 0, received: 0, tds: 0, balance: 0, receivedPct: 0,
    paymentSchedule: '', trainerModel: 'GSL-T', salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function template(overrides: Partial<CommunicationTemplate> = {}): CommunicationTemplate {
  return {
    id: 'TPL-X', name: 'Welcome', useCase: 'welcome', subject: 'X',
    bodyMarkdown: 'X', defaultRecipient: 'spoc', defaultCcRules: [],
    variables: [], createdBy: 'u', createdAt: '', lastEditedBy: 'u',
    lastEditedAt: '', active: true, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  mous: MOU[]; templates: CommunicationTemplate[]; users: User[]
}): { deps: MarkCommunicationSentDeps; calls: Array<Record<string, unknown>> } {
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
      mous: opts.mous, templates: opts.templates, users: opts.users,
      enqueue: enqueue as unknown as MarkCommunicationSentDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('markCommunicationSent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: appends communication-sent entry to MOU + queue', async () => {
    const u = user()
    const { deps, calls } = makeDeps({
      mous: [mou()], templates: [template()], users: [u],
    })
    const result = await markCommunicationSent(
      {
        mouId: 'MOU-X', templateId: 'TPL-X',
        recipient: 'spoc@school.test', subject: 'Welcome to STEAM, X',
        filledVariablesCsv: 'schoolName,programme', sentBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mou.auditLog).toHaveLength(1)
    expect(result.mou.auditLog[0]!.action).toBe('communication-sent')
    expect(result.mou.auditLog[0]!.after).toMatchObject({
      templateId: 'TPL-X',
      templateName: 'Welcome',
      useCase: 'welcome',
      recipient: 'spoc@school.test',
      filledVariables: ['schoolName', 'programme'],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'mou', operation: 'update' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ mous: [mou()], templates: [template()], users: [] })
    const result = await markCommunicationSent(
      { mouId: 'MOU-X', templateId: 'TPL-X', recipient: 'x', subject: 'x', sentBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects mou-not-found', async () => {
    const u = user()
    const { deps } = makeDeps({ mous: [], templates: [template()], users: [u] })
    const result = await markCommunicationSent(
      { mouId: 'MOU-NOPE', templateId: 'TPL-X', recipient: 'x', subject: 'x', sentBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('rejects template-not-found', async () => {
    const u = user()
    const { deps } = makeDeps({ mous: [mou()], templates: [], users: [u] })
    const result = await markCommunicationSent(
      { mouId: 'MOU-X', templateId: 'TPL-NOPE', recipient: 'x', subject: 'x', sentBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'template-not-found' })
  })

  it('handles empty filledVariablesCsv cleanly', async () => {
    const u = user()
    const { deps } = makeDeps({ mous: [mou()], templates: [template()], users: [u] })
    const result = await markCommunicationSent(
      { mouId: 'MOU-X', templateId: 'TPL-X', recipient: 'x', subject: 'x', sentBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mou.auditLog[0]!.after).toMatchObject({ filledVariables: [] })
  })
})
