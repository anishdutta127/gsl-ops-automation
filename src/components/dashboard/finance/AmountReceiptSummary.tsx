/*
 * AmountReceiptSummary (Gate 4.95 Session 2, Row 4 of /dashboard/finance).
 *
 * Window-scoped totals: total due vs received, with pending derived.
 * Warning line surfaces when receipts exceed dues for the period so
 * excess credits can be drilled into.
 */

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type { AmountReceiptSummary as AmountReceiptSummaryData } from '@/lib/dashboard/financeDashboardData'

interface Props {
  data: AmountReceiptSummaryData
  windowLabel: string
  receiptsHref: string
}

export function AmountReceiptSummary({
  data,
  windowLabel,
  receiptsHref,
}: Props) {
  return (
    <section
      data-testid="amount-receipt-summary"
      aria-labelledby="amount-receipt-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="amount-receipt-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Amount Receipt Summary
        </h2>
        <Link
          href={receiptsHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          Open drilldown <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryCard
          label="Total Schools"
          value={`${data.schoolsCount}`}
          hint={`with instalments due in ${windowLabel}`}
          testId="receipt-schools"
        />
        <SummaryCard
          label="Total Due"
          value={formatRs(data.totalDue, { compact: true })}
          hint={`in ${windowLabel}`}
          testId="receipt-total-due"
        />
        <SummaryCard
          label="Received"
          value={formatRs(data.received, { compact: true })}
          hint={`logged in ${windowLabel}`}
          testId="receipt-received"
          valueClass="text-signal-ok"
        />
        <SummaryCard
          label="Pending"
          value={formatRs(data.pending, { compact: true })}
          hint="Total Due minus Received"
          testId="receipt-pending"
          valueClass="text-amber-600"
        />
      </div>
      {data.excessAmount > 0 && (
        <div
          data-testid="receipt-excess-warning"
          className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Receipts exceed dues by{' '}
            <strong>{formatRs(data.excessAmount, { compact: true })}</strong>.
            Excess sits as a credit; surface in the drilldown.
          </span>
        </div>
      )}
    </section>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  testId,
  valueClass,
}: {
  label: string
  value: string
  hint: string
  testId: string
  valueClass?: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-md border border-border bg-white p-3"
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div
        className={`mt-1 font-heading text-xl font-bold ${valueClass ?? 'text-brand-navy'}`}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>
    </div>
  )
}
