/*
 * W4-E.5 createNotification.
 *
 * Persists a Notification record via the standard queue. Used by the
 * 7 trigger wiring sites (createRequest, reviewRequest x3 outcomes,
 * recordIntake, recordReceipt, feedbackAutoEscalation, composeReminder).
 *
 * Two ways to call:
 *   createNotification(args, deps)        single recipient
 *   broadcastNotification(args, deps)     fan-out to N recipients
 *
 * Per-call enforcement:
 *   - canPerform('notification:read') on EACH recipient: every
 *     authenticated role has this baseline grant. Inactive users skip.
 *   - Self-exclusion: when senderUserId !== 'system' and
 *     senderUserId === recipientUserId, the entry is dropped silently
 *     ('skipped-self'). Operators do not need a notification of their
 *     own action; the audit log already captures it. System-emitted
 *     notifications (senderUserId === 'system') do NOT exclude any
 *     recipient because the system is not a user that "did" the
 *     action.
 *   - Idempotency dedup: same kind + recipientUserId + relatedEntityId
 *     within `dedupWindowMs` (default 60s) silently dedups. Prevents
 *     accidental double-fire on race conditions or rapid retry.
 *   - Payload validator from payload_contracts.ts: rejects calls with
 *     missing or wrong-typed fields. Failures throw at write-time so
 *     the bug surfaces during dev rather than silently dropping
 *     notifications in production.
 *
 * Trigger sites should call this AFTER the related entity write
 * succeeds. If the notification fan-out fails (queue error), the
 * entity write is NOT reverted; notifications are best-effort.
 *
 * Skip reasons: 'self' | 'duplicate' | 'unknown-recipient' |
 * 'inactive-recipient' | 'no-permission'.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  Notification,
  NotificationKind,
  User,
} from '@/lib/types'
import notificationsJson from '@/data/notifications.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import { PAYLOAD_VALIDATORS } from './payload_contracts'

export type NotificationSkipReason =
  | 'self'
  | 'duplicate'
  | 'unknown-recipient'
  | 'inactive-recipient'
  | 'no-permission'

export interface CreateNotificationArgs {
  recipientUserId: string
  senderUserId: string                  // User.id OR the literal 'system'
  kind: NotificationKind
  title: string
  body: string
  actionUrl: string
  payload: Record<string, unknown>
  relatedEntityId: string               // dedup key
}

export interface BroadcastNotificationArgs {
  recipientUserIds: string[]
  senderUserId: string
  kind: NotificationKind
  title: string
  body: string
  actionUrl: string
  payload: Record<string, unknown>
  relatedEntityId: string
}

export interface CreateNotificationResult {
  created: Notification[]
  skipped: Array<{ recipientUserId: string; reason: NotificationSkipReason }>
}

export interface CreateNotificationDeps {
  notifications: Notification[]
  users: User[]
  enqueue: typeof enqueueUpdate
  uuid: () => string
  now: () => Date
  dedupWindowMs: number
}

const defaultDeps: CreateNotificationDeps = {
  notifications: notificationsJson as unknown as Notification[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
  dedupWindowMs: 60_000,
}

const SYSTEM_SENDER = 'system' as const

// ----------------------------------------------------------------------------
// Single-recipient
// ----------------------------------------------------------------------------

export async function createNotification(
  args: CreateNotificationArgs,
  deps: CreateNotificationDeps = defaultDeps,
): Promise<CreateNotificationResult> {
  return broadcastNotification(
    {
      recipientUserIds: [args.recipientUserId],
      senderUserId: args.senderUserId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
      payload: args.payload,
      relatedEntityId: args.relatedEntityId,
    },
    deps,
  )
}

// ----------------------------------------------------------------------------
// Multi-recipient fan-out
// ----------------------------------------------------------------------------

export async function broadcastNotification(
  args: BroadcastNotificationArgs,
  deps: CreateNotificationDeps = defaultDeps,
): Promise<CreateNotificationResult> {
  // Payload validation up front (one validator call regardless of
  // recipient count; the validator is pure).
  const validator = PAYLOAD_VALIDATORS[args.kind]
  const validation = validator(args.payload)
  if (!validation.ok) {
    throw new Error(
      `[createNotification] Invalid payload for kind=${args.kind}: missing=${JSON.stringify(validation.missing)} wrongType=${JSON.stringify(validation.wrongType)}`,
    )
  }

  const result: CreateNotificationResult = { created: [], skipped: [] }
  const seenRecipients = new Set<string>()
  const ts = deps.now()
  const tsIso = ts.toISOString()
  const tsMs = ts.getTime()

  for (const rawRid of args.recipientUserIds) {
    if (seenRecipients.has(rawRid)) continue
    seenRecipients.add(rawRid)

    // Self-exclusion (system sender bypasses).
    if (
      args.senderUserId !== SYSTEM_SENDER
      && args.senderUserId === rawRid
    ) {
      result.skipped.push({ recipientUserId: rawRid, reason: 'self' })
      continue
    }

    const recipient = deps.users.find((u) => u.id === rawRid)
    if (!recipient) {
      result.skipped.push({ recipientUserId: rawRid, reason: 'unknown-recipient' })
      continue
    }
    if (!recipient.active) {
      result.skipped.push({ recipientUserId: rawRid, reason: 'inactive-recipient' })
      continue
    }
    if (!canPerform(recipient, 'notification:read')) {
      result.skipped.push({ recipientUserId: rawRid, reason: 'no-permission' })
      continue
    }

    // Dedup window: same kind + recipient + relatedEntityId within
    // dedupWindowMs.
    const recent = deps.notifications.find((n) => {
      if (n.kind !== args.kind) return false
      if (n.recipientUserId !== rawRid) return false
      const sameEntity =
        (n.payload as Record<string, unknown>)?.requestId === args.relatedEntityId
        || (n.payload as Record<string, unknown>)?.intakeRecordId === args.relatedEntityId
        || (n.payload as Record<string, unknown>)?.paymentId === args.relatedEntityId
        || (n.payload as Record<string, unknown>)?.escalationId === args.relatedEntityId
        || (n.payload as Record<string, unknown>)?.communicationId === args.relatedEntityId
      if (!sameEntity) return false
      const created = new Date(n.createdAt).getTime()
      return tsMs - created < deps.dedupWindowMs
    })
    if (recent) {
      result.skipped.push({ recipientUserId: rawRid, reason: 'duplicate' })
      continue
    }

    const id = `NTF-${deps.uuid().slice(0, 8)}`
    const audit: AuditEntry = {
      timestamp: tsIso,
      user: args.senderUserId === SYSTEM_SENDER ? 'system' : args.senderUserId,
      action: 'create',
      after: {
        kind: args.kind,
        recipientUserId: rawRid,
        relatedEntityId: args.relatedEntityId,
      },
      notes: `Notification ${args.kind} fan-out to ${rawRid} (sender=${args.senderUserId}).`,
    }

    const notification: Notification = {
      id,
      recipientUserId: rawRid,
      senderUserId: args.senderUserId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
      payload: args.payload,
      createdAt: tsIso,
      readAt: null,
      auditLog: [audit],
    }

    await deps.enqueue({
      queuedBy: args.senderUserId === SYSTEM_SENDER ? 'system' : args.senderUserId,
      entity: 'notification',
      operation: 'create',
      payload: notification as unknown as Record<string, unknown>,
    })

    result.created.push(notification)
  }

  return result
}

// ----------------------------------------------------------------------------
// Recipient resolvers (used by trigger wiring)
// ----------------------------------------------------------------------------

/**
 * Return User.id list for active users whose effective role includes
 * any of the requested roles. testingOverride grants are honoured (so
 * Misba's OpsHead override still puts her in the OpsHead broadcast).
 */
export function recipientsByRole(
  users: User[],
  roles: User['role'][],
): string[] {
  const out: string[] = []
  for (const u of users) {
    if (!u.active) continue
    if (roles.includes(u.role)) {
      out.push(u.id)
      continue
    }
    if (u.testingOverride && u.testingOverridePermissions) {
      if (u.testingOverridePermissions.some((r) => roles.includes(r))) {
        out.push(u.id)
      }
    }
  }
  return out
}
