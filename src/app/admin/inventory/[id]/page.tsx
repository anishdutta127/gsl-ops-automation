/*
 * /admin/inventory/[id] (W4-G.6 detail + edit).
 *
 * Renders all 12 InventoryItem fields plus the audit log. Editable
 * fields (currentStock, reorderThreshold, notes, active) appear in
 * an inline form for users with inventory:edit; immutable fields
 * (id, skuName, category, cretileGrade, mastersheetSourceName)
 * render as read-only metadata regardless of role.
 *
 * Form posts to /api/inventory/[id]/edit which calls editInventoryItem.
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { InventoryItem } from '@/lib/types'
import inventoryItemsJson from '@/data/inventory_items.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'

const items = inventoryItemsJson as unknown as InventoryItem[]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit inventory.',
  'unknown-user': 'Session user not found. Please log in again.',
  'item-not-found': 'Inventory item not found.',
  'invalid-stock': 'Stock must be a non-negative integer.',
  'invalid-threshold': 'Threshold must be a non-negative integer or empty.',
  'no-change': 'No fields were changed.',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InventoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fadmin%2Finventory%2F${encodeURIComponent(id)}`)

  const item = items.find((it) => it.id === id)
  if (!item) notFound()

  const canEdit = canPerform(user, 'inventory:edit')
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const saved = sp.saved === '1'

  const decrementHistory = item.auditLog
    .filter((a) => a.action === 'inventory-decremented-by-dispatch')
    .slice()
    .reverse()
    .slice(0, 10)

  return (
    <div className="p-6 max-w-3xl">
      <p className="mb-2 text-xs">
        <Link
          href="/admin/inventory"
          className="text-[var(--brand-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        >
          Back to Inventory
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">{item.skuName}</h1>
      <p className="mt-1 text-sm text-slate-700">
        <span className="font-mono">{item.id}</span>
        {' · '}
        {item.category}
        {item.cretileGrade !== null ? ` · Grade ${item.cretileGrade}` : ''}
        {item.active ? '' : ' · Sunset'}
      </p>

      {saved ? (
        <p
          role="status"
          className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          Saved.
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-navy)]">
          Identity
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="ID" value={item.id} />
          <Field label="Category" value={item.category} />
          <Field label="Cretile grade" value={item.cretileGrade === null ? 'n/a' : String(item.cretileGrade)} />
          <Field
            label="Mastersheet source name"
            value={item.mastersheetSourceName ?? 'not from Mastersheet'}
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          These fields are immutable. Renaming a SKU or moving categories means a
          new InventoryItem; the old id stays for audit continuity.
        </p>
      </section>

      <section className="mt-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-navy)]">
          Stock + threshold
        </h2>

        {canEdit ? (
          <form
            method="POST"
            action={`/api/inventory/${encodeURIComponent(item.id)}/edit`}
            className="mt-3 space-y-4"
          >
            <input type="hidden" name="active-submitted" value="1" />

            <div>
              <label htmlFor="inv-stock" className="block text-sm font-medium text-[var(--brand-navy)]">
                Current stock
              </label>
              <p className="mt-0.5 text-xs text-slate-600">
                Manual edits land in audit as inventory-stock-edited (e.g. for
                cycle counts or corrections).
              </p>
              <input
                id="inv-stock"
                name="currentStock"
                type="number"
                min={0}
                step={1}
                defaultValue={item.currentStock}
                className="mt-1.5 w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              />
            </div>

            <div>
              <label htmlFor="inv-threshold" className="block text-sm font-medium text-[var(--brand-navy)]">
                Reorder threshold
              </label>
              <p className="mt-0.5 text-xs text-slate-600">
                Stock at or below this triggers an inventory-low-stock notification
                on the next dispatch decrement. Leave empty to disable.
              </p>
              <input
                id="inv-threshold"
                name="reorderThreshold"
                type="number"
                min={0}
                step={1}
                defaultValue={item.reorderThreshold ?? ''}
                className="mt-1.5 w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              />
            </div>

            <div>
              <label htmlFor="inv-notes" className="block text-sm font-medium text-[var(--brand-navy)]">
                Notes
              </label>
              <textarea
                id="inv-notes"
                name="notes"
                rows={2}
                defaultValue={item.notes ?? ''}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              />
            </div>

            <div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  value="true"
                  defaultChecked={item.active}
                  className="size-4 rounded border-slate-300 text-[var(--brand-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
                />
                <span className="text-slate-800">
                  Active SKU
                </span>
              </label>
              <p className="mt-0.5 text-xs text-slate-600">
                Uncheck to mark as sunset. Sunset SKUs hard-block decrement
                (dispatch raises against them fail).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
              >
                Save changes
              </button>
              <Link
                href="/admin/inventory"
                className="text-sm text-slate-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              >
                Cancel
              </Link>
            </div>
          </form>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Current stock" value={String(item.currentStock)} />
            <Field
              label="Reorder threshold"
              value={item.reorderThreshold === null ? 'not set' : String(item.reorderThreshold)}
            />
            <Field label="Notes" value={item.notes ?? '(none)'} />
            <Field label="Active" value={item.active ? 'yes' : 'no (sunset)'} />
          </dl>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Last updated {item.lastUpdatedAt.slice(0, 16).replace('T', ' ')} by{' '}
          {item.lastUpdatedBy}
        </p>
      </section>

      {decrementHistory.length > 0 ? (
        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-navy)]">
            Recent dispatch decrements
          </h2>
          <ul className="mt-3 divide-y divide-slate-200 text-xs">
            {decrementHistory.map((entry, idx) => {
              const before = entry.before as Record<string, unknown> | undefined
              const after = entry.after as Record<string, unknown> | undefined
              const dispatchId = typeof after?.dispatchId === 'string' ? after.dispatchId : null
              return (
                <li key={`${entry.timestamp}-${idx}`} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[var(--brand-navy)] font-mono">
                      {dispatchId ?? 'manual'}
                    </span>
                    <span className="text-slate-500">{entry.timestamp.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="mt-0.5 text-slate-700">
                    {before?.currentStock !== undefined && after?.currentStock !== undefined
                      ? `Stock ${String(before.currentStock)} → ${String(after.currentStock)}`
                      : null}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-navy)]">
          Full audit log
        </h2>
        {item.auditLog.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No audit entries yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 text-xs">
            {item.auditLog.slice().reverse().map((entry, idx) => (
              <li key={`${entry.timestamp}-${idx}`} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--brand-navy)]">{entry.action}</span>
                  <span className="text-slate-500">{entry.timestamp.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div className="mt-0.5 text-slate-700">
                  by {entry.user}
                  {entry.notes ? `: ${entry.notes}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  )
}
