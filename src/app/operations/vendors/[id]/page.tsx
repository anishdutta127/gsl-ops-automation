/*
 * /operations/vendors/[id] (Gate 2 Step 7 Surface 4 detail).
 *
 * Vendor detail page. Shows the full record + every Agreement that
 * carries vendorId === thisVendor.id. Edit affordance gates on
 * canEditFinanceData.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { formatDate } from '@/lib/format'
import type { Agreement, Vendor } from '@/lib/types'
import { vendorRepo } from '@/lib/db/repos/vendor'
import { agreementRepo } from '@/lib/db/repos/leafRepos'
import { VendorEditForm } from './VendorEditForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VendorDetailPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/operations/vendors/${id}`)}`)
  const [allVendors, allAgreements] = await Promise.all([
    vendorRepo.findAll(),
    agreementRepo.findAll() as unknown as Promise<Agreement[]>,
  ])
  const vendor = allVendors.find((v) => v.id === id)
  if (!vendor) notFound()
  const canEdit = canEditFinanceData(user)
  const linked = allAgreements.filter((a) => a.vendorId === vendor.id)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={vendor.name}
          subtitle={vendor.legalEntity ?? undefined}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Vendors', href: '/operations/vendors' },
            { label: vendor.name },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <div>
            <Link
              href="/operations/vendors"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to vendors
            </Link>
          </div>

          {canEdit ? (
            <VendorEditForm vendor={vendor} />
          ) : (
            <ReadOnlyVendor vendor={vendor} />
          )}

          <section aria-label="Linked agreements">
            <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Linked agreements ({linked.length})
            </h2>
            {linked.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No agreements linked to this vendor yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Nature</th>
                      <th className="px-3 py-2 font-medium">Start</th>
                      <th className="px-3 py-2 font-medium">End</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {linked.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 text-xs">{a.type}</td>
                        <td className="px-3 py-2 text-foreground">
                          {a.natureOfAgreement}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {formatDate(a.startDate)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {a.endDate ? formatDate(a.endDate) : '/'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/operations/agreements/${a.id}`}
                            className="text-xs text-brand-navy hover:underline"
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
          </section>
        </div>
      </main>
    </>
  )
}

function ReadOnlyVendor({ vendor }: { vendor: Vendor }) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Category" value={vendor.category} />
      <Field label="Primary contact" value={vendor.primaryContact} />
      <Field label="Primary email" value={vendor.primaryEmail} />
      <Field label="Primary phone" value={vendor.primaryPhone} />
      <Field label="GSTIN" value={vendor.gstNumber} mono />
      <Field label="PAN" value={vendor.pan} mono />
      <Field label="Bank account" value={vendor.bankAccount} mono />
      <Field label="IFSC" value={vendor.ifsc} mono />
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Address
        </p>
        <p className="mt-1 text-foreground">{vendor.address ?? '/'}</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Notes
        </p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {vendor.notes ?? '/'}
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          'mt-0.5 text-foreground ' + (mono ? 'font-mono text-xs' : '')
        }
      >
        {value ?? '/'}
      </p>
    </div>
  )
}
