/*
 * Dispatch tracker. One row per VexDispatch; links back to the
 * parent VEX PI detail page. Phase 1 read-mostly: the inline
 * status-flip + supporting-doc upload + warehouse email live on
 * the PI detail page where the gate context is visible.
 */

import Link from 'next/link'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'
import { formatRs, formatDate } from '@/lib/format'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'

const STATUS_TONE: Record<string, StatusChipTone> = {
  Requested: 'attention',
  'Request Raised to Warehouse': 'navy',
  Invoiced: 'navy',
  Shipped: 'ok',
}

export function VexDispatchesTable({
  dispatches,
  pis,
}: {
  dispatches: VexDispatch[]
  pis: VexPi[]
}) {
  if (dispatches.length === 0) {
    return (
      <EmptyState
        title="No dispatches yet"
        description="Dispatches appear here once raised from a VEX PI detail page."
      />
    )
  }
  const piById = new Map(pis.map((p) => [p.id, p]))
  const sorted = dispatches
    .slice()
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Dispatch</th>
            <th className="px-3 py-2 font-medium">PI</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 font-medium tabular-nums text-right">
              Freight
            </th>
            <th className="px-3 py-2 font-medium">Items</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Tax invoice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((d) => {
            const pi = piById.get(d.piId)
            return (
              <tr key={d.id}>
                <td className="px-3 py-2 font-mono text-xs text-foreground">
                  {d.id}
                  <span className="block text-[11px] text-muted-foreground">
                    {formatDate(d.requestedAt.slice(0, 10))}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {pi ? (
                    <Link
                      href={`/operations/vex/pi/${pi.id}`}
                      className="text-brand-navy hover:underline"
                    >
                      {pi.piNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{d.piId}</span>
                  )}
                  {pi ? (
                    <span className="block text-[11px] text-muted-foreground">
                      {pi.schoolName}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs">{d.mode}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatRs(d.freight)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {d.items.map((i) => `${i.partNumber}: ${i.qty}`).join(' / ')}
                </td>
                <td className="px-3 py-2">
                  <StatusChip
                    tone={STATUS_TONE[d.status] ?? 'neutral'}
                    label={d.status}
                    withDot={false}
                  />
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.taxInvoicePath ? (
                    <a
                      href={d.taxInvoicePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-navy hover:underline"
                    >
                      {d.taxInvoiceNumber ?? 'PDF'}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      awaiting upload
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
