/*
 * W4-I.5 Phase 3 editTemplate.
 *
 * Patch-based CommunicationTemplate editor. Permission gate
 * 'template:edit'. Mirrors the editOpportunity / editEscalation
 * pattern. Produces a 'template-edited' audit entry with the
 * before / after diff per field.
 *
 * Active toggle: when the patch flips active from true -> false the
 * audit action becomes 'template-deactivated' (false -> true is
 * 'template-reactivated'). Mixed edits (active flip + other field
 * change) emit 'template-edited' with the active diff captured in
 * the before / after.
 */

import type {
  AuditEntry,
  AuditAction,
  CommunicationTemplate,
  PendingUpdate,
  TemplateRecipient,
  User,
} from '@/lib/types'
import communicationTemplatesJson from '@/data/communication_templates.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const VALID_RECIPIENTS: ReadonlyArray<TemplateRecipient> = [
  'spoc', 'sales-owner', 'school-email', 'custom',
]

export interface EditTemplatePatch {
  name?: string
  subject?: string
  bodyMarkdown?: string
  defaultRecipient?: TemplateRecipient
  defaultCcRules?: string[]
  variables?: string[]
  active?: boolean
}

export interface EditTemplateArgs {
  id: string
  patch: EditTemplatePatch
  editedBy: string
  notes?: string | null
}

export type EditTemplateFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'template-not-found'
  | 'missing-name'
  | 'missing-subject'
  | 'missing-body'
  | 'invalid-recipient'
  | 'no-changes'

export type EditTemplateResult =
  | { ok: true; template: CommunicationTemplate; changedFields: string[] }
  | { ok: false; reason: EditTemplateFailureReason }

export interface EditTemplateDeps {
  templates: CommunicationTemplate[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: EditTemplateDeps = {
  templates: communicationTemplatesJson as unknown as CommunicationTemplate[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function arraysDiffer(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
}

export async function editTemplate(
  args: EditTemplateArgs,
  deps: EditTemplateDeps = defaultDeps,
): Promise<EditTemplateResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'template:edit')) {
    return { ok: false, reason: 'permission' }
  }

  const existing = deps.templates.find((t) => t.id === args.id)
  if (!existing) return { ok: false, reason: 'template-not-found' }

  const next: CommunicationTemplate = { ...existing }

  if (args.patch.name !== undefined) {
    const v = args.patch.name.trim()
    if (v === '') return { ok: false, reason: 'missing-name' }
    next.name = v
  }
  if (args.patch.subject !== undefined) {
    if (args.patch.subject.trim() === '') return { ok: false, reason: 'missing-subject' }
    next.subject = args.patch.subject
  }
  if (args.patch.bodyMarkdown !== undefined) {
    if (args.patch.bodyMarkdown.trim() === '') return { ok: false, reason: 'missing-body' }
    next.bodyMarkdown = args.patch.bodyMarkdown
  }
  if (args.patch.defaultRecipient !== undefined) {
    if (!VALID_RECIPIENTS.includes(args.patch.defaultRecipient)) {
      return { ok: false, reason: 'invalid-recipient' }
    }
    next.defaultRecipient = args.patch.defaultRecipient
  }
  if (args.patch.defaultCcRules !== undefined) {
    next.defaultCcRules = args.patch.defaultCcRules
  }
  if (args.patch.variables !== undefined) {
    next.variables = args.patch.variables
  }
  if (args.patch.active !== undefined) {
    next.active = args.patch.active
  }

  const scalarKeys: Array<keyof EditTemplatePatch> = [
    'name', 'subject', 'bodyMarkdown', 'defaultRecipient', 'active',
  ]
  const changedFields: string[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const key of scalarKeys) {
    if (existing[key as keyof CommunicationTemplate] !== next[key as keyof CommunicationTemplate]) {
      changedFields.push(key)
      before[key] = existing[key as keyof CommunicationTemplate]
      after[key] = next[key as keyof CommunicationTemplate]
    }
  }
  if (arraysDiffer(existing.defaultCcRules, next.defaultCcRules)) {
    changedFields.push('defaultCcRules')
    before.defaultCcRules = existing.defaultCcRules
    after.defaultCcRules = next.defaultCcRules
  }
  if (arraysDiffer(existing.variables, next.variables)) {
    changedFields.push('variables')
    before.variables = existing.variables
    after.variables = next.variables
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  // Action selection: pure active-toggle changes get the dedicated
  // template-deactivated / template-reactivated actions so the audit
  // log surfaces the lifecycle event clearly. Mixed edits stay
  // 'template-edited' with the active diff inside before / after.
  let action: AuditAction = 'template-edited'
  if (changedFields.length === 1 && changedFields[0] === 'active') {
    action = next.active ? 'template-reactivated' : 'template-deactivated'
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action,
    before,
    after,
    notes: args.notes ?? `Edited fields: ${changedFields.join(', ')}.`,
  }

  const updated: CommunicationTemplate = {
    ...next,
    lastEditedBy: args.editedBy,
    lastEditedAt: ts,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'communicationTemplate',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, template: updated, changedFields }
}
