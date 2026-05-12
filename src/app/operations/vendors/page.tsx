/*
 * /operations/vendors (Gate 2 Step 7 Surface 4).
 *
 * Vendor master list. No equivalent in gsl-mou-system; vendors live
 * alongside agreements there but Ops carries them as a first-class
 * entity (src/data/vendors.json) keyed by vendorId from agreements.
 *
 * Phase 1: read-mostly list with an Add affordance for Finance +
 * Admin. Detail pages live at /operations/vendors/[id].
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'
import type { Vendor } from '@/lib/types'
import vendorsJson from '@/data/vendors.json'

const vendors = vendorsJson as unknown as Vendor[]

export default async function VendorsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fvendors')
  const canEdit = canEditFinanceData(user)

  const sorted = vendors
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="Vendors"
          subtitle={`${vendors.length} vendor${vendors.length === 1 ? '' : 's'} on file. Contacts, banking, GSTIN.`}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Vendors' },
          ]}
          actions={
            // Add vendor is a Phase 1.1 deferral. The create flow is
            // not wired and the route does not exist; rendering an
            // enabled CTA would 404 on click. Render the affordance
            // as a disabled badge so Finance can see it's coming
            // without hitting a dead link (Gate 5A.5 audit fix B8).
            canEdit ? (
              <span
                title="Vendor create lands in Phase 1.1. For now, ask Anish to seed the row; edit fields land via Edit on the detail page."
                aria-disabled="true"
                className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
                data-testid="vendor-add-disabled"
              >
                Add vendor (Phase 1.1)
              </span>
            ) : null
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          {sorted.length === 0 ? (
            <EmptyState
              title="No vendors yet"
              description={
                canEdit
                  ? 'Vendor create lands in Phase 1.1. Ask Anish to seed the first vendor row; field edits land via the per-row detail page.'
                  : 'Vendors will appear here once Finance adds them.'
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Primary contact</th>
                    <th className="px-3 py-2 font-medium">GSTIN</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sorted.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {v.name}
                        {v.legalEntity ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {v.legalEntity}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {v.category ?? '/'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {v.primaryContact ? (
                          <>
                            <span className="block text-foreground">
                              {v.primaryContact}
                            </span>
                            {v.primaryEmail ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {v.primaryEmail}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">/</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {v.gstNumber ?? '/'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <StatusChip
                          tone={v.active ? 'ok' : 'neutral'}
                          label={v.active ? 'Active' : 'Inactive'}
                          withDot={false}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/operations/vendors/${v.id}`}
                          className="inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
