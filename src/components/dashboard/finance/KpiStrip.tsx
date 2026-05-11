/*
 * KpiStrip (Gate 4.95 Session 2, Row 1 of /dashboard/finance).
 *
 * 4 KPI cards: Active MOUs, Contract value, Collected %, Open alerts.
 * Stack 2-up on mobile, 4-up on sm+.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type { KpiStripData } from '@/lib/dashboard/financeDashboardData'

interface Props {
  data: KpiStripData
  schoolsHref: string
}

export function KpiStrip({ data, schoolsHref }: Props) {
  return (
    <section
      aria-label="Finance KPI summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
    >
      <div
        data-testid="kpi-active-mous"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Active MOUs
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-violet-700">
          {data.activeMous}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {data.pipelineMous} in pipeline
        </div>
      </div>

      <Link
        href={schoolsHref}
        data-testid="kpi-contract-value"
        className="group rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-600">
            Contract value
          </span>
          <ArrowRight
            aria-hidden
            className="size-3 text-slate-400 transition-transform group-hover:translate-x-0.5"
          />
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
          {formatRs(data.contractValue, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          across {data.schoolsCount} schools · click to view
        </div>
      </Link>

      <div
        data-testid="kpi-collected"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Collected
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-signal-ok">
          {data.collectedPct.toFixed(1)}%
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {formatRs(data.collectedAmount, { compact: true })} of{' '}
          {formatRs(data.contractValue, { compact: true })}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {formatRs(data.outstandingAmount, { compact: true })} open
        </div>
      </div>

      <div
        data-testid="kpi-open-alerts"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Open alerts
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-amber-600">
          {data.openAlerts}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {data.highAlerts} high · {data.mediumAlerts} medium
        </div>
      </div>
    </section>
  )
}
