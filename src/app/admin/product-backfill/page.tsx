/*
 * /admin/product-backfill (Phase 6F Part 3).
 *
 * Bulk-edit surface for productSelection on MOUs that landed with
 * the field unset. 161 MOUs at the Phase 6E backfill complement;
 * Pranav / Anish (canEditMOU) work through them grouped by school.
 *
 * Per row:
 *   - School name (header), MOU id (link to detail)
 *   - Programme chip
 *   - Dispatch evidence chip (if dispatch lineItems map to a
 *     Cretile / TinkRworks / Both classification, the dropdown
 *     defaults to that value so the operator confirms rather than
 *     types)
 *   - Product dropdown: TinkRworks / Cretile / Both / leave unset
 *
 * Bulk submit posts to /api/admin/product-backfill, which enqueues
 * one mou.update per non-default row with an audit entry tagged
 * action='product-selection-bulk-update'.
 *
 * Permission: canEditMOU. Pranav (Finance) can VIEW but cannot save;
 * Layer 2 (canPerform on the API) enforces the EDIT gate.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Dispatch, MOU } from '@/lib/types'
import type { ProductSelection } from '@/lib/mouSystem/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const inventory = inventoryItemsJson as Array<{ skuName: string; category: string; active: boolean }>

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Saving requires the canEditMOU permission. View is allowed.',
  'no-changes': 'No changes to save. Pick a product on at least one row.',
  'save-failed': 'Save failed. The queue did not accept all updates; check /admin/sync-queue.',
}

const SUCCESS_COPY: Record<string, string> = {
  saved: 'Saved. The updates will appear after the next sync.',
}

function buildSkuCategoryMap() {
  const map = new Map<string, 'Cretile' | 'TinkRworks' | 'Other'>()
  for (const i of inventory) {
    if (i.category === 'Cretile' || i.category === 'TinkRworks' || i.category === 'Other') {
      map.set(i.skuName, i.category)
    }
  }
  return map
}

function inferProductFromDispatches(
  mouId: string,
  dispatches: Dispatch[],
  skuMap: Map<string, 'Cretile' | 'TinkRworks' | 'Other'>,
): ProductSelection | null {
  let hasCretile = false
  let hasTinkR = false
  for (const d of dispatches) {
    if (d.mouId !== mouId) continue
    for (const li of d.lineItems ?? []) {
      const cat = skuMap.get(li.skuName ?? '')
      if (cat === 'Cretile') hasCretile = true
      else if (cat === 'TinkRworks') hasTinkR = true
    }
  }
  if (hasCretile && hasTinkR) return 'Both'
  if (hasCretile) return 'Cretile'
  if (hasTinkR) return 'TinkRworks'
  return null
}

export default async function ProductBackfillPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fproduct-backfill')

  const sp = (await searchParams) ?? {}
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const successKey = typeof sp.saved === 'string' ? 'saved' : null
  const canSave = canEditMOU(user)

  const targets = allMous.filter(
    (m) => m.productSelection === null || m.productSelection === undefined,
  )

  const skuMap = buildSkuCategoryMap()
  const rows = targets.map((m) => ({
    mouId: m.id,
    schoolId: m.schoolId,
    schoolName: m.schoolName,
    programme: m.programme,
    inferred: inferProductFromDispatches(m.id, allDispatches, skuMap),
  }))

  // Group by school for the operator's reading order.
  const bySchool = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.schoolName
    const list = bySchool.get(key) ?? []
    list.push(row)
    bySchool.set(key, list)
  }
  const grouped = Array.from(bySchool.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'en'),
  )

  const totalCount = rows.length
  const withEvidenceCount = rows.filter((r) => r.inferred !== null).length

  return (
    <>
      <TopNav currentPath="/admin/product-backfill" />
      <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6" data-testid="product-backfill-root">
        <PageHeader
          title="MOU product backfill"
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'Product backfill' },
          ]}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3" data-testid="product-backfill-total">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">MOUs missing product</p>
            <p className="text-2xl font-bold text-brand-navy">{totalCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3" data-testid="product-backfill-evidence">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">With dispatch evidence</p>
            <p className="text-2xl font-bold text-brand-navy">{withEvidenceCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3" data-testid="product-backfill-permission">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Permission</p>
            <p className="text-sm font-medium text-brand-navy">
              {canSave ? 'You can save' : 'View-only (canEditMOU required)'}
            </p>
          </div>
        </div>

        {errorKey && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            data-testid="product-backfill-error"
          >
            {ERROR_COPY[errorKey] ?? `Failed: ${errorKey}`}
          </p>
        )}
        {successKey && (
          <p
            role="status"
            className="mt-3 rounded-md border border-brand-teal bg-brand-teal/10 p-3 text-sm text-brand-navy"
            data-testid="product-backfill-success"
          >
            {SUCCESS_COPY[successKey]}
          </p>
        )}

        {totalCount === 0 ? (
          <p className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm text-slate-700">
            Every MOU has productSelection set. Nothing to backfill.
          </p>
        ) : (
          <form action="/api/admin/product-backfill" method="POST" className="mt-6 flex flex-col gap-4">
            {grouped.map(([schoolName, schoolRows]) => (
              <section
                key={schoolName}
                className="rounded-lg border border-border bg-card p-4"
                data-testid={`product-backfill-school-${schoolRows[0]!.schoolId}`}
              >
                <h2 className="mb-2 font-heading text-sm font-semibold text-brand-navy">
                  {schoolName}
                </h2>
                <div className="flex flex-col gap-2">
                  {schoolRows.map((row) => (
                    <div
                      key={row.mouId}
                      className="grid grid-cols-1 items-center gap-2 rounded-md border border-border bg-muted/20 p-2 sm:grid-cols-[2fr_1fr_1fr_1.5fr]"
                      data-testid={`product-backfill-row-${row.mouId}`}
                    >
                      <Link
                        href={`/mous/${row.mouId}`}
                        className="text-xs font-medium text-brand-navy underline-offset-2 hover:underline"
                      >
                        {row.mouId}
                      </Link>
                      <span className="inline-flex w-fit items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-slate-700">
                        {row.programme}
                      </span>
                      <span className="text-[11px] text-slate-600" data-testid={`product-backfill-evidence-${row.mouId}`}>
                        {row.inferred
                          ? `Evidence: ${row.inferred}`
                          : 'No dispatch evidence'}
                      </span>
                      <select
                        name={`product:${row.mouId}`}
                        defaultValue={row.inferred ?? ''}
                        disabled={!canSave}
                        className="block min-h-9 rounded-md border border-input bg-card px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        data-testid={`product-backfill-select-${row.mouId}`}
                      >
                        <option value="">Leave unset</option>
                        <option value="TinkRworks">TinkRworks</option>
                        <option value="Cretile">Cretile</option>
                        <option value="Both">Both</option>
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
                data-testid="product-backfill-save"
              >
                Save all changes
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
