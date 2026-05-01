/*
 * DashboardRecentMous (W4-I.5 Phase 2 commit 2).
 *
 * Recent MOU Updates table. 6 rows by default (operator can click
 * "View all" to reach /mous for the full filtered list). Columns:
 * School Name, Programme, MOU Status (chip), Date, Owner (avatar +
 * name), Action (Open arrow link).
 *
 * Status chip mapping (visual language matches the reference):
 *   Active                -> green ('Signed' style)
 *   Pending Signature     -> amber ('Pending' style)
 *   Draft                 -> blue ('Under Review' style; pre-active)
 *   Renewed               -> green
 *   Expired               -> red
 *   Completed             -> neutral
 *
 * StatusChip + Avatar inlined here per the Phase 2 strategy
 * ("build inline; factor into ui/ when used 3+ places").
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MOU } from '@/lib/types'
import type { RecentMouUpdate } from '@/lib/dashboard/dashboardData'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const STATUS_TONE: Record<MOU['status'], { tone: StatusChipTone; label: string }> = {
  Active:               { tone: 'ok',        label: 'Signed' },
  'Pending Signature':  { tone: 'attention', label: 'Pending' },
  Draft:                { tone: 'navy',      label: 'Under Review' },
  Renewed:              { tone: 'ok',        label: 'Renewed' },
  Expired:              { tone: 'alert',     label: 'Expired' },
  Completed:            { tone: 'neutral',   label: 'Completed' },
}

function MouStatusChip({ status }: { status: MOU['status'] }): ReactNode {
  const { tone, label } = STATUS_TONE[status]
  return (
    <StatusChip
      tone={tone}
      label={label}
      testId={`status-chip-${status.replace(/\s+/g, '-')}`}
    />
  )
}

function Avatar({ initials, label }: { initials: string; label: string }): ReactNode {
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-[11px] font-semibold text-brand-navy"
      aria-label={label}
      title={label}
    >
      {initials}
    </span>
  )
}

export interface DashboardRecentMousProps {
  rows: RecentMouUpdate[]
  /** Total filtered MOUs (drives the "of N" hint in the header). */
  totalCount: number
  viewAllHref?: string
}

export function DashboardRecentMous({
  rows,
  totalCount,
  viewAllHref = '/mous',
}: DashboardRecentMousProps) {
  return (
    <section
      aria-labelledby="recent-mous-heading"
      data-testid="dashboard-recent-mous"
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="recent-mous-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Recent MOU Updates
          </h2>
          <p className="text-xs text-muted-foreground">
            Latest signed, pending, and under-review agreements.
          </p>
        </div>
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="recent-mous-view-all"
        >
          View all
          <ArrowRight aria-hidden className="size-3" />
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No MOUs match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Recent MOU updates</caption>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">School Name</th>
                <th scope="col" className="px-4 py-2 font-semibold">Programme</th>
                <th scope="col" className="px-4 py-2 font-semibold">MOU Status</th>
                <th scope="col" className="px-4 py-2 font-semibold">Date</th>
                <th scope="col" className="px-4 py-2 font-semibold">Owner</th>
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.mouId}
                  className="hover:bg-muted/40 focus-within:bg-muted/40"
                  data-testid={`recent-mou-row-${r.mouId}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground sm:px-5">{r.schoolName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.programme}</td>
                  <td className="px-4 py-3"><MouStatusChip status={r.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {DATE_FMT.format(new Date(r.updateDate))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={r.ownerInitials} label={r.ownerName} />
                      <span className="text-xs text-foreground">{r.ownerName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <Link
                      href={`/mous/${r.mouId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      data-testid={`recent-mou-open-${r.mouId}`}
                    >
                      Open
                      <ArrowRight aria-hidden className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="border-t border-border px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground sm:px-5">
        Showing {rows.length} of {totalCount}
      </footer>
    </section>
  )
}
