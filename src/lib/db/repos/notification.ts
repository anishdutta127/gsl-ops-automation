/*
 * Notification repo (Phase 7).
 *
 * JSONB: payload (Record<string, unknown> with FKs to the target entity),
 * audit_log. Notifications are append-mostly: createMany on emission,
 * markRead on click.
 */

import type { Notification, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import notificationsJson from '@/data/notifications.json'

const jsonNotifications = notificationsJson as unknown as Notification[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface NotificationRow {
  id: string
  recipient_user_id: string
  sender_user_id: string | null
  kind: Notification['kind']
  title: string
  body: string | null
  action_url: string | null
  payload: Json
  created_at: string
  read_at: string | null
  audit_log: Json
}

function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    recipientUserId: r.recipient_user_id,
    senderUserId: r.sender_user_id ?? 'system',
    kind: r.kind,
    title: r.title,
    body: r.body ?? '',
    actionUrl: r.action_url ?? '',
    payload: (r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)) ? r.payload : {},
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
    readAt: r.read_at,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  }
}

export const notificationRepo = {
  async findAll(): Promise<Notification[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<NotificationRow[]>`SELECT * FROM notifications ORDER BY created_at DESC`
      return rows.map(rowToNotification)
    }
    return jsonNotifications
  },

  async findById(id: string): Promise<Notification | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<NotificationRow[]>`SELECT * FROM notifications WHERE id = ${id}`
      return rows[0] ? rowToNotification(rows[0]) : null
    }
    return jsonNotifications.find((n) => n.id === id) ?? null
  },

  async findByRecipient(userId: string, opts?: { unreadOnly?: boolean }): Promise<Notification[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = opts?.unreadOnly
        ? await sql<NotificationRow[]>`
            SELECT * FROM notifications
            WHERE recipient_user_id = ${userId} AND read_at IS NULL
            ORDER BY created_at DESC
          `
        : await sql<NotificationRow[]>`
            SELECT * FROM notifications WHERE recipient_user_id = ${userId} ORDER BY created_at DESC
          `
      return rows.map(rowToNotification)
    }
    const out = jsonNotifications.filter((n) => n.recipientUserId === userId)
    return opts?.unreadOnly ? out.filter((n) => n.readAt === null) : out
  },

  async create(n: Notification): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO notifications (id, recipient_user_id, sender_user_id, kind, title,
                                   body, action_url, payload, created_at, read_at, audit_log)
        VALUES (
          ${n.id}, ${n.recipientUserId}, ${n.senderUserId === 'system' ? null : n.senderUserId},
          ${n.kind}, ${n.title}, ${n.body || null}, ${n.actionUrl || null},
          ${sql.json((n.payload ?? {}) as never)}::jsonb,
          ${n.createdAt || sql`NOW()`},
          ${n.readAt ?? null},
          ${sql.json((n.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'notification',
      operation: 'create',
      payload: n as unknown as Record<string, unknown>,
    })
  },

  async update(n: Notification): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE notifications SET
          kind = ${n.kind},
          title = ${n.title},
          body = ${n.body || null},
          action_url = ${n.actionUrl || null},
          payload = ${sql.json((n.payload ?? {}) as never)}::jsonb,
          read_at = ${n.readAt ?? null},
          audit_log = ${sql.json((n.auditLog ?? []) as never)}::jsonb
        WHERE id = ${n.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'notification',
      operation: 'update',
      payload: n as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE notifications SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const n = jsonNotifications.find((x) => x.id === id)
    if (!n) return
    const updated: Notification = { ...n, auditLog: [...(n.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'notification',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
