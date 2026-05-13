/*
 * /operations/vendors/new (Gate 5A.6 Step 12).
 *
 * Vendor master create form. Replaces the Phase 1.1 disabled badge
 * on /operations/vendors.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Adding a vendor requires the Finance role.',
  'missing-name': 'Vendor name is required.',
  'queue-failure': 'Failed to queue the create. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function NewVendorPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fvendors%2Fnew')
  if (!canEditFinanceData(user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="New vendor"
          subtitle="Capture the vendor identity, contacts, and banking details. Agreements link to a vendor via the Agreement create form."
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Vendors', href: '/operations/vendors' },
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
            action="/api/operations/vendors/create"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>
                Vendor name
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className={FIELD_INPUT_CLASS}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="legalEntity" className={FIELD_LABEL_CLASS}>
                  Legal entity
                </label>
                <input
                  id="legalEntity"
                  name="legalEntity"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="category" className={FIELD_LABEL_CLASS}>
                  Category
                </label>
                <input
                  id="category"
                  name="category"
                  type="text"
                  placeholder="e.g., Logistics / Print / Warehouse"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="primaryContact" className={FIELD_LABEL_CLASS}>
                  Primary contact
                </label>
                <input
                  id="primaryContact"
                  name="primaryContact"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="primaryEmail" className={FIELD_LABEL_CLASS}>
                  Primary email
                </label>
                <input
                  id="primaryEmail"
                  name="primaryEmail"
                  type="email"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="primaryPhone" className={FIELD_LABEL_CLASS}>
                  Primary phone
                </label>
                <input
                  id="primaryPhone"
                  name="primaryPhone"
                  type="tel"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="address" className={FIELD_LABEL_CLASS}>
                  Address
                </label>
                <input
                  id="address"
                  name="address"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="gstNumber" className={FIELD_LABEL_CLASS}>
                  GSTIN
                </label>
                <input
                  id="gstNumber"
                  name="gstNumber"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="pan" className={FIELD_LABEL_CLASS}>
                  PAN
                </label>
                <input
                  id="pan"
                  name="pan"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="bankAccount" className={FIELD_LABEL_CLASS}>
                  Bank account
                </label>
                <input
                  id="bankAccount"
                  name="bankAccount"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="ifsc" className={FIELD_LABEL_CLASS}>
                  IFSC
                </label>
                <input
                  id="ifsc"
                  name="ifsc"
                  type="text"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                Notes
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
                <span className="text-foreground">Active vendor</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Create vendor
              </button>
              <Link
                href="/operations/vendors"
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
