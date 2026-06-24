/*
 * /admin/products (Phase 1.4): admin-managed product registry.
 *
 * Add / rename / retire products in-app with no code change. Validation that an
 * MOU's programme matches a product lives in src/lib/products/resolveProduct.ts
 * (the mous.programme CHECK was dropped in migration 014). Admin-gated
 * (canManageUsers); every mutation is audited on the product's auditLog.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { productRepo } from '@/lib/db/repos/product'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  'missing-name': 'Product name is required.',
  'duplicate-name': 'A product with this name already exists.',
  'not-found': 'Product not found.',
  'invalid-action': 'Unknown action.',
}

const INPUT =
  'min-h-11 rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy'

export default async function ProductsAdminPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fproducts')
  if (!canManageUsers(user)) notFound()

  const products = await productRepo.findAll()
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMsg = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null
  const okKey = typeof sp.ok === 'string' ? sp.ok : null

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Products"
          subtitle="The product registry (finance taxonomy). Add, rename or retire products; no code change needed. New MOUs pick from the active products."
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Products' }]}
        />
        <div className="mx-auto flex max-w-screen-lg flex-col gap-5 px-4 py-6 sm:px-6">
          {errorMsg ? (
            <p role="alert" className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert">
              {errorMsg}
            </p>
          ) : null}
          {okKey ? (
            <p className="rounded-md border border-signal-ok/40 bg-card p-3 text-sm text-signal-ok">
              {okKey === 'created' ? 'Product added.' : okKey === 'renamed' ? 'Product renamed.' : okKey === 'retired' ? 'Product retired.' : okKey === 'reactivated' ? 'Product reactivated.' : 'Done.'}
            </p>
          ) : null}

          <form action="/api/admin/products" method="POST" className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-4">
            <div className="flex flex-col">
              <label htmlFor="name" className="mb-1 text-sm font-medium text-brand-navy">Add a product</label>
              <input id="name" name="name" type="text" required placeholder="e.g., AIQ Advanced" className={INPUT} />
            </div>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
              Add product
            </button>
          </form>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Legacy programmes</th>
                  <th className="px-3 py-2 font-medium">Rename</th>
                  <th className="px-3 py-2 font-medium" aria-label="retire" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium text-brand-navy">{p.name}</td>
                    <td className="px-3 py-2">
                      <StatusChip tone={p.active ? 'ok' : 'neutral'} label={p.active ? 'Active' : 'Retired'} withDot={false} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.legacyProgrammes.length ? p.legacyProgrammes.join(', ') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <form action={`/api/admin/products/${encodeURIComponent(p.id)}/edit`} method="POST" className="flex items-center gap-2">
                        <input type="hidden" name="action" value="rename" />
                        <label htmlFor={`rename-${p.id}`} className="sr-only">Rename {p.name}</label>
                        <input id={`rename-${p.id}`} name="name" type="text" defaultValue={p.name} className={INPUT + ' w-44'} />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={`/api/admin/products/${encodeURIComponent(p.id)}/edit`} method="POST">
                        <input type="hidden" name="action" value={p.active ? 'retire' : 'reactivate'} />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
                          {p.active ? 'Retire' : 'Reactivate'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Retiring a product keeps it (and any MOUs that use it) intact; it just stops appearing for new MOUs.
            Legacy programmes map historical MOU values onto a product and are not edited here.
          </p>
          <Link href="/admin" className="text-sm text-brand-navy hover:underline">Back to Admin</Link>
        </div>
      </main>
    </>
  )
}
