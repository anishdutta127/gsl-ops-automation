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
import type {
  OrderStatusKind,
  OrdersRow,
  ShipmentStatusKind,
} from '@/lib/dashboard/dashboardData'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const ORDER_STATUS_TONE: Record<OrderStatusKind, { tone: StatusChipTone; label: string }> = {
  'order-raised': { tone: 'navy',    label: 'Order Raised' },
  packed:         { tone: 'neutral', label: 'Packed' },
  shipped:        { tone: 'navy',    label: 'Shipped' },
  delivered:      { tone: 'ok',      label: 'Delivered' },
}

// Reference uses purple for "Shipped"; we map to brand-teal since
// purple is not in the GSL palette.
const SHIPMENT_STATUS_TONE: Record<ShipmentStatusKind, { tone: StatusChipTone; label: string }> = {
  packed:    { tone: 'neutral', label: 'Packed' },
  shipped:   { tone: 'teal',    label: 'Shipped' },
  delivered: { tone: 'ok',      label: 'Delivered' },
  delayed:   { tone: 'alert',   label: 'Delayed' },
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
                    <StatusChip
                      tone={ORDER_STATUS_TONE[r.orderStatus].tone}
                      label={ORDER_STATUS_TONE[r.orderStatus].label}
                      testId={`order-status-${r.orderStatus}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      tone={SHIPMENT_STATUS_TONE[r.shipmentStatus].tone}
                      label={SHIPMENT_STATUS_TONE[r.shipmentStatus].label}
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
