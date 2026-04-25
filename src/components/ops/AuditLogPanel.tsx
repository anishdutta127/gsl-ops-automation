/*
 * AuditLogPanel.
 *
 * Renders an entity's auditLog[] inline as a compact vertical list.
 * Phase 1 design (option d from the C3 architectural review):
 *   - Inline-all entries; no truncation; no client state.
 *   - Container max-h-96 with vertical scroll for overflow.
 *   - Per-entry diff (before/after) is disclosed on demand via a
 *     native <details>/<summary> element; no JS, no React state.
 *   - Entries rendered in chronological order (oldest first per
 *     append-only convention).
 *
 * Phase 1.1 trigger (documented in RUNBOOK §10): if any entity's
 * auditLog exceeds 30 entries in production, refactor to truncate-
 * with-expand or paginate, AND consider extending AuditFilterRail
 * to accept entityId=<id> for cross-route deep dives.
 */

import type { AuditEntry } from '@/lib/types'
import { formatDate } from '@/lib/format'

interface AuditLogPanelProps {
  entries: AuditEntry[]
  emptyTitle?: string
}

function hasDiff(entry: AuditEntry): boolean {
  return entry.before !== undefined || entry.after !== undefined
}

function formatTimestamp(iso: string): string {
  // Use formatDate if it parses; fallback to raw substring.
  try {
    const dateOnly = formatDate(iso)
    const time = iso.length >= 16 ? iso.slice(11, 16) : ''
    return time ? `${dateOnly} ${time}` : dateOnly
  } catch {
    return iso
  }
}

export function AuditLogPanel({ entries, emptyTitle = 'No audit entries yet.' }: AuditLogPanelProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyTitle}
      </p>
    )
  }
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border border-border bg-card">
      <ol className="divide-y divide-border">
        {entries.map((entry, idx) => (
          <li key={`${entry.timestamp}-${idx}`} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-xs text-muted-foreground">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className="text-xs font-semibold text-brand-navy">{entry.user}</span>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {entry.action}
              </span>
            </div>
            {entry.notes ? (
              <p className="mt-1 text-sm text-foreground">{entry.notes}</p>
            ) : null}
            {hasDiff(entry) ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Show before / after
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before</div>
                    <pre className="mt-0.5 overflow-x-auto rounded-sm bg-muted px-2 py-1 text-[11px] text-foreground">{JSON.stringify(entry.before ?? null, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">After</div>
                    <pre className="mt-0.5 overflow-x-auto rounded-sm bg-muted px-2 py-1 text-[11px] text-foreground">{JSON.stringify(entry.after ?? null, null, 2)}</pre>
                  </div>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
