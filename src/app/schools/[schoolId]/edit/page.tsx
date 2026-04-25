/*
 * /schools/[schoolId]/edit
 *
 * Inline form using shadcn primitives directly. Per Phase C3
 * judgment: FormCard deferred to C5b; this page ships ~60 lines of
 * inline form rather than depending on an abstraction whose API is
 * informed by C5b's diversity.
 *
 * Per-role: OpsHead and Admin only. Non-permitted roles redirect to
 * the read-only /schools/[id] (per C scoping pass: "schools/[id]/edit
 * redirects to /schools/[id], not /dashboard, because the edit page
 * is a privileged version of detail; falling through to the read view
 * is more useful than a context jump").
 *
 * The form posts to /api/schools/[id] (placeholder route; not in C3
 * scope). For Phase 1 testers, the form renders and submits will
 * 501 until the route handler lands. Inline note documents this.
 */

import { notFound, redirect } from 'next/navigation'
import type { School, User } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const allSchools = schoolsJson as unknown as School[]

interface PageProps {
  params: Promise<{ schoolId: string }>
}

function canEdit(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'OpsHead') return true
  if (user.testingOverride && user.testingOverridePermissions?.includes('OpsHead')) return true
  return false
}

const REGIONS = ['East', 'North', 'South-West'] as const

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function SchoolEditPage({ params }: PageProps) {
  const { schoolId } = await params
  const user = await getCurrentUser()
  if (!canEdit(user)) {
    redirect(`/schools/${schoolId}`)
  }
  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) notFound()

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content">
        <PageHeader
          title={`Edit ${school.name}`}
          breadcrumb={[
            { label: 'Schools', href: '/schools' },
            { label: school.id, href: `/schools/${school.id}` },
            { label: 'Edit' },
          ]}
        />
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="mb-4 rounded-md border border-signal-attention bg-card px-3 py-2 text-xs text-foreground">
            Phase 1 note: form rendering only. The submit endpoint is a 501 stub until the route handler lands in a later phase.
          </p>
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
              <div>
                <label htmlFor="gstNumber" className={FIELD_LABEL_CLASS}>GSTIN</label>
                <input id="gstNumber" name="gstNumber" type="text" defaultValue={school.gstNumber ?? ''} className={FIELD_INPUT_CLASS} />
              </div>
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
      </main>
    </>
  )
}
