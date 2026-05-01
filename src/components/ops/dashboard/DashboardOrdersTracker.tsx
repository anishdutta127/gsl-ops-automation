/*
 * DashboardOrdersTracker (W4-I.5 Phase 2 commit 3).
 *
 * Orders and Shipment Tracker table. 6 rows by default. Columns:
 * Order ID | School | Product | Order Status | Shipment | Expected | Action.
 *
 * Status chips colour-coded per the reference layout:
 *   Order Status: order-raised = blue, delivered = green
 *   Shipment:    packed = grey, shipped = purple, delivered = green,
 *                delayed = red
 *
 * StatusChip primitive is inlined locally; the DashboardRecentMous
 * version covers a different status enum (MOU.status) and the two
 * are intentionally not yet shared. Phase 4 unification when 3+
 * surfaces want the same chip.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  OrderStatusKind,
  OrdersRow,
  ShipmentStatusKind,
} from '@/lib/dashboard/dashboardData'

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface ChipStyle {
  className: string
  dotClass: string
  label: string
}

const ORDER_STATUS_STYLE: Record<OrderStatusKind, ChipStyle> = {
  'order-raised': {
    className: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
    dotClass: 'bg-brand-navy',
    label: 'Order Raised',
  },
  packed: {
    className: 'bg-signal-neutral/15 text-signal-neutral border-signal-neutral/30',
    dotClass: 'bg-signal-neutral',
    label: 'Packed',
  },
  shipped: {
    className: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
    dotClass: 'bg-brand-navy',
    label: 'Shipped',
  },
  delivered: {
    className: 'bg-signal-ok/15 text-signal-ok border-signal-ok/30',
    dotClass: 'bg-signal-ok',
    label: 'Delivered',
  },
}

const SHIPMENT_STATUS_STYLE: Record<ShipmentStatusKind, ChipStyle> = {
  packed: {
    className: 'bg-signal-neutral/15 text-signal-neutral border-signal-neutral/30',
    dotClass: 'bg-signal-neutral',
    label: 'Packed',
  },
  shipped: {
    // Reference uses a purple-ish "Shipped" chip; we map to brand-teal
    // since purple is not in the GSL palette.
    className: 'bg-brand-teal/15 text-brand-navy border-brand-teal/30',
    dotClass: 'bg-brand-teal',
    label: 'Shipped',
  },
  delivered: {
    className: 'bg-signal-ok/15 text-signal-ok border-signal-ok/30',
    dotClass: 'bg-signal-ok',
    label: 'Delivered',
  },
  delayed: {
    className: 'bg-signal-alert/15 text-signal-alert border-signal-alert/30',
    dotClass: 'bg-signal-alert',
    label: 'Delayed',
  },
}

function Chip({ style, testId }: { style: ChipStyle; testId: string }): ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.className}`}
      data-testid={testId}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dotClass}`} />
      {style.label}
    </span>
  )
}

export interface DashboardOrdersTrackerProps {
  rows: OrdersRow[]
  totalCount: number
  viewAllHref?: string
}

export function DashboardOrdersTracker({
  rows,
  totalCount,
  viewAllHref = '/admin/dispatch-requests',
}: DashboardOrdersTrackerProps) {
  return (
    <section
      aria-labelledby="orders-tracker-heading"
      data-testid="dashboard-orders-tracker"
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="orders-tracker-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Orders and Shipment Tracker
          </h2>
          <p className="text-xs text-muted-foreground">
            Live dispatch state across active schools.
          </p>
        </div>
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="orders-tracker-view-all"
        >
          View all
          <ArrowRight aria-hidden className="size-3" />
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No dispatches match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Orders and shipment tracker</caption>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Order ID</th>
                <th scope="col" className="px-4 py-2 font-semibold">School</th>
                <th scope="col" className="px-4 py-2 font-semibold">Product</th>
                <th scope="col" className="px-4 py-2 font-semibold">Order Status</th>
                <th scope="col" className="px-4 py-2 font-semibold">Shipment</th>
                <th scope="col" className="px-4 py-2 font-semibold">Expected</th>
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.dispatchId}
                  className="hover:bg-muted/40 focus-within:bg-muted/40"
                  data-testid={`orders-row-${r.dispatchId}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground sm:px-5">{r.dispatchId}</td>
                  <td className="px-4 py-3 text-foreground">{r.schoolName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.product}</td>
                  <td className="px-4 py-3">
                    <Chip
                      style={ORDER_STATUS_STYLE[r.orderStatus]}
                      testId={`order-status-${r.orderStatus}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Chip
                      style={SHIPMENT_STATUS_STYLE[r.shipmentStatus]}
                      testId={`shipment-status-${r.shipmentStatus}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {r.expectedDate ? DATE_FMT.format(new Date(r.expectedDate)) : '-'}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <Link
                      href={r.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      data-testid={`orders-track-${r.dispatchId}`}
                    >
                      Track
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
