/*
 * InventoryStatusPanel (W4-G.6).
 *
 * Read-only panel rendered on /mous/[mouId]/dispatch alongside the
 * direct-raise form. Shows current stock per programme-derived SKU
 * so the operator can sanity-check before raising.
 *
 * Phase 1 simplified: surfaces the SKU that raiseDispatch would
 * synthesise from the MOU programme (e.g. 'STEAM kit set'). When
 * the SKU isn't in inventory yet, the panel says so explicitly
 * (the decrement would hard-block; surfacing it here avoids a
 * surprise at submit time).
 *
 * No edit affordance here; admins click through to /admin/inventory
 * to adjust thresholds or counts.
 */

import type { InventoryItem } from '@/lib/types'

interface Props {
  /** Programme + sub-type as shown on the page; matches the SKU
   *  raiseDispatch synthesises (`${programme} kit set`). */
  programme: string
  programmeSubType: string | null
  inventoryItems: InventoryItem[]
}

function expectedSkuName(programme: string, subType: string | null): string {
  const subtypePart = subType ? ` (${subType})` : ''
  return `${programme}${subtypePart} kit set`
}

function statusOf(item: InventoryItem): {
  label: 'Out' | 'Low' | 'Sunset' | 'OK'
  tone: 'alert' | 'warn' | 'muted' | 'ok'
} {
  if (!item.active) return { label: 'Sunset', tone: 'muted' }
  if (item.currentStock === 0) return { label: 'Out', tone: 'alert' }
  if (
    item.reorderThreshold !== null
    && item.currentStock <= item.reorderThreshold
  ) {
    return { label: 'Low', tone: 'warn' }
  }
  return { label: 'OK', tone: 'ok' }
}

export function InventoryStatusPanel({
  programme,
  programmeSubType,
  inventoryItems,
}: Props) {
  const expectedSku = expectedSkuName(programme, programmeSubType)
  const match = inventoryItems.find((it) => it.skuName === expectedSku)

  return (
    <section
      aria-labelledby="inventory-status-heading"
      data-testid="inventory-status-panel"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h3
        id="inventory-status-heading"
        className="mb-3 font-heading text-base font-semibold text-brand-navy"
      >
        Inventory status
      </h3>
      {match ? (
        <InventoryRow item={match} />
      ) : (
        <p
          data-testid="inventory-status-missing"
          className="text-sm text-signal-alert"
        >
          No inventory record for SKU &lsquo;{expectedSku}&rsquo;. The dispatch
          decrement will fail until an admin adds it via{' '}
          <a className="underline" href="/admin/inventory">
            /admin/inventory
          </a>
          .
        </p>
      )}
    </section>
  )
}

function InventoryRow({ item }: { item: InventoryItem }) {
  const status = statusOf(item)
  const thresholdText = item.reorderThreshold === null
    ? 'threshold not set'
    : `threshold ${item.reorderThreshold}`
  const stockText = `${item.currentStock} unit${item.currentStock === 1 ? '' : 's'} available`
  return (
    <div
      data-testid={`inventory-status-row-${item.id}`}
      className="flex flex-wrap items-baseline gap-2 text-sm"
    >
      <span className="font-medium text-brand-navy">{item.skuName}:</span>
      <span>{stockText}</span>
      <span className="text-muted-foreground">({thresholdText})</span>
      {status.label !== 'OK' ? (
        <span
          className={
            status.tone === 'alert'
              ? 'rounded border border-red-300 bg-red-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-800'
              : status.tone === 'warn'
                ? 'rounded border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900'
                : 'rounded border border-slate-300 bg-slate-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700'
          }
        >
          {status.label}
        </span>
      ) : null}
    </div>
  )
}
