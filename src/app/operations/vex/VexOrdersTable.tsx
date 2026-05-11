'use client'

/*
 * VEX legacy Tally order tracker.
 *
 * 141 records in the imported snapshot. Mobile 375px constraint:
 * paginated 25 rows per page + search-as-you-type filter so the
 * table never spills past a screenful on phones. Status column
 * preserved verbatim from the Tally-imported dispatchStatus enum.
 *
 * Phase 1 read-only: no inline status updates from this surface.
 * The status-flip flow lives on gsl-mou-system today and migrates
 * to a dedicated /operations/vex/orders/[id] page in Phase 1.1 if
 * the team asks for it.
 */

import { useMemo, useState } from 'react'
import type { VexOrder } from '@/lib/mouSystem/types'
import { formatDate, formatRs } from '@/lib/format'
import { EmptyState } from '@/components/ops/EmptyState'

const STATUSES: VexOrder['dispatchStatus'][] = [
  'Proforma Sent',
  'Payment Received',
  'Invoice Generated',
  'Dispatched',
]
const PAGE_SIZE = 25

export function VexOrdersTable({ orders }: { orders: VexOrder[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (status && o.dispatchStatus !== status) return false
      if (!q) return true
      return (
        o.schoolName.toLowerCase().includes(q) ||
        o.voucherNumber.toLowerCase().includes(q) ||
        (o.schoolNameNormalised?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [orders, search, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  )

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No legacy VEX orders"
        description="Tally-imported orders will appear here once seeded."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder="Search by school or voucher"
          aria-label="Search VEX orders"
          className="min-h-10 flex-1 rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(0)
          }}
          aria-label="Filter by status"
          className="min-h-10 rounded-md border border-input bg-card px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No orders match those filters.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">School</th>
                  <th className="px-3 py-2 font-medium">Voucher</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">
                    Total
                  </th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {pageRows.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {formatDate(o.orderDate)}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <span className="block font-medium">{o.schoolName}</span>
                      {o.schoolNameNormalised &&
                        o.schoolNameNormalised !== o.schoolName ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {o.schoolNameNormalised}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {o.voucherNumber}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRs(o.total)}
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">
                      {o.dispatchStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {safePage * PAGE_SIZE + 1}-
              {Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of{' '}
              {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="min-h-8 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums">
                Page {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="min-h-8 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
