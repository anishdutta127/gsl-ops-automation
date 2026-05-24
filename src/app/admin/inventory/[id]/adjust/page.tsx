/*
 * /admin/inventory/[id]/adjust (Gate 5A.6 Step 11).
 *
 * Separate stock-adjustment surface; direct currentStock edits are
 * forbidden once an InventoryItem exists. Operator enters a signed
 * qtyDelta + reason (>=10 chars); the audit entry records the
 * before / after stock and the reason.
 *
 * Permission: canManageInventory (Finance + Admin wildcard).
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageInventory } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Adjusting inventory requires the Finance role.',
  'invalid-delta': 'Quantity delta must be a non-zero integer.',
  'short-reason': 'Reason must be at least 10 characters.',
  'negative-stock': 'Adjustment would take stock below zero.',
  'item-not-found': 'Inventory item not found.',
  'queue-failure': 'Failed to queue the adjustment. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function AdjustInventoryPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/admin/inventory/${id}/adjust`)}`)
  }
  if (!canManageInventory(user)) notFound()
  const allItems = await inventoryItemRepo.findAll()
  const item = allItems.find((i) => i.id === id)
  if (!item) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title={`Adjust stock {'·'} ${item.skuName}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Inventory', href: '/admin/inventory' },
            { label: item.id, href: `/admin/inventory/${encodeURIComponent(item.id)}` },
            { label: 'Adjust' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={item.id}
            subtitle={`${item.skuName}${item.cretileGrade !== null ? ` · Grade ${item.cretileGrade}` : ''}`}
            metadata={[
              { label: 'Category', value: item.category },
              { label: 'Current stock', value: String(item.currentStock) },
              {
                label: 'Threshold',
                value: item.reorderThreshold === null ? 'not set' : String(item.reorderThreshold),
              },
              { label: 'Status', value: item.active ? 'Active' : 'Sunset' },
            ]}
          />

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form
            action={`/api/inventory/${encodeURIComponent(item.id)}/adjust`}
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <label htmlFor="qtyDelta" className={FIELD_LABEL_CLASS}>
                Quantity delta (signed integer)
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="qtyDelta"
                name="qtyDelta"
                type="number"
                step="1"
                required
                placeholder="e.g., -3 (cycle count loss) or 25 (vendor delivery)"
                className={FIELD_INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use a negative number to decrement (cycle-count loss, damage) and a positive number to increment (new delivery, return).
              </p>
            </div>

            <div>
              <label htmlFor="reason" className={FIELD_LABEL_CLASS}>
                Reason
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={3}
                required
                minLength={10}
                placeholder="Must be at least 10 characters. Describe why this adjustment is needed."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Apply adjustment
              </button>
              <Link
                href={`/admin/inventory/${encodeURIComponent(item.id)}`}
                className={opsButtonClass({ variant: 'outline', size: 'md' })}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
