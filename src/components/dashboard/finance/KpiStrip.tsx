/*
 * KpiStrip: 4 headline cards on /dashboard/finance.
 *
 * Order is overall-first, action-second:
 *   1. Total contract value   2. Collected   3. Outstanding   4. Needs attention
 *
 * Mobile: 2x2. sm+: 4-up. Cards 1-3 are read-only; card 4 is a Link to the
 * actionable list (overdue payments + stalled PIs surfaced below the strip).
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type { KpiStripData } from '@/lib/dashboard/financeDashboardData'

interface Props {
  data: KpiStripData
  /** Drilldown link for the Needs attention card (e.g. /dashboard/finance#top-overdue-payments). */
  needsAttentionHref: string
  /** Optional scope label for the contract-value subtitle (e.g. "FY 2026-27"). */
  scopeLabel?: string
}

export function KpiStrip({ data, needsAttentionHref, scopeLabel }: Props) {
  const contractScope = scopeLabel
    ? `across ${data.schoolsCount} schools in ${scopeLabel}`
    : `across ${data.schoolsCount} active schools`

  const collectedPctLabel = data.contractValue > 0
    ? `${data.collectedPct.toFixed(1)}% of total contract value`
    : 'No contract value to collect against yet'

  const outstandingSubtitle = data.outstandingSchoolsCount > 0
    ? `across ${data.outstandingSchoolsCount} schools with balance`
    : 'Every school has settled'

  const attentionParts: string[] = []
  if (data.overduePaymentsCount > 0) {
    attentionParts.push(
      `${data.overduePaymentsCount} overdue ${data.overduePaymentsCount === 1 ? 'payment' : 'payments'}`,
    )
  }
  if (data.stalledPiCount > 0) {
    attentionParts.push(
      `${data.stalledPiCount} stalled ${data.stalledPiCount === 1 ? 'PI' : 'PIs'}`,
    )
  }
  const attentionSubtitle =
    attentionParts.length > 0
      ? attentionParts.join(' · ')
      : 'No overdue payments or stalled PIs'

  return (
    <section
      aria-label="Finance headline summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
    >
      <div
        data-testid="kpi-contract-value"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Total contract value
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
          {formatRs(data.contractValue, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-slate-600">{contractScope}</div>
      </div>

      <div
        data-testid="kpi-collected"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Collected
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-signal-ok">
          {formatRs(data.collectedAmount, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-slate-600">{collectedPctLabel}</div>
      </div>

      <div
        data-testid="kpi-outstanding"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-600">
          Outstanding
        </div>
        <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
          {formatRs(data.outstandingAmount, { compact: true })}
        </div>
        <div className="mt-1 text-xs text-slate-600">{outstandingSubtitle}</div>
      </div>

      <Link
        href={needsAttentionHref}
        data-testid="kpi-needs-attention"
        className="group rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-600">
            Needs attention
          </span>
          <ArrowRight
            aria-hidden
            className="size-3 text-slate-400 transition-transform group-hover:translate-x-0.5"
          />
        </div>
        <div
          className={
            'mt-1 font-heading text-2xl font-bold ' +
            (data.needsAttentionCount > 0 ? 'text-amber-600' : 'text-signal-ok')
          }
        >
          {data.needsAttentionCount}
        </div>
        <div className="mt-1 text-xs text-slate-600">{attentionSubtitle}</div>
      </Link>
    </section>
  )
}
