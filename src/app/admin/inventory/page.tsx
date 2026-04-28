/*
 * /admin/inventory (W4-G.6 list view).
 *
 * Server Component. Lists every InventoryItem with category +
 * status filters. Visual indicators:
 *   - currentStock <= reorderThreshold (when threshold set) -> red dot
 *     + 'Low' chip
 *   - currentStock === 0 (any active SKU)                   -> 'Out' chip
 *   - active === false                                       -> 'Sunset' chip
 *
 * Edit link visible per inventory:edit (OpsHead + Admin); read-only
 * roles see the row but no Edit link.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { InventoryCategory, InventoryItem } from '@/lib/types'
import inventoryItemsJson from '@/data/inventory_items.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'

const items = inventoryItemsJson as unknown as InventoryItem[]

const CATEGORY_VALUES: ReadonlyArray<'all' | InventoryCategory> = [
  'all', 'TinkRworks', 'Cretile', 'Other',
]

const STATUS_VALUES = ['all', 'active', 'sunset'] as const
type StatusFilter = typeof STATUS_VALUES[number]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function statusOf(item: InventoryItem): {
  label: 'Out' | 'Low' | 'Sunset' | null
  tone: 'alert' | 'warn' | 'muted' | null
} {
  if (!item.active) return { label: 'Sunset', tone: 'muted' }
  if (item.currentStock === 0) return { label: 'Out', tone: 'alert' }
  if (
    item.reorderThreshold !== null
    && item.currentStock <= item.reorderThreshold
  ) {
    return { label: 'Low', tone: 'warn' }
  }
  return { label: null, tone: null }
}

export default async function InventoryListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Finventory')

  const canEdit = canPerform(user, 'inventory:edit')

  const categoryParam = typeof sp.category === 'string' ? sp.category : 'all'
  const statusParam = typeof sp.status === 'string' ? sp.status : 'active'
  const category = CATEGORY_VALUES.includes(
    categoryParam as 'all' | InventoryCategory,
  ) ? (categoryParam as 'all' | InventoryCategory) : 'all'
  const status: StatusFilter = STATUS_VALUES.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : 'active'

  const filtered = items.filter((it) => {
    if (category !== 'all' && it.category !== category) return false
    if (status === 'active' && !it.active) return false
    if (status === 'sunset' && it.active) return false
    return true
  }).slice().sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    if (a.cretileGrade !== null && b.cretileGrade !== null) {
      return a.cretileGrade - b.cretileGrade
    }
    return a.skuName.localeCompare(b.skuName)
  })

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-4">
        <p className="mb-1 text-xs">
          <Link
            href="/admin"
            className="text-[var(--brand-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          >
            Back to Admin
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Inventory</h1>
        <p className="mt-1 text-sm text-slate-700">
          {items.length} SKU(s) on file. Stock decrements automatically on every
          dispatch raise / approval. Edit thresholds + cycle counts here.
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
        <div>
          <label htmlFor="filter-category" className="block text-xs font-medium text-[var(--brand-navy)]">
            Category
          </label>
          <select
            id="filter-category"
            name="category"
            defaultValue={category}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            <option value="all">All</option>
            <option value="TinkRworks">TinkRworks</option>
            <option value="Cretile">Cretile</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className="block text-xs font-medium text-[var(--brand-navy)]">
            Status
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={status}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            <option value="active">Active only</option>
            <option value="sunset">Sunset only</option>
            <option value="all">All</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
        >
          Apply
        </button>
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No inventory items match the current filters.
        </p>
      ) : (
        <ul className="rounded-md border border-slate-200 bg-white">
          {filtered.map((it) => {
            const status = statusOf(it)
            const dim = !it.active
            return (
              <li
                key={it.id}
                data-testid={`inventory-row-${it.id}`}
                className={
                  'flex items-stretch border-b border-slate-200 last:border-b-0 '
                  + (dim ? 'bg-slate-50 text-slate-600' : '')
                }
              >
                <div className="flex-1 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={'font-medium ' + (dim ? 'text-slate-700' : 'text-[var(--brand-navy)]')}>
                      {it.skuName}
                      {it.cretileGrade !== null ? ` · Grade ${it.cretileGrade}` : ''}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {it.category}
                    </span>
                    {status.label !== null ? (
                      <span
                        data-testid={`inventory-status-${it.id}`}
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
                  <p className="mt-1 text-xs text-slate-600">
                    Stock: <span className="font-mono">{it.currentStock}</span>
                    {' · Threshold: '}
                    <span className="font-mono">
                      {it.reorderThreshold === null ? 'not set' : it.reorderThreshold}
                    </span>
                    {' · Updated '}
                    {it.lastUpdatedAt.slice(0, 10)} by {it.lastUpdatedBy}
                  </p>
                </div>
                {canEdit ? (
                  <Link
                    href={`/admin/inventory/${encodeURIComponent(it.id)}`}
                    className="flex items-center px-4 text-xs font-medium text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
                  >
                    Edit
                  </Link>
                ) : (
                  <Link
                    href={`/admin/inventory/${encodeURIComponent(it.id)}`}
                    className="flex items-center px-4 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
                  >
                    View
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
