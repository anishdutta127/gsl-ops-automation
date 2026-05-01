import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTemplate, type CreateTemplateDeps } from './createTemplate'
import type { CommunicationTemplate, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-08T10:00:00.000Z'
const FIXED_UUID = '11112222-3333-4444-5555-666677778888'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@x.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function makeDeps(opts: {
  templates?: CommunicationTemplate[]
  users: User[]
}): { deps: CreateTemplateDeps; calls: Array<Record<string, unknown>> } {
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
      templates: opts.templates ?? [],
      users: opts.users,
      enqueue: enqueue as unknown as CreateTemplateDeps['enqueue'],
      now: () => new Date(FIXED_TS),
      randomUuid: () => FIXED_UUID,
    },
    calls,
  }
}

describe('createTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: Admin creates a template -> queue write + audit entry', async () => {
    const u = user('Admin', 'anish.d')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createTemplate(
      {
        name: 'Welcome Note', useCase: 'welcome',
        subject: 'Hi {{schoolName}}', bodyMarkdown: 'Welcome.',
        defaultRecipient: 'spoc', createdBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.id).toBe('TPL-WELCOME-11112222')
    expect(result.template.name).toBe('Welcome Note')
    expect(result.template.active).toBe(true)
    expect(result.template.auditLog).toHaveLength(1)
    expect(result.template.auditLog[0]!.action).toBe('template-created')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'communicationTemplate', operation: 'create' })
  })

  it('OpsHead can also create', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ users: [u] })
    const result = await createTemplate(
      {
        name: 'X', useCase: 'follow-up', subject: 'X', bodyMarkdown: 'X',
        defaultRecipient: 'spoc', createdBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesRep is rejected with permission', async () => {
    const u = user('SalesRep', 'sp-x')
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createTemplate(
      {
        name: 'X', useCase: 'follow-up', subject: 'X', bodyMarkdown: 'X',
        defaultRecipient: 'spoc', createdBy: 'sp-x',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ users: [] })
    const result = await createTemplate(
      {
        name: 'X', useCase: 'follow-up', subject: 'X', bodyMarkdown: 'X',
        defaultRecipient: 'spoc', createdBy: 'ghost',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects duplicate id', async () => {
    const u = user('Admin', 'anish.d')
    const existing: CommunicationTemplate = {
      id: 'TPL-EXISTING', name: 'X', useCase: 'welcome', subject: 'X',
      bodyMarkdown: 'X', defaultRecipient: 'spoc', defaultCcRules: [],
      variables: [], createdBy: 'u', createdAt: '', lastEditedBy: 'u',
      lastEditedAt: '', active: true, auditLog: [],
    }
    const { deps } = makeDeps({ templates: [existing], users: [u] })
    const result = await createTemplate(
      {
        id: 'TPL-EXISTING', name: 'X', useCase: 'welcome', subject: 'X',
        bodyMarkdown: 'X', defaultRecipient: 'spoc', createdBy: 'anish.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('rejects invalid useCase', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ users: [u] })
    const result = await createTemplate(
      {
        name: 'X', useCase: 'unknown' as never, subject: 'X', bodyMarkdown: 'X',
        defaultRecipient: 'spoc', createdBy: 'u',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-use-case' })
  })

  it('rejects empty name / subject / body', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ users: [u] })
    expect(await createTemplate(
      { name: ' ', useCase: 'welcome', subject: 'X', bodyMarkdown: 'X', defaultRecipient: 'spoc', createdBy: 'u' },
      deps,
    )).toEqual({ ok: false, reason: 'missing-name' })
    expect(await createTemplate(
      { name: 'X', useCase: 'welcome', subject: '   ', bodyMarkdown: 'X', defaultRecipient: 'spoc', createdBy: 'u' },
      deps,
    )).toEqual({ ok: false, reason: 'missing-subject' })
    expect(await createTemplate(
      { name: 'X', useCase: 'welcome', subject: 'X', bodyMarkdown: '', defaultRecipient: 'spoc', createdBy: 'u' },
      deps,
    )).toEqual({ ok: false, reason: 'missing-body' })
  })

  it('defaults variables to availableVariablesFor(useCase)', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ users: [u] })
    const result = await createTemplate(
      {
        name: 'X', useCase: 'welcome', subject: 'X', bodyMarkdown: 'X',
        defaultRecipient: 'spoc', createdBy: 'u',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.variables).toContain('schoolName')
    expect(result.template.variables).toContain('salesOwnerName')
  })
})
