/*
 * W4-E.4 reminder mark-sent.
 *
 * Companion to composeReminder. Operator copies the rendered email
 * and sends from Outlook, then clicks "I sent it"; this lib flips
 * Communication.status from 'queued-for-manual' to 'sent', sets
 * sentAt, and appends a 'reminder-marked-sent' audit entry. Permission
 * gate matches compose ('reminder:create'); idempotent on already-sent
 * (returns 'already-sent', no write).
 */

import type {
  AuditEntry,
  Communication,
  CommunicationType,
  User,
} from '@/lib/types'
import communicationsJson from '@/data/communications.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const REMINDER_TYPES: ReadonlySet<CommunicationType> = new Set<CommunicationType>([
  'reminder-intake-chase',
  'reminder-payment-chase',
  'reminder-delivery-ack-chase',
  'reminder-feedback-chase',
])

export interface MarkReminderSentArgs {
  communicationId: string
  markedBy: string
}

export type MarkReminderSentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'communication-not-found'
  | 'not-a-reminder'
  | 'already-sent'
  | 'wrong-status'

export type MarkReminderSentResult =
  | { ok: true; communication: Communication }
  | { ok: false; reason: MarkReminderSentFailureReason }

export interface MarkReminderSentDeps {
  communications: Communication[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: MarkReminderSentDeps = {
  communications: communicationsJson as unknown as Communication[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function markReminderSent(
  args: MarkReminderSentArgs,
  deps: MarkReminderSentDeps = defaultDeps,
): Promise<MarkReminderSentResult> {
  const user = deps.users.find((u) => u.id === args.markedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'reminder:create')) {
    return { ok: false, reason: 'permission' }
  }

  const comm = deps.communications.find((c) => c.id === args.communicationId)
  if (!comm) return { ok: false, reason: 'communication-not-found' }
  if (!REMINDER_TYPES.has(comm.type)) {
    return { ok: false, reason: 'not-a-reminder' }
  }
  if (comm.status === 'sent') return { ok: false, reason: 'already-sent' }
  if (comm.status !== 'queued-for-manual') return { ok: false, reason: 'wrong-status' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.markedBy,
    action: 'reminder-marked-sent',
    before: { status: comm.status, sentAt: comm.sentAt },
    after: { status: 'sent', sentAt: ts, type: comm.type },
    notes: 'Operator marked reminder Communication as delivered (Outlook send confirmed).',
  }

  const updated: Communication = {
    ...comm,
    status: 'sent',
    sentAt: ts,
    auditLog: [...comm.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.markedBy,
    entity: 'communication',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, communication: updated }
}
