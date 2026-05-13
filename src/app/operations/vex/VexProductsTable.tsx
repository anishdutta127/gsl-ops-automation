/*
 * VEX SKU master table. 28 products; Phase 1 is read-only.
 *
 * Mobile 375px: wraps in overflow-x-auto so the table can scroll
 * horizontally rather than collapse fields. Operators on phones
 * mostly read this table during dispatch prep so horizontal scroll
 * preserves the "all columns visible per row" semantic.
 */

import Link from 'next/link'
import type { VexProduct } from '@/lib/mouSystem/types'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'

export function VexProductsTable({
  products,
  canEdit = false,
}: {
  products: VexProduct[]
  canEdit?: boolean
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        title="No VEX products yet"
        description="The 28-SKU master will appear here once seeded."
      />
    )
  }
  const sorted = products
    .slice()
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Part number</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium text-right">Default price</th>
            <th className="px-3 py-2 font-medium">Active</th>
            {canEdit ? <th className="px-3 py-2 font-medium" aria-label="actions" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((p) => (
            <tr key={p.partNumber}>
              <td className="px-3 py-2 font-mono text-xs text-foreground">
                {p.partNumber}
              </td>
              <td className="px-3 py-2 text-foreground">{p.name}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {p.defaultUnitPrice === null
                  ? <span className="text-muted-foreground">set per PI</span>
                  : `Rs ${p.defaultUnitPrice.toLocaleString('en-IN')}`}
              </td>
              <td className="px-3 py-2">
                <StatusChip
                  tone={p.active ? 'ok' : 'neutral'}
                  label={p.active ? 'Active' : 'Retired'}
                  withDot={false}
                />
              </td>
              {canEdit ? (
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/operations/vex/products/${encodeURIComponent(p.partNumber)}/edit`}
                    className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    data-testid={`vex-product-edit-${p.partNumber}`}
                  >
                    Edit
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
