/*
 * NotificationBell (W4-E.6).
 *
 * Server component renders the bell icon with the unread-count badge
 * and the dropdown list. Reads notifications.json filtered by current
 * recipient. Click on a row routes through /notifications/[id]/visit
 * which marks-read and redirects to the actionUrl. Dropdown open/close
 * uses native HTML <details>/<summary> for zero-JS behaviour; the
 * dropdown closes on outside-click via the small companion script
 * registered by the Client child.
 *
 * Badge cap: 1-9 numeric; "9+" for >= 10. Hidden at 0 unread.
 */

import Link from 'next/link'
import { Bell } from 'lucide-react'
import notificationsJson from '@/data/notifications.json'
import type { Notification, User } from '@/lib/types'
import { NotificationBellClient } from './NotificationBellClient'

const allNotifications = notificationsJson as unknown as Notification[]

const KIND_ICON: Record<Notification['kind'], string> = {
  'dispatch-request-created': 'package',
  'dispatch-request-approved': 'check-circle',
  'dispatch-request-rejected': 'x-circle',
  'dispatch-request-cancelled': 'circle-slash',
  'intake-completed': 'clipboard-check',
  'payment-recorded': 'banknote',
  'escalation-assigned': 'alert-triangle',
  'reminder-due': 'bell',
  'inventory-low-stock': 'package-minus',
}

interface NotificationBellProps {
  user: User
}

export function NotificationBell({ user }: NotificationBellProps) {
  const own = allNotifications
    .filter((n) => n.recipientUserId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const unread = own.filter((n) => n.readAt === null)
  const badge = unread.length === 0 ? null : unread.length >= 10 ? '9+' : String(unread.length)
  const top10 = own.slice(0, 10)

  return (
    <NotificationBellClient
      ownCount={own.length}
      unreadCount={unread.length}
      badge={badge}
      top10={top10.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        readAt: n.readAt,
        kindIcon: KIND_ICON[n.kind],
      }))}
    />
  )
}

// Re-export for tests + alternate consumers that need to render the
// non-interactive shape.
export type SerialisedNotificationRow = {
  id: string
  kind: Notification['kind']
  title: string
  body: string
  createdAt: string
  readAt: string | null
  kindIcon: string
}

export const __testing__ = {
  KIND_ICON,
}

// Static fallback used in tests that mock out the Client component.
export function NotificationBellStatic({ user }: NotificationBellProps) {
  const own = allNotifications.filter((n) => n.recipientUserId === user.id)
  const unread = own.filter((n) => n.readAt === null)
  const badge = unread.length === 0 ? null : unread.length >= 10 ? '9+' : String(unread.length)
  return (
    <Link
      href="/notifications"
      data-testid="notification-bell-static"
      className="relative flex min-h-11 items-center justify-center px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
      aria-label={`Notifications${badge ? ` (${badge} unread)` : ''}`}
    >
      <Bell aria-hidden className="size-5" />
      {badge ? (
        <span
          data-testid="notification-bell-badge"
          className="absolute -top-0.5 right-1 rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-semibold leading-tight text-white"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
