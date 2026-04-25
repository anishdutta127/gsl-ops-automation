/*
 * AuditRow (DESIGN.md "Surface 5 / Admin audit route / results pane").
 *
 * One row per AuditEntry on /admin/audit. Permissions-filtering
 * happens server-side before this renders (per
 * src/lib/auth/permissions.ts canViewAuditEntry); this component
 * assumes the entry is visible to the viewing user.
 */

import Link from 'next/link'
import type { AuditEntry, UserRole } from '@/lib/types'
import { formatDate } from '@/lib/format'

interface AuditRowProps {
  entry: AuditEntry
  user: { name: string; role: UserRole; email?: string | null }
  entityLabel: string
  entityHref: string
  showEmail?: boolean
}

function formatTimestamp(iso: string): string {
  // DD-MMM-YYYY HH:mm IST per DESIGN.md "Copy conventions / Dates".
  const date = formatDate(iso)
  if (date === '-') return '-'
  try {
    const parsed = new Date(iso)
    const hh = String(parsed.getHours()).padStart(2, '0')
    const mm = String(parsed.getMinutes()).padStart(2, '0')
    return `${date} ${hh}:${mm} IST`
  } catch {
    return date
  }
}

export function AuditRow({
  entry,
  user,
  entityLabel,
  entityHref,
  showEmail = false,
}: AuditRowProps) {
  return (
    <li className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="font-mono text-xs text-slate-500 sm:w-44 sm:shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span className="text-sm text-[var(--brand-navy)] sm:w-48 sm:shrink-0">
        <span className="font-medium">{user.name}</span>
        <span className="ml-2 inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] uppercase text-slate-700">
          {user.role}
        </span>
        {showEmail && user.email ? (
          <span className="ml-2 text-xs text-slate-500">{user.email}</span>
        ) : null}
      </span>
      <span className="text-sm text-foreground sm:flex-1">
        <span className="font-medium">{entry.action}</span>
        <span className="mx-2 text-slate-400" aria-hidden>
          ·
        </span>
        <Link
          href={entityHref}
          className="text-[var(--brand-navy)] underline-offset-2 hover:underline"
        >
          {entityLabel}
        </Link>
        {entry.notes ? (
          <span className="ml-2 truncate text-xs text-slate-600" title={entry.notes}>
            {entry.notes}
          </span>
        ) : null}
      </span>
    </li>
  )
}
