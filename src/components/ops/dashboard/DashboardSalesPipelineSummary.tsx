/*
 * DashboardSalesPipelineSummary (W4-I.5 Phase 2 commit 4).
 *
 * Anish-added compact summary card. Surfaces the top-level pipeline
 * pulse so operators see how many opportunities exist, how many were
 * added this month, and how many converted; with a "View pipeline"
 * CTA that hands off to /sales-pipeline. Lower-hierarchy than the
 * Action Centre or Communication panels (the pipeline is sales-led;
 * Ops monitors but does not own).
 */

import Link from 'next/link'
import { ArrowRight, TrendingUp } from 'lucide-react'
import type { SalesPipelineSummaryData } from '@/lib/dashboard/dashboardData'

export interface DashboardSalesPipelineSummaryProps {
  data: SalesPipelineSummaryData
  href?: string
}

export function DashboardSalesPipelineSummary({
  data,
  href = '/sales-pipeline',
}: DashboardSalesPipelineSummaryProps) {
  return (
    <section
      aria-labelledby="sales-pipeline-summary-heading"
      data-testid="dashboard-sales-pipeline-summary"
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-col items-start gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-navy">
            <TrendingUp className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="sales-pipeline-summary-heading"
              className="font-heading text-base font-semibold text-brand-navy"
            >
              Sales Pipeline
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">{data.totalOpportunities}</span> opportunities
              {' '}<span aria-hidden>&middot;</span>{' '}
              <span className="tabular-nums">{data.addedThisMonth}</span> this month
              {' '}<span aria-hidden>&middot;</span>{' '}
              <span className="tabular-nums">{data.converted}</span> converted
              {data.lost > 0 ? (
                <>
                  {' '}<span aria-hidden>&middot;</span>{' '}
                  <span className="tabular-nums">{data.lost}</span> lost
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Link
          href={href}
          data-testid="sales-pipeline-summary-cta"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy"
        >
          <span>View pipeline</span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  )
}
