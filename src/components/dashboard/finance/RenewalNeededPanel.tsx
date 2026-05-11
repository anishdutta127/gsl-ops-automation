/*
 * RenewalNeededPanel (Gate 4.95 Session 2, Row 3.5 Right of /dashboard/finance).
 *
 * Up to 5 MOUs that are expired or due to expire within 30 days, sorted
 * most-expired first. Each row links to the MOU detail. Empty state when
 * nothing in the filtered window needs renewal.
 */

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import type { MOU, Programme } from '@/lib/types'
import type { RenewalRow } from '@/lib/dashboard/financeDashboardData'

interface Props {
  rows: RenewalRow[]
  expiredCount: number
  expiringSoonCount: number
}

const PROGRAMME_PILL_CLASS: Record<Programme, string> = {
  STEAM: 'bg-brand-teal/15 text-brand-navy',
  'Young Pioneers': 'bg-violet-100 text-violet-700',
  'Harvard HBPE': 'bg-amber-100 text-amber-700',
  Robotics: 'bg-indigo-100 text-indigo-700',
}

function programmePillClass(programme: Programme): string {
  return PROGRAMME_PILL_CLASS[programme] ?? 'bg-slate-100 text-slate-700'
}

function mouStatusTone(status: MOU['status']): StatusChipTone {
  switch (status) {
    case 'Active':
      return 'ok'
    case 'Draft':
    case 'Pending Signature':
      return 'attention'
    case 'Expired':
      return 'alert'
    case 'Completed':
    case 'Renewed':
      return 'navy'
    default:
      return 'neutral'
  }
}

export function RenewalNeededPanel({
  rows,
  expiredCount,
  expiringSoonCount,
}: Props) {
  return (
    <section
      data-testid="renewal-needed-panel"
      aria-labelledby="renewal-needed-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            id="renewal-needed-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Renewal needed
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {expiredCount} expired, {expiringSoonCount} due in 30 days
          </p>
        </div>
        <Link
          href="/finance/renewals"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          See renewals <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle2 aria-hidden className="size-4 text-signal-ok" />
          No MOUs need renewal in the next 30 days.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.mouId}>
              <Link
                href={`/mous/${row.mouId}`}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${programmePillClass(row.programme)}`}
                    >
                      {row.programme}
                    </span>
                    <StatusChip tone={mouStatusTone(row.status)} label={row.status} />
                  </div>
                  <div className="mt-1 truncate font-semibold text-brand-navy">
                    {row.schoolName}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    Ends {formatDate(row.endDate)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <ExpiryChip
                    isExpired={row.isExpired}
                    daysToExpiry={row.daysToExpiry}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExpiryChip({
  isExpired,
  daysToExpiry,
}: {
  isExpired: boolean
  daysToExpiry: number | null
}) {
  if (daysToExpiry === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        no end date
      </span>
    )
  }
  if (isExpired) {
    const ago = Math.abs(daysToExpiry)
    return (
      <span className="inline-flex items-center rounded-full bg-signal-alert/15 px-2 py-0.5 text-[11px] font-semibold text-signal-alert">
        expired {ago}d ago
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      expires in {daysToExpiry}d
    </span>
  )
}
