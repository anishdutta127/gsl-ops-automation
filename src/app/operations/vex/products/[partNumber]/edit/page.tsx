/*
 * /operations/vex/products/[partNumber]/edit (Gate 5A.6 Step 11).
 *
 * Edit name / defaultUnitPrice / active. partNumber stays immutable
 * (audit-trail continuity).
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
import type { VexProduct } from '@/lib/types'
import vexProductsJson from '@/data/vex_products.json'

const allVexProducts = vexProductsJson as unknown as VexProduct[]

interface PageProps {
  params: Promise<{ partNumber: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Editing a VEX product requires the Finance role.',
  'missing-name': 'Product name is required.',
  'invalid-price': 'Default unit price must be a number, or empty.',
  'product-not-found': 'VEX product not found.',
  'queue-failure': 'Failed to queue the edit. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function EditVexProductPage({ params, searchParams }: PageProps) {
  const { partNumber } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/operations/vex/products/${partNumber}/edit`)}`,
    )
  }
  if (!canManageInventory(user)) notFound()

  const product = allVexProducts.find(
    (p) => p.partNumber === decodeURIComponent(partNumber),
  )
  if (!product) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={`Edit ${product.partNumber}`}
          subtitle={product.name}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX', href: '/operations/vex' },
            { label: 'Edit product' },
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
            action={`/api/operations/vex/products/${encodeURIComponent(product.partNumber)}/edit`}
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <label className={FIELD_LABEL_CLASS}>Part number</label>
              <p className="font-mono text-sm text-foreground">{product.partNumber}</p>
              <p className="mt-1 text-xs text-muted-foreground">Immutable.</p>
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
                defaultValue={product.name}
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
                defaultValue={product.defaultUnitPrice ?? ''}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  value="true"
                  defaultChecked={product.active}
                  className="size-4 rounded border-input"
                />
                <span className="text-foreground">Active SKU</span>
              </label>
              <input type="hidden" name="active-submitted" value="1" />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Save changes
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
