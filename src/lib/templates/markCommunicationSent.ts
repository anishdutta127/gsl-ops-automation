/*
 * W4-I.5 Phase 3 markCommunicationSent.
 *
 * Appends a 'communication-sent' audit entry on the parent MOU after
 * the operator clicks "Mark as sent" on the template launcher. We do
 * not write a Communication entity row at this stage; the audit entry
 * carries enough metadata (templateId, recipient, subject, filled
 * variables) for the Communications tab on /mous/[id] to render the
 * chronology in P3C5. Phase 1.1 SMTP integration would replace this
 * with an SMTP-confirmed send + Communication row.
 *
 * No permission gate. Sending is a Sales / Ops shared action and the
 * operator's session is the audit attribution.
 */

import type {
  AuditEntry,
  CommunicationTemplate,
  MOU,
  PendingUpdate,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import templatesJson from '@/data/communication_templates.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export interface MarkCommunicationSentArgs {
  mouId: string
  templateId: string
  recipient: string
  subject: string
  /** CSV string from the form; the lib parses it. */
  filledVariablesCsv?: string
  sentBy: string
}

export type MarkCommunicationSentFailureReason =
  | 'unknown-user'
  | 'mou-not-found'
  | 'template-not-found'

export type MarkCommunicationSentResult =
  | { ok: true; mou: MOU }
  | { ok: false; reason: MarkCommunicationSentFailureReason }

export interface MarkCommunicationSentDeps {
  mous: MOU[]
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

const defaultDeps: MarkCommunicationSentDeps = {
  mous: mousJson as unknown as MOU[],
  templates: templatesJson as unknown as CommunicationTemplate[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function markCommunicationSent(
  args: MarkCommunicationSentArgs,
  deps: MarkCommunicationSentDeps = defaultDeps,
): Promise<MarkCommunicationSentResult> {
  const user = deps.users.find((u) => u.id === args.sentBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const template = deps.templates.find((t) => t.id === args.templateId)
  if (!template) return { ok: false, reason: 'template-not-found' }

  const filledVariables = (args.filledVariablesCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.sentBy,
    action: 'communication-sent',
    after: {
      templateId: template.id,
      templateName: template.name,
      useCase: template.useCase,
      recipient: args.recipient,
      subject: args.subject,
      filledVariables,
    },
    notes: `Sent ${template.name} via Outlook to ${args.recipient || '(no recipient)'}.`,
  }

  const updated: MOU = { ...mou, auditLog: [...mou.auditLog, audit] }

  await deps.enqueue({
    queuedBy: args.sentBy,
    entity: 'mou',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, mou: updated }
}
