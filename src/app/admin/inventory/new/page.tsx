/*
 * /admin/inventory/new (Gate 5A.6 Step 11).
 *
 * Create form for a new InventoryItem (SKU master). currentStock is
 * editable at create time; future stock changes must go through
 * /admin/inventory/[id]/adjust to preserve audit integrity.
 *
 * Permission: canManageInventory (Finance + Admin wildcard).
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageInventory } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Creating an inventory item requires the Finance role.',
  'missing-sku-name': 'SKU name is required.',
  'missing-category': 'Pick a category.',
  'invalid-stock': 'Current stock must be a non-negative integer.',
  'invalid-grade': 'Cretile grade must be an integer between 1 and 12, or empty.',
  'invalid-threshold': 'Reorder threshold must be a non-negative integer, or empty.',
  'duplicate-id': 'An inventory item with that SKU id already exists.',
  'queue-failure': 'Failed to queue the create. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function NewInventoryItemPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Finventory%2Fnew')
  if (!canManageInventory(user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New inventory item"
          subtitle="Add a SKU to the inventory master. Stock changes after creation must go through the Adjust stock action."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Inventory', href: '/admin/inventory' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <form
            action="/api/inventory/create"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <label htmlFor="skuName" className={FIELD_LABEL_CLASS}>
                SKU name
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="skuName"
                name="skuName"
                type="text"
                required
                placeholder="e.g., Launchpad"
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="category" className={FIELD_LABEL_CLASS}>
                Category
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <select
                id="category"
                name="category"
                required
                defaultValue=""
                className={FIELD_INPUT_CLASS}
              >
                <option value="" disabled>
                  Pick a category
                </option>
                <option value="TinkRworks">TinkRworks</option>
                <option value="Cretile">Cretile</option>
                <option value="Hardware">Hardware</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="cretileGrade" className={FIELD_LABEL_CLASS}>
                Cretile grade (optional)
              </label>
              <input
                id="cretileGrade"
                name="cretileGrade"
                type="number"
                min="1"
                max="12"
                step="1"
                placeholder="1 to 12 for grade-band Cretile kits; leave empty otherwise"
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="currentStock" className={FIELD_LABEL_CLASS}>
                  Current stock
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </label>
                <input
                  id="currentStock"
                  name="currentStock"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={0}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="reorderThreshold" className={FIELD_LABEL_CLASS}>
                  Reorder threshold (optional)
                </label>
                <input
                  id="reorderThreshold"
                  name="reorderThreshold"
                  type="number"
                  min="0"
                  step="1"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                Notes (optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  value="true"
                  defaultChecked
                  className="size-4 rounded border-input"
                />
                <span className="text-foreground">Active SKU</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Create inventory item
              </button>
              <Link
                href="/admin/inventory"
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
