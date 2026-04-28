'use client'

/*
 * NotificationBellClient (W4-E.6).
 *
 * Client component that owns the open/close state for the dropdown.
 * Click on a row navigates to /notifications/{id}/visit (server-side
 * markRead + redirect to actionUrl), so each row is just an <a> link
 * that works even when JS is partially broken. The open/close UX is
 * the only piece that needs client state.
 *
 * Outside-click closes the dropdown via a document-level mousedown
 * listener registered while the dropdown is open. Esc also closes.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

interface RowData {
  id: string
  kind: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
  kindIcon: string
}

interface NotificationBellClientProps {
  ownCount: number
  unreadCount: number
  badge: string | null
  top10: RowData[]
}

function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diffMs = now.getTime() - t
  if (diffMs < 60_000) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function NotificationBellClient({
  ownCount,
  unreadCount,
  badge,
  top10,
}: NotificationBellClientProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative" data-testid="notification-bell-wrapper">
      <button
        type="button"
        aria-label={`Notifications${badge ? ` (${badge} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="notification-bell-button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex min-h-11 items-center justify-center px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
      >
        <Bell aria-hidden className="size-5" />
        {badge ? (
          <span
            data-testid="notification-bell-badge"
            className="absolute right-1 top-0.5 rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-semibold leading-tight text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications dropdown"
          data-testid="notification-bell-dropdown"
          className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm font-semibold">
            <span>Notifications</span>
            <span className="text-xs font-normal text-slate-500">
              {unreadCount} unread of {ownCount}
            </span>
          </div>
          {top10.length === 0 ? (
            <p
              data-testid="notification-bell-empty"
              className="px-3 py-6 text-center text-sm text-slate-500"
            >
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {top10.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notifications/${encodeURIComponent(n.id)}/visit`}
                    onClick={() => setOpen(false)}
                    data-testid={`notification-bell-row-${n.id}`}
                    className={
                      'block min-h-11 px-3 py-2 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-teal '
                      + (n.readAt === null ? 'bg-blue-50/40' : '')
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                      {n.body}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            data-testid="notification-bell-see-all"
            className="block min-h-11 border-t border-slate-200 px-3 py-2 text-center text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            See all notifications
          </Link>
        </div>
      ) : null}
    </div>
  )
}
