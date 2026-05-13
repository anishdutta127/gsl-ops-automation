/*
 * /operations/agreements/new (Gate 5A.6 Step 12).
 *
 * Vendor / NDA agreement create form. When ?renewedFrom=AGR-XXX is in
 * the querystring, the form pre-fills from the source agreement,
 * forces startDate=today, and clears endDate. On submit the lib also
 * appends a 'renewed by AGR-YYY' audit entry on the source.
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
import type { Agreement, Vendor } from '@/lib/types'
import agreementsJson from '@/data/agreements.json'
import vendorsJson from '@/data/vendors.json'

const allAgreements = agreementsJson as unknown as Agreement[]
const allVendors = vendorsJson as unknown as Vendor[]

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Adding an agreement requires the Finance role.',
  'missing-party': 'Party name is required.',
  'missing-nature': 'Nature of agreement is required.',
  'missing-start': 'Start date is required.',
  'invalid-type': 'Pick a valid agreement type.',
  'invalid-custody': 'Pick a valid custody value or leave blank.',
  'queue-failure': 'Failed to queue the create. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function NewAgreementPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fagreements%2Fnew')
  if (!canEditFinanceData(user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  const renewedFrom = typeof sp.renewedFrom === 'string' ? sp.renewedFrom : null
  const source = renewedFrom
    ? allAgreements.find((a) => a.id === renewedFrom) ?? null
    : null

  const defaultStart = source ? todayIso() : todayIso()
  const defaultEnd = source ? '' : ''
  const defaultNotes = source ? `Renews ${source.id}` : ''

  const activeVendors = allVendors
    .filter((v) => v.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={source ? `Renew agreement (from ${source.id})` : 'New agreement'}
          subtitle={
            source
              ? 'Fields are pre-filled from the source agreement; start date defaults to today. Save creates a new record and adds an audit entry on the source.'
              : 'Capture a vendor agreement or an NDA. Linked vendor is optional and only used to organise agreements per vendor.'
          }
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Agreements', href: '/operations/agreements' },
            { label: source ? 'Renew' : 'New' },
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
            action="/api/operations/agreements/create"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            {source ? (
              <input type="hidden" name="renewedFrom" value={source.id} />
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="type" className={FIELD_LABEL_CLASS}>
                  Type
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  defaultValue={source?.type ?? 'Vendor'}
                  className={FIELD_INPUT_CLASS}
                >
                  <option value="Vendor">Vendor</option>
                  <option value="NDA">NDA</option>
                </select>
              </div>
              <div>
                <label htmlFor="partyName" className={FIELD_LABEL_CLASS}>
                  Party name
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </label>
                <input
                  id="partyName"
                  name="partyName"
                  type="text"
                  required
                  defaultValue={source?.partyName ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="vendorId" className={FIELD_LABEL_CLASS}>
                Linked vendor (optional)
              </label>
              <select
                id="vendorId"
                name="vendorId"
                defaultValue={source?.vendorId ?? ''}
                className={FIELD_INPUT_CLASS}
              >
                <option value="">/ unlinked /</option>
                {activeVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.category ? ` (${v.category})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="natureOfAgreement" className={FIELD_LABEL_CLASS}>
                Nature of agreement
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <input
                id="natureOfAgreement"
                name="natureOfAgreement"
                type="text"
                required
                defaultValue={source?.natureOfAgreement ?? ''}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="product" className={FIELD_LABEL_CLASS}>
                  Product
                </label>
                <input
                  id="product"
                  name="product"
                  type="text"
                  defaultValue={source?.product ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="department" className={FIELD_LABEL_CLASS}>
                  Department
                </label>
                <input
                  id="department"
                  name="department"
                  type="text"
                  defaultValue={source?.department ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="vendorLocation" className={FIELD_LABEL_CLASS}>
                  Vendor location
                </label>
                <input
                  id="vendorLocation"
                  name="vendorLocation"
                  type="text"
                  defaultValue={source?.vendorLocation ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="keyTerms" className={FIELD_LABEL_CLASS}>
                Key terms
              </label>
              <textarea
                id="keyTerms"
                name="keyTerms"
                rows={2}
                defaultValue={source?.keyTerms ?? ''}
                placeholder="Short commercial summary; under a couple of sentences."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="startDate" className={FIELD_LABEL_CLASS}>
                  Start date
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={defaultStart}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="endDate" className={FIELD_LABEL_CLASS}>
                  End date (blank = indefinite)
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={defaultEnd}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="tenure" className={FIELD_LABEL_CLASS}>
                  Tenure (freetext)
                </label>
                <input
                  id="tenure"
                  name="tenure"
                  type="text"
                  defaultValue={source?.tenure ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="noticePeriod" className={FIELD_LABEL_CLASS}>
                  Notice period
                </label>
                <input
                  id="noticePeriod"
                  name="noticePeriod"
                  type="text"
                  defaultValue={source?.noticePeriod ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="physicalCustody" className={FIELD_LABEL_CLASS}>
                  Custody
                </label>
                <select
                  id="physicalCustody"
                  name="physicalCustody"
                  defaultValue={source?.physicalCustody ?? ''}
                  className={FIELD_INPUT_CLASS}
                >
                  <option value="">/</option>
                  <option value="Physical">Physical</option>
                  <option value="Digital">Digital</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="documentUrl" className={FIELD_LABEL_CLASS}>
                Document URL
              </label>
              <input
                id="documentUrl"
                name="documentUrl"
                type="url"
                placeholder="https://..."
                defaultValue={source?.documentUrl ?? ''}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            {defaultNotes ? (
              <input type="hidden" name="initialNotes" value={defaultNotes} />
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                {source ? 'Save renewal' : 'Create agreement'}
              </button>
              <Link
                href="/operations/agreements"
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
