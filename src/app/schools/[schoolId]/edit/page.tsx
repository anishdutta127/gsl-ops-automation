/*
 * /schools/[schoolId]/edit
 *
 * Inline form (not FormCard). Page uses a 2-column grid layout that
 * FormCard's vertical-stack doesn't accommodate; trade-off accepted
 * in C5b to keep FormCard a clean primitive for the simpler admin-
 * create surfaces.
 *
 * Per-role: OpsHead and Admin per 'school:edit'. Form renders for any
 * authenticated user (W3-B baseline); the server route + lib reject
 * unauthorised callers with reason='permission'.
 *
 * W4-I.4 MM4: the form posts to /api/schools/[id] (now wired). Misba's
 * earlier feedback that "save returns 404" was the missing route; that
 * handler now exists. The GSTIN field is hidden for non-Finance/non-
 * Admin users because Ops/Implementation does not require GSTIN per
 * Misba's note.
 */

import { notFound, redirect } from 'next/navigation'
import type { School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const allSchools = schoolsJson as unknown as School[]

interface PageProps {
  params: Promise<{ schoolId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const REGIONS = ['East', 'North', 'South-West'] as const

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit this school.',
  'unknown-user': 'Session user not found. Please log in again.',
  'school-not-found': 'School not found.',
  'missing-name': 'Name is required.',
  'missing-city': 'City is required.',
  'missing-state': 'State is required.',
  'missing-region': 'Region is required.',
  'invalid-pin': 'PIN code must be 6 digits.',
  'invalid-email': 'Email is not a valid address.',
  'invalid-pan': 'PAN must match the AAAAA9999A pattern.',
  'invalid-gst': 'GSTIN must be 15 characters in the standard pattern.',
  'no-changes': 'No changes were made.',
}

export default async function SchoolEditPage({ params, searchParams }: PageProps) {
  const { schoolId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fschools%2F${encodeURIComponent(schoolId)}%2Fedit`)
  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) notFound()
  // W4-I.4 MM4: GSTIN visibility mirrors the editSchool lib's
  // canEditGstin() rule (Finance + Admin only). The lib drops the
  // field server-side when caller lacks the role; hiding the input
  // here keeps the UI consistent with that rule.
  const canSeeGstin = user.role === 'Admin' || user.role === 'Finance'
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/schools" />
      <PageHeader
        title={`Edit ${school.name}`}
        breadcrumb={[
          { label: 'Schools', href: '/schools' },
          { label: school.id, href: `/schools/${school.id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="mx-auto max-w-2xl px-4 py-6">
          {errorMessage ? (
            <div role="alert" className="mb-4 rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert">
              {errorMessage}
            </div>
          ) : null}
          <form action={`/api/schools/${school.id}`} method="POST" className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">

            <div>
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>Name</label>
              <input id="name" name="name" type="text" defaultValue={school.name} required className={FIELD_INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="legalEntity" className={FIELD_LABEL_CLASS}>Legal entity</label>
              <input id="legalEntity" name="legalEntity" type="text" defaultValue={school.legalEntity ?? ''} className={FIELD_INPUT_CLASS} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className={FIELD_LABEL_CLASS}>City</label>
                <input id="city" name="city" type="text" defaultValue={school.city} required className={FIELD_INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="state" className={FIELD_LABEL_CLASS}>State</label>
                <input id="state" name="state" type="text" defaultValue={school.state} required className={FIELD_INPUT_CLASS} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="region" className={FIELD_LABEL_CLASS}>Region</label>
                <select id="region" name="region" defaultValue={school.region} required className={FIELD_INPUT_CLASS}>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pinCode" className={FIELD_LABEL_CLASS}>PIN code</label>
                <input id="pinCode" name="pinCode" type="text" inputMode="numeric" pattern="[0-9]{6}" defaultValue={school.pinCode ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contactPerson" className={FIELD_LABEL_CLASS}>Contact person</label>
                <input id="contactPerson" name="contactPerson" type="text" defaultValue={school.contactPerson ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="email" className={FIELD_LABEL_CLASS}>Email</label>
                <input id="email" name="email" type="email" defaultValue={school.email ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="phone" className={FIELD_LABEL_CLASS}>Phone</label>
                <input id="phone" name="phone" type="tel" defaultValue={school.phone ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="billingName" className={FIELD_LABEL_CLASS}>Billing name</label>
                <input id="billingName" name="billingName" type="text" defaultValue={school.billingName ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pan" className={FIELD_LABEL_CLASS}>PAN</label>
                <input id="pan" name="pan" type="text" defaultValue={school.pan ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
              {canSeeGstin ? (
                <div>
                  <label htmlFor="gstNumber" className={FIELD_LABEL_CLASS}>GSTIN</label>
                  <input id="gstNumber" name="gstNumber" type="text" defaultValue={school.gstNumber ?? ''} className={FIELD_INPUT_CLASS} />
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="notes" className={FIELD_LABEL_CLASS}>Notes</label>
              <textarea id="notes" name="notes" rows={3} defaultValue={school.notes ?? ''} className={FIELD_INPUT_CLASS} />
            </div>

            <div className="flex items-center gap-2">
              <input id="active" name="active" type="checkbox" defaultChecked={school.active} className="size-4 rounded border-input text-brand-navy focus:ring-2 focus:ring-brand-navy" />
              <label htmlFor="active" className="text-sm text-foreground">Active</label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy">
                Save changes
              </button>
              <a href={`/schools/${school.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                Cancel
              </a>
            </div>
          </form>
        </div>
    </>
  )
}
