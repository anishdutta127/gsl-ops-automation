/*
 * /operations/vex/products/new (Gate 5A.6 Step 11).
 *
 * VEX product master create form. partNumber is immutable for audit
 * continuity (Phase 1 audit-trail requirement); uniqueness is
 * validated against existing vex_products.json at submit time.
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
  permission: 'Creating a VEX product requires the Finance role.',
  'unknown-user': 'Session expired. Please sign in again.',
  'missing-part-number': 'Part number is required.',
  'missing-name': 'Product name is required.',
  'duplicate-part-number': 'A VEX product with this part number already exists.',
  'invalid-price': 'Default unit price must be a number, or empty.',
  'queue-failure': 'Failed to queue the create. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function NewVexProductPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fvex%2Fproducts%2Fnew')
  if (!canManageInventory(user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="New VEX product"
          subtitle="Add a VEX SKU to the 28-product master. Part numbers are immutable; pick the canonical VEX reference before saving."
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX', href: '/operations/vex' },
            { label: 'New product' },
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
            action="/api/operations/vex/products"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <label htmlFor="partNumber" className={FIELD_LABEL_CLASS}>
                Part number
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="partNumber"
                name="partNumber"
                type="text"
                required
                placeholder="e.g., 228-7396"
                className={FIELD_INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Immutable once saved. Used as the canonical SKU id everywhere downstream.
              </p>
            </div>

            <div>
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>
                Product name
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g., VEX IQ Education Kit 2nd Generation"
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="defaultUnitPrice" className={FIELD_LABEL_CLASS}>
                Default unit price (Rs, optional)
              </label>
              <input
                id="defaultUnitPrice"
                name="defaultUnitPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="Leave blank to set per PI"
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
                Create VEX product
              </button>
              <Link
                href="/operations/vex"
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
