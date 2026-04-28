/*
 * /notifications (W4-E.6 list page).
 *
 * Server component. Lists all notifications for the current user
 * (read + unread) with filters by status (all / unread / by-kind)
 * and a mark-all-read action visible only when unread > 0. Per-row
 * click routes to /notifications/[id]/visit which marks-read and
 * redirects to actionUrl.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, CheckCircle2 } from 'lucide-react'
import notificationsJson from '@/data/notifications.json'
import type { Notification, NotificationKind } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { markAllReadAction } from './actions'

const allNotifications = notificationsJson as unknown as Notification[]

const KIND_LABEL: Record<NotificationKind | 'all' | 'unread', string> = {
  all: 'All',
  unread: 'Unread',
  'dispatch-request-created': 'DR created',
  'dispatch-request-approved': 'DR approved',
  'dispatch-request-rejected': 'DR rejected',
  'dispatch-request-cancelled': 'DR cancelled',
  'intake-completed': 'Intake completed',
  'payment-recorded': 'Payment recorded',
  'escalation-assigned': 'Escalation',
  'reminder-due': 'Reminder',
}

const FILTER_KEYS: Array<NotificationKind | 'all' | 'unread'> = [
  'all',
  'unread',
  'dispatch-request-created',
  'dispatch-request-approved',
  'dispatch-request-rejected',
  'dispatch-request-cancelled',
  'intake-completed',
  'payment-recorded',
  'escalation-assigned',
  'reminder-due',
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fnotifications')

  const sp = await searchParams
  const rawFilter = typeof sp.filter === 'string' ? sp.filter : 'all'
  const filter = (FILTER_KEYS as ReadonlyArray<string>).includes(rawFilter)
    ? (rawFilter as NotificationKind | 'all' | 'unread')
    : 'all'
  const markedCount = typeof sp.marked === 'string' ? Number(sp.marked) : null

  const own = allNotifications
    .filter((n) => n.recipientUserId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const unreadCount = own.filter((n) => n.readAt === null).length

  const filtered = own.filter((n) => {
    if (filter === 'all') return true
    if (filter === 'unread') return n.readAt === null
    return n.kind === filter
  })

  return (
    <>
      <TopNav currentPath="/notifications" />
      <PageHeader
        title="Notifications"
        breadcrumb={[{ label: 'Notifications' }]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <Bell aria-hidden className="size-4 shrink-0 text-slate-500" />
          <span>
            {own.length} notification{own.length === 1 ? '' : 's'} · {unreadCount} unread.
            Click any row to navigate; the system marks the notification read in the same step.
          </span>
        </p>

        {markedCount !== null && Number.isFinite(markedCount) ? (
          <p
            role="status"
            data-testid="notifications-marked-flash"
            className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900"
          >
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            <span>
              {markedCount === 0
                ? 'No notifications were unread.'
                : `Marked ${markedCount} notification${markedCount === 1 ? '' : 's'} as read.`}
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
            {FILTER_KEYS.map((k) => {
              const isActive = k === filter
              const qs = new URLSearchParams()
              if (k !== 'all') qs.set('filter', k)
              const tail = qs.toString()
              const href = tail === '' ? '/notifications' : `/notifications?${tail}`
              return (
                <Link
                  key={k}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`notif-filter-${k}`}
                  className={
                    isActive
                      ? 'inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white'
                      : 'inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy'
                  }
                >
                  {KIND_LABEL[k]}
                </Link>
              )
            })}
          </div>
          {unreadCount > 0 ? (
            <form action={markAllReadAction}>
              <button
                type="submit"
                data-testid="notif-mark-all-read"
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Mark all read ({unreadCount})
              </button>
            </form>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <p
            data-testid="notif-empty"
            className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            {filter === 'all'
              ? 'No notifications yet.'
              : 'No notifications match this filter.'}
          </p>
        ) : (
          <ul
            className="divide-y divide-border rounded-md border border-border bg-card"
            data-testid="notif-list"
          >
            {filtered.map((n) => (
              <li
                key={n.id}
                data-testid={`notif-row-${n.id}`}
                className={
                  n.readAt === null ? 'bg-blue-50/40' : 'bg-card'
                }
              >
                <Link
                  href={`/notifications/${encodeURIComponent(n.id)}/visit`}
                  className="block min-h-11 px-4 py-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {n.title}
                      {n.readAt === null ? (
                        <span
                          aria-label="Unread"
                          className="ml-2 inline-block size-2 rounded-full bg-brand-navy align-middle"
                        />
                      ) : null}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{n.body}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {KIND_LABEL[n.kind]}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
