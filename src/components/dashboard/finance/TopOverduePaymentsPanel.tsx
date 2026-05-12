/*
 * TopOverduePaymentsPanel (Gate 4.95 Session 2, Row 3.5 Left of /dashboard/finance).
 *
 * Up to 5 past-due payments by largest balance. Each row links to the
 * parent MOU. Empty state when no overdue payments exist in the
 * filtered window.
 */

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type {
  Programme,
} from '@/lib/types'
import type { TopOverdueRow } from '@/lib/dashboard/financeDashboardData'
import { EmptyState } from '@/components/ops/EmptyState'

interface Props {
  rows: TopOverdueRow[]
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

export function TopOverduePaymentsPanel({ rows }: Props) {
  return (
    <section
      data-testid="top-overdue-payments-panel"
      aria-labelledby="top-overdue-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            id="top-overdue-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Top overdue payments
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {rows.length} {rows.length === 1 ? 'payment' : 'payments'} past due
          </p>
        </div>
        <Link
          href="/mous"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          See registry <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 aria-hidden className="size-5 text-signal-ok" />}
          title="No overdue payments."
        />
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.paymentId}>
              <Link
                href={`/mous/${row.mouId}`}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${programmePillClass(row.programme)}`}
                    >
                      {row.programme}
                    </span>
                    <span className="truncate text-[11px] text-slate-500">
                      {row.piNumber ?? '(no PI)'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-semibold text-brand-navy">
                    {row.schoolName}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-600">
                    {row.instalmentLabel} · {row.description} · due{' '}
                    {row.dueDateRaw ?? '-'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-heading text-sm font-bold text-signal-alert">
                    {formatRs(row.balance, { compact: true })}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    balance
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
