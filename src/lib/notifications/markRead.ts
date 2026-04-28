/*
 * W4-E.5 markRead.
 *
 * Idempotent flip of Notification.readAt. The call is gated on:
 *   - canPerform('notification:mark-read') for the user (baseline-
 *     granted to every authenticated role)
 *   - user.id === notification.recipientUserId: a user can only mark
 *     their own notifications read; another role cannot mark on
 *     someone else's behalf
 *
 * Idempotency: a notification that is already read returns
 * 'already-read' without writing. Re-marking is a no-op (no audit
 * entry duplication).
 */

import type {
  AuditEntry,
  Notification,
  User,
} from '@/lib/types'
import notificationsJson from '@/data/notifications.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

export interface MarkReadArgs {
  notificationId: string
  markedBy: string                      // User.id; must match recipientUserId
}

export type MarkReadFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'notification-not-found'
  | 'not-recipient'
  | 'already-read'

export type MarkReadResult =
  | { ok: true; notification: Notification }
  | { ok: false; reason: MarkReadFailureReason }

export interface MarkReadDeps {
  notifications: Notification[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: MarkReadDeps = {
  notifications: notificationsJson as unknown as Notification[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function markRead(
  args: MarkReadArgs,
  deps: MarkReadDeps = defaultDeps,
): Promise<MarkReadResult> {
  const user = deps.users.find((u) => u.id === args.markedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'notification:mark-read')) {
    return { ok: false, reason: 'permission' }
  }
  const n = deps.notifications.find((x) => x.id === args.notificationId)
  if (!n) return { ok: false, reason: 'notification-not-found' }
  if (n.recipientUserId !== args.markedBy) {
    return { ok: false, reason: 'not-recipient' }
  }
  if (n.readAt !== null) {
    return { ok: false, reason: 'already-read' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.markedBy,
    action: 'notification-marked-read',
    before: { readAt: null },
    after: { readAt: ts },
    notes: 'Recipient marked notification as read.',
  }

  const updated: Notification = {
    ...n,
    readAt: ts,
    auditLog: [...n.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.markedBy,
    entity: 'notification',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, notification: updated }
}

/**
 * Mark every unread notification for the given user as read. Returns
 * the count of notifications updated. Used by the W4-E.6 mark-all-read
 * action on /notifications. Idempotent: already-read entries are
 * skipped silently.
 */
export async function markAllRead(
  userId: string,
  deps: MarkReadDeps = defaultDeps,
): Promise<{ updated: number; skippedReason?: MarkReadFailureReason }> {
  const user = deps.users.find((u) => u.id === userId)
  if (!user) return { updated: 0, skippedReason: 'unknown-user' }
  if (!canPerform(user, 'notification:mark-read')) {
    return { updated: 0, skippedReason: 'permission' }
  }

  const ts = deps.now().toISOString()
  let updated = 0
  for (const n of deps.notifications) {
    if (n.recipientUserId !== userId) continue
    if (n.readAt !== null) continue
    const audit: AuditEntry = {
      timestamp: ts,
      user: userId,
      action: 'notification-marked-read',
      before: { readAt: null },
      after: { readAt: ts },
      notes: 'Recipient marked notification as read via mark-all-read.',
    }
    const next: Notification = {
      ...n,
      readAt: ts,
      auditLog: [...n.auditLog, audit],
    }
    await deps.enqueue({
      queuedBy: userId,
      entity: 'notification',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
    updated += 1
  }
  return { updated }
}
