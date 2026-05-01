/*
 * W4-I.5 Phase 3 createTemplate.
 *
 * Adds a new CommunicationTemplate. Permission gate 'template:edit'
 * (Admin via wildcard, OpsHead via explicit grant). Validates required
 * fields, normalises empty optionals, declares a 'template-created'
 * audit entry, enqueues the create.
 *
 * ID convention: 'TPL-<USECASE>-<UUID8>' uppercase. Caller can supply
 * an explicit id to support seed scripts; the route handler defaults
 * to the auto-generated form.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  CommunicationTemplate,
  PendingUpdate,
  TemplateRecipient,
  TemplateUseCase,
  User,
} from '@/lib/types'
import communicationTemplatesJson from '@/data/communication_templates.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { availableVariablesFor } from './applyVariables'

const VALID_USE_CASES: ReadonlyArray<TemplateUseCase> = [
  'welcome', 'thank-you', 'follow-up', 'payment-reminder',
  'dispatch-confirmation', 'feedback-request', 'custom',
]
const VALID_RECIPIENTS: ReadonlyArray<TemplateRecipient> = [
  'spoc', 'sales-owner', 'school-email', 'custom',
]

export interface CreateTemplateArgs {
  /** Optional override; default is auto-generated. */
  id?: string
  name: string
  useCase: TemplateUseCase
  subject: string
  bodyMarkdown: string
  defaultRecipient: TemplateRecipient
  defaultCcRules?: string[]
  /** Optional explicit allow-list; defaults to availableVariablesFor(useCase). */
  variables?: string[]
  active?: boolean
  createdBy: string
}

export type CreateTemplateFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'duplicate-id'
  | 'missing-name'
  | 'missing-subject'
  | 'missing-body'
  | 'invalid-use-case'
  | 'invalid-recipient'

export type CreateTemplateResult =
  | { ok: true; template: CommunicationTemplate }
  | { ok: false; reason: CreateTemplateFailureReason }

export interface CreateTemplateDeps {
  templates: CommunicationTemplate[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
  randomUuid: () => string
}

const defaultDeps: CreateTemplateDeps = {
  templates: communicationTemplatesJson as unknown as CommunicationTemplate[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
}

function defaultIdFor(useCase: TemplateUseCase, uuid: string): string {
  return `TPL-${useCase.toUpperCase()}-${uuid.slice(0, 8).toUpperCase()}`
}

export async function createTemplate(
  args: CreateTemplateArgs,
  deps: CreateTemplateDeps = defaultDeps,
): Promise<CreateTemplateResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'template:edit')) {
    return { ok: false, reason: 'permission' }
  }

  if (!VALID_USE_CASES.includes(args.useCase)) {
    return { ok: false, reason: 'invalid-use-case' }
  }
  if (!VALID_RECIPIENTS.includes(args.defaultRecipient)) {
    return { ok: false, reason: 'invalid-recipient' }
  }
  if (typeof args.name !== 'string' || args.name.trim() === '') {
    return { ok: false, reason: 'missing-name' }
  }
  if (typeof args.subject !== 'string' || args.subject.trim() === '') {
    return { ok: false, reason: 'missing-subject' }
  }
  if (typeof args.bodyMarkdown !== 'string' || args.bodyMarkdown.trim() === '') {
    return { ok: false, reason: 'missing-body' }
  }

  const id = args.id ?? defaultIdFor(args.useCase, deps.randomUuid())
  if (deps.templates.some((t) => t.id === id)) {
    return { ok: false, reason: 'duplicate-id' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.createdBy,
    action: 'template-created',
    after: {
      name: args.name.trim(),
      useCase: args.useCase,
      defaultRecipient: args.defaultRecipient,
    },
    notes: `Created CommunicationTemplate ${id}.`,
  }

  const template: CommunicationTemplate = {
    id,
    name: args.name.trim(),
    useCase: args.useCase,
    subject: args.subject,
    bodyMarkdown: args.bodyMarkdown,
    defaultRecipient: args.defaultRecipient,
    defaultCcRules: args.defaultCcRules ?? [],
    variables: args.variables ?? availableVariablesFor(args.useCase),
    createdBy: args.createdBy,
    createdAt: ts,
    lastEditedBy: args.createdBy,
    lastEditedAt: ts,
    active: args.active ?? true,
    auditLog: [audit],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'communicationTemplate',
    operation: 'create',
    payload: template as unknown as Record<string, unknown>,
  })

  return { ok: true, template }
}
