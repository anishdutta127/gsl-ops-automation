/*
 * /mous/upload (Step 2, Pranav Finance/Ops review).
 *
 * The new PRIMARY MOU creation surface: Finance enters a SIGNED MOU -
 * pick the school, fill the core terms, upload the signed document, Save.
 * Posts to /api/mou/create-from-upload which creates an Active MOU and
 * stamps opsReviewStatus='Pending for review' for the Ops track. Replaces
 * the hidden draft wizard.
 *
 * Permission: canEditFinanceData (Finance + Admin). Others are redirected.
 */

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { schoolRepo } from '@/lib/db/repos/school'
import { getCurrentFinancialYear } from '@/lib/mou/yearMembership'

const PROGRAMMES = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics'] as const

const ERRORS: Record<string, string> = {
  permission: 'Only Finance and Admin can enter MOUs.',
  'invalid-form': 'The form payload was malformed. Retry.',
  'missing-school': 'Select a school.',
  'school-not-found': 'That school was not found.',
  'invalid-programme': 'Select a valid programme.',
  'invalid-year': 'Enter the academic year as YYYY-YY (e.g. 2026-27).',
  'invalid-students': 'Enter a student count greater than zero.',
  'invalid-price': 'Enter a price per student greater than zero.',
  'invalid-date': 'Sign date must be YYYY-MM-DD.',
  'pdf-only': 'Only PDF files are accepted for the signed MOU.',
  'too-large': 'The signed PDF exceeds 10 MB.',
  'save-failed': 'Failed to save the MOU. Retry.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const FIELD = 'block text-sm font-medium text-brand-navy'
const INPUT =
  'mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy'

export default async function UploadMouPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fmous%2Fupload')
  if (!canEditFinanceData(user!)) redirect('/mous?error=permission')

  const schools = (await schoolRepo.findAll())
    .filter((s) => s.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const currentFy = getCurrentFinancialYear()
  const errorKey = typeof sp.error === 'string' ? sp.error : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Add MOU"
          subtitle="Enter a signed MOU: pick the school, fill the terms, upload the signed document."
          breadcrumb={[{ label: 'MOUs', href: '/mous' }, { label: 'Add MOU' }]}
        />
        <div className="mx-auto max-w-2xl px-4 py-6">
          {errorKey && (
            <div className="mb-4 rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="upload-error">
              {ERRORS[errorKey] ?? errorKey}
            </div>
          )}
          <form
            method="POST"
            action="/api/mou/create-from-upload"
            encType="multipart/form-data"
            className="space-y-4 rounded-md border border-border bg-card p-5"
            data-testid="add-mou-form"
          >
            <div>
              <label htmlFor="schoolId" className={FIELD}>School</label>
              <select id="schoolId" name="schoolId" required className={INPUT} data-testid="school-select" defaultValue="">
                <option value="" disabled>: select a school :</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="programme" className={FIELD}>Programme</label>
                <select id="programme" name="programme" required className={INPUT} defaultValue="STEAM">
                  {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="academicYear" className={FIELD}>Academic year</label>
                <input id="academicYear" name="academicYear" required defaultValue={currentFy} placeholder="2026-27" className={INPUT} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="students" className={FIELD}>No. of students</label>
                <input id="students" name="students" type="number" min={1} required className={INPUT} data-testid="students-input" />
              </div>
              <div>
                <label htmlFor="pricePerStudent" className={FIELD}>Price per student (Rs)</label>
                <input id="pricePerStudent" name="pricePerStudent" type="number" min={1} required className={INPUT} data-testid="price-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="signDate" className={FIELD}>Sign date <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="signDate" name="signDate" type="date" className={INPUT} />
              </div>
              <div>
                <label htmlFor="file" className={FIELD}>Signed MOU (PDF) <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="file" name="file" type="file" accept="application/pdf" className="mt-1 w-full text-sm" data-testid="file-input" />
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Pricing is per student; products are assigned by Ops after entry.
              On save, the MOU is created as <strong>Active</strong> and surfaces to
              Ops as <strong>Pending for review</strong>.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
                data-testid="save-mou"
              >
                Save MOU
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
