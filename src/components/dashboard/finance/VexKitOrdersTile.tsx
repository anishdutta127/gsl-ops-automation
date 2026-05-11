/*
 * VexKitOrdersTile (Gate 4.95 Session 2, Row 5 of /dashboard/finance).
 *
 * Window-scoped roll-up of VEX kit PI + dispatch activity. VEX is a
 * parallel ledger (vex_pis.json + vex_dispatches.json), distinct from
 * the MOU/Payment programme flow.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type { VexKitOrdersData } from '@/lib/dashboard/financeDashboardData'

interface Props {
  data: VexKitOrdersData
  windowLabel: string
}

export function VexKitOrdersTile({ data, windowLabel }: Props) {
  return (
    <section
      data-testid="vex-kit-orders-tile"
      aria-labelledby="vex-kit-orders-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="vex-kit-orders-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          VEX kit orders
        </h2>
        <Link
          href="/operations/vex"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          Open VEX <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <VexCard
          label="VEX schools"
          value={`${data.vexSchools}`}
          hint={`${data.piCount} PIs in ${windowLabel}`}
          testId="vex-schools"
        />
        <VexCard
          label="Total Pipeline"
          value={formatRs(data.totalPipeline, { compact: true })}
          hint="sum of all VEX PI values"
          testId="vex-pipeline"
        />
        <VexCard
          label="Pending to dispatch"
          value={`${data.pendingDispatch}`}
          hint="payment received, kits not dispatched"
          testId="vex-pending-dispatch"
          valueClass="text-amber-600"
        />
        <VexCard
          label="Sales invoice amount"
          value={formatRs(data.salesInvoiceAmount, { compact: true })}
          hint="Invoiced and Shipped"
          testId="vex-sales-invoice"
          valueClass="text-signal-ok"
        />
      </div>
    </section>
  )
}

function VexCard({
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
