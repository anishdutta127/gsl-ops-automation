/*
 * /admin/inventory/[id] (W4-G.6 detail + edit; W4-I.5 P4C5.5 design-system pass).
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
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass, OpsButton } from '@/components/ops/OpsButton'

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

  const inputClass = 'min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title={item.skuName}
          subtitle={`${item.id} · ${item.category}${item.cretileGrade !== null ? ` · Grade ${item.cretileGrade}` : ''}${item.active ? '' : ' · Sunset'}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Inventory', href: '/admin/inventory' },
            { label: item.id },
          ]}
        />
        <div className="mx-auto max-w-screen-md space-y-4 px-4 py-6">

          {saved ? (
            <p
              role="status"
              className="rounded-md border border-signal-ok bg-signal-ok/10 px-3 py-2 text-sm text-signal-ok"
            >
              Saved.
            </p>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
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
            <p className="mt-3 text-xs text-muted-foreground">
              These fields are immutable. Renaming a SKU or moving categories means a
              new InventoryItem; the old id stays for audit continuity.
            </p>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
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
                  <label htmlFor="inv-stock" className="block text-sm font-medium text-brand-navy">
                    Current stock
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
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
                    className={`mt-1.5 w-40 ${inputClass}`}
                  />
                </div>

                <div>
                  <label htmlFor="inv-threshold" className="block text-sm font-medium text-brand-navy">
                    Reorder threshold
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
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
                    className={`mt-1.5 w-40 ${inputClass}`}
                  />
                </div>

                <div>
                  <label htmlFor="inv-notes" className="block text-sm font-medium text-brand-navy">
                    Notes
                  </label>
                  <textarea
                    id="inv-notes"
                    name="notes"
                    rows={2}
                    defaultValue={item.notes ?? ''}
                    className={`mt-1.5 w-full ${inputClass}`}
                  />
                </div>

                <div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="active"
                      value="true"
                      defaultChecked={item.active}
                      className="size-4 rounded border-input text-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    />
                    <span className="text-foreground">Active SKU</span>
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Uncheck to mark as sunset. Sunset SKUs hard-block decrement
                    (dispatch raises against them fail).
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <OpsButton type="submit" variant="primary" size="md">
                    Save changes
                  </OpsButton>
                  <Link
                    href="/admin/inventory"
                    className={opsButtonClass({ variant: 'outline', size: 'md' })}
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

            <p className="mt-3 text-xs text-muted-foreground">
              Last updated {item.lastUpdatedAt.slice(0, 16).replace('T', ' ')} by{' '}
              {item.lastUpdatedBy}
            </p>
          </section>

          {decrementHistory.length > 0 ? (
            <section className="rounded-md border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
                Recent dispatch decrements
              </h2>
              <ul className="mt-3 divide-y divide-border text-xs">
                {decrementHistory.map((entry, idx) => {
                  const before = entry.before as Record<string, unknown> | undefined
                  const after = entry.after as Record<string, unknown> | undefined
                  const dispatchId = typeof after?.dispatchId === 'string' ? after.dispatchId : null
                  return (
                    <li key={`${entry.timestamp}-${idx}`} className="py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-brand-navy">
                          {dispatchId ?? 'manual'}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.timestamp.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <div className="mt-0.5 text-foreground">
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

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
              Full audit log
            </h2>
            {item.auditLog.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-xs">
                {item.auditLog.slice().reverse().map((entry, idx) => (
                  <li key={`${entry.timestamp}-${idx}`} className="py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-brand-navy">{entry.action}</span>
                      <span className="text-muted-foreground">
                        {entry.timestamp.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    <div className="mt-0.5 text-foreground">
                      by {entry.user}
                      {entry.notes ? `: ${entry.notes}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}
