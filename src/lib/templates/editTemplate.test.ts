import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editTemplate, type EditTemplateDeps } from './editTemplate'
import type { CommunicationTemplate, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-08T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@x.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function template(overrides: Partial<CommunicationTemplate> = {}): CommunicationTemplate {
  return {
    id: 'TPL-X', name: 'Welcome Note', useCase: 'welcome',
    subject: 'Hi', bodyMarkdown: 'Welcome.', defaultRecipient: 'spoc',
    defaultCcRules: ['welcome-note'], variables: ['schoolName'],
    createdBy: 'u', createdAt: '2026-04-01T00:00:00Z',
    lastEditedBy: 'u', lastEditedAt: '2026-04-01T00:00:00Z',
    active: true, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  templates: CommunicationTemplate[]
  users: User[]
}): { deps: EditTemplateDeps; calls: Array<Record<string, unknown>> } {
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
      templates: opts.templates, users: opts.users,
      enqueue: enqueue as unknown as EditTemplateDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: Admin edits subject -> queue + audit', async () => {
    const u = user('Admin', 'anish.d')
    const { deps, calls } = makeDeps({ templates: [template()], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'anish.d', patch: { subject: 'Hi {{schoolName}}' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.subject).toBe('Hi {{schoolName}}')
    expect(result.template.lastEditedBy).toBe('anish.d')
    expect(result.template.lastEditedAt).toBe(FIXED_TS)
    expect(result.template.auditLog).toHaveLength(1)
    expect(result.template.auditLog[0]!.action).toBe('template-edited')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'communicationTemplate', operation: 'update' })
  })

  it('SalesRep is rejected', async () => {
    const u = user('SalesRep', 'sp-x')
    const { deps, calls } = makeDeps({ templates: [template()], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'sp-x', patch: { subject: 'X' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects template-not-found', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ templates: [], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-NOPE', editedBy: 'anish.d', patch: { name: 'X' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'template-not-found' })
  })

  it('no-op patch returns no-changes', async () => {
    const u = user('Admin')
    const { deps, calls } = makeDeps({ templates: [template()], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: {} },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-changes' })
    expect(calls).toHaveLength(0)
  })

  it('active=false alone -> template-deactivated audit action', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template({ active: true })], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { active: false } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.active).toBe(false)
    expect(result.template.auditLog[0]!.action).toBe('template-deactivated')
  })

  it('active=true alone -> template-reactivated audit action', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template({ active: false })], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { active: true } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.auditLog[0]!.action).toBe('template-reactivated')
  })

  it('mixed edit (active flip + subject) stays template-edited', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template({ active: true })], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { active: false, subject: 'New' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.auditLog[0]!.action).toBe('template-edited')
  })

  it('detects defaultCcRules + variables array changes', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template()], users: [u] })
    const result = await editTemplate(
      {
        id: 'TPL-X', editedBy: 'u',
        patch: {
          defaultCcRules: ['welcome-note', 'all-communications'],
          variables: ['schoolName', 'programme'],
        },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changedFields.sort()).toEqual(['defaultCcRules', 'variables'])
  })

  it('rejects empty subject / body', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template()], users: [u] })
    expect(await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { subject: '   ' } },
      deps,
    )).toEqual({ ok: false, reason: 'missing-subject' })
    expect(await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { bodyMarkdown: '' } },
      deps,
    )).toEqual({ ok: false, reason: 'missing-body' })
  })

  it('rejects invalid recipient', async () => {
    const u = user('Admin')
    const { deps } = makeDeps({ templates: [template()], users: [u] })
    const result = await editTemplate(
      { id: 'TPL-X', editedBy: 'u', patch: { defaultRecipient: 'foo' as never } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-recipient' })
  })
})
