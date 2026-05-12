/*
 * VEX PI list. Mirrors gsl-mou-system/src/app/vex/VexPiTable.tsx with
 * the billing-entity grouping behaviour preserved verbatim (Round 3
 * Step 10d): rows are sorted by billing name so sister schools paid
 * by the same entity sit together.
 */

import Link from 'next/link'
import type { VexPi } from '@/lib/mouSystem/types'
import { formatRs, formatDate } from '@/lib/format'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'

const STATUS_TONE: Record<string, StatusChipTone> = {
  Generated: 'attention',
  'Payment Pending': 'attention',
  'Delivery Pending': 'navy',
  'Partially Dispatched': 'navy',
  Completed: 'ok',
}

export function VexPiList({ pis }: { pis: VexPi[] }) {
  if (pis.length === 0) {
    return (
      <EmptyState
        title="No VEX PIs yet"
        description="Use New VEX PI to generate the first one."
      />
    )
  }
  const sorted = pis.slice().sort((a, b) => {
    const aBill = (a.billingName || a.schoolName).toLowerCase()
    const bBill = (b.billingName || b.schoolName).toLowerCase()
    const cmp = aBill.localeCompare(bBill)
    if (cmp !== 0) return cmp
    return b.generatedAt.localeCompare(a.generatedAt)
  })
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">PI no</th>
            <th className="px-3 py-2 font-medium">Bill to / Ship to</th>
            <th className="px-3 py-2 font-medium tabular-nums">Issued</th>
            <th className="px-3 py-2 font-medium tabular-nums text-right">Total</th>
            <th className="px-3 py-2 font-medium tabular-nums text-right">Received</th>
            <th className="px-3 py-2 font-medium tabular-nums text-right">Open</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((p, i) => {
            const open = Math.max(0, p.total - p.paymentReceivedAmount)
            const billLabel = (p.billingName || p.schoolName).trim()
            const shipLabel = (p.schoolName || '').trim()
            const prevBill =
              i > 0
                ? (sorted[i - 1]!.billingName || sorted[i - 1]!.schoolName).trim()
                : null
            const newBillingGroup = i === 0 || prevBill !== billLabel
            return (
              <tr key={p.id}>
                <td className="px-3 py-2 font-mono text-xs text-foreground">
                  {p.piNumber}
                  <span className="block text-[11px] text-muted-foreground">
                    {p.id}
                  </span>
                </td>
                <td className="px-3 py-2 text-foreground">
                  {newBillingGroup ? (
                    <span className="block font-semibold">{billLabel}</span>
                  ) : (
                    <span className="block text-[11px] text-muted-foreground">
                      same bill-to
                    </span>
                  )}
                  {shipLabel && shipLabel !== billLabel ? (
                    <span className="block text-[11px] text-muted-foreground">
                      Ship to: {shipLabel}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                  {formatDate(p.issueDate)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatRs(p.total)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatRs(p.paymentReceivedAmount)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatRs(open)}
                </td>
                <td className="px-3 py-2">
                  <StatusChip
                    tone={STATUS_TONE[p.status] ?? 'neutral'}
                    label={p.status}
                    withDot={false}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/operations/vex/pi/${p.id}`}
                    className="inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
