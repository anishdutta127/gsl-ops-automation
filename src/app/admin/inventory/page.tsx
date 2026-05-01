/*
 * /admin/inventory (W4-G.6 list view; W4-I.5 P4C5.5 design-system pass).
 *
 * Server Component. Lists every InventoryItem with category +
 * status filters. Visual indicators (rendered through StatusChip):
 *   - currentStock <= reorderThreshold (when threshold set) -> 'Low' chip
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
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'

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
  tone: StatusChipTone | null
} {
  if (!item.active) return { label: 'Sunset', tone: 'neutral' }
  if (item.currentStock === 0) return { label: 'Out', tone: 'alert' }
  if (
    item.reorderThreshold !== null
    && item.currentStock <= item.reorderThreshold
  ) {
    return { label: 'Low', tone: 'attention' }
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

  const inputClass = 'mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Inventory"
          subtitle={`${items.length} SKUs on file. Stock decrements automatically on every dispatch raise / approval.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Inventory' },
          ]}
        />
        <div className="mx-auto max-w-screen-lg space-y-4 px-4 py-6">
          <form
            method="GET"
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
          >
            <div>
              <label htmlFor="filter-category" className="block text-xs font-medium text-brand-navy">
                Category
              </label>
              <select
                id="filter-category"
                name="category"
                defaultValue={category}
                className={inputClass}
              >
                <option value="all">All</option>
                <option value="TinkRworks">TinkRworks</option>
                <option value="Cretile">Cretile</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" className="block text-xs font-medium text-brand-navy">
                Status
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={status}
                className={inputClass}
              >
                <option value="active">Active only</option>
                <option value="sunset">Sunset only</option>
                <option value="all">All</option>
              </select>
            </div>
            <button type="submit" className={opsButtonClass({ variant: 'primary', size: 'md' })}>
              Apply
            </button>
          </form>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-border bg-card">
              <EmptyState
                title="No inventory items match the current filters."
                description="Try Active + All categories, or clear the filters."
              />
            </div>
          ) : (
            <ul className="rounded-md border border-border bg-card">
              {filtered.map((it) => {
                const itStatus = statusOf(it)
                const dim = !it.active
                return (
                  <li
                    key={it.id}
                    data-testid={`inventory-row-${it.id}`}
                    className={
                      'flex items-stretch border-b border-border last:border-b-0 '
                      + (dim ? 'bg-muted/40 text-muted-foreground' : '')
                    }
                  >
                    <div className="flex-1 px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className={'font-medium ' + (dim ? 'text-muted-foreground' : 'text-brand-navy')}>
                          {it.skuName}
                          {it.cretileGrade !== null ? ` · Grade ${it.cretileGrade}` : ''}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {it.category}
                        </span>
                        {itStatus.label !== null && itStatus.tone !== null ? (
                          <StatusChip
                            tone={itStatus.tone}
                            label={itStatus.label}
                            withDot={false}
                            testId={`inventory-status-${it.id}`}
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Stock: <span className="font-mono">{it.currentStock}</span>
                        {' · Threshold: '}
                        <span className="font-mono">
                          {it.reorderThreshold === null ? 'not set' : it.reorderThreshold}
                        </span>
                        {' · Updated '}
                        {it.lastUpdatedAt.slice(0, 10)} by {it.lastUpdatedBy}
                      </p>
                    </div>
                    <Link
                      href={`/admin/inventory/${encodeURIComponent(it.id)}`}
                      className="flex min-h-11 items-center px-4 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      {canEdit ? 'Edit' : 'View'}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
