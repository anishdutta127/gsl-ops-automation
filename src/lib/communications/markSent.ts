/*
 * Mark Communication as sent (Phase D3 manual-send pattern).
 *
 * Companion to composeFeedbackRequest. Operator copies the
 * composed content via clipboard, sends from Outlook, then clicks
 * "Mark as sent". This lib flips Communication.status from
 * 'queued-for-manual' to 'sent', sets sentAt + records the
 * acting user, and appends a status_change audit entry.
 *
 * Permission gate matches compose: 'mou:send-feedback-request'
 * (Admin + OpsHead). Phase 1 uses the same gate for both halves
 * of the flow because either operator can pick up the other's
 * draft (small team; trust model is per-tester not per-action).
 *
 * Idempotency: if status is already 'sent', returns 'already-sent'
 * without writing. Operators clicking the button twice produce
 * one audit entry.
 */

import type {
  AuditEntry,
  Communication,
  User,
} from '@/lib/types'
import communicationsJson from '@/data/communications.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

export interface MarkSentArgs {
  communicationId: string
  markedBy: string
}

export type MarkSentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'communication-not-found'
  | 'already-sent'
  | 'wrong-status'  // status not 'queued-for-manual'

export type MarkSentResult =
  | { ok: true; communication: Communication }
  | { ok: false; reason: MarkSentFailureReason }

export interface MarkSentDeps {
  communications: Communication[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: MarkSentDeps = {
  communications: communicationsJson as unknown as Communication[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function markCommunicationSent(
  args: MarkSentArgs,
  deps: MarkSentDeps = defaultDeps,
): Promise<MarkSentResult> {
  const user = deps.users.find((u) => u.id === args.markedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:send-feedback-request')) {
    return { ok: false, reason: 'permission' }
  }

  const comm = deps.communications.find((c) => c.id === args.communicationId)
  if (!comm) return { ok: false, reason: 'communication-not-found' }

  if (comm.status === 'sent') {
    return { ok: false, reason: 'already-sent' }
  }
  if (comm.status !== 'queued-for-manual') {
    return { ok: false, reason: 'wrong-status' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.markedBy,
    action: 'status_change',
    before: { status: comm.status, sentAt: comm.sentAt },
    after: { status: 'sent', sentAt: ts },
    notes: 'Operator marked manual-send Communication as delivered (Outlook send confirmed).',
  }

  const updated: Communication = {
    ...comm,
    status: 'sent',
    sentAt: ts,
    auditLog: [...comm.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.markedBy,
    entity: 'communication',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, communication: updated }
}
