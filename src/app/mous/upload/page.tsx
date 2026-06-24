/*
 * /mous/upload (Step 2, Pranav Finance/Ops review; reworked by the MOU
 * form upgrade gate).
 *
 * The PRIMARY MOU creation surface: Finance enters a SIGNED MOU. School
 * identity is free-text (name + address) with an optional link to an
 * existing canonical school; core terms include the MOU duration
 * (start + end), per-student sale price with a derived contract value,
 * sales channel, and an instalment schedule that materialises Payment
 * rows on save. The interactive form lives in AddMouForm (client);
 * this server page hydrates the school list and renders redirect-path
 * errors (login bounces, native-form fallbacks) including the real
 * `detail` the API attaches.
 *
 * Permission: canEditFinanceData (Finance + Admin). Others are redirected.
 */

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { schoolRepo } from '@/lib/db/repos/school'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { getCurrentFinancialYear } from '@/lib/mou/yearMembership'
import { AddMouForm } from './AddMouForm'

const ERRORS: Record<string, string> = {
  permission: 'Only Finance and Admin can enter MOUs.',
  'invalid-form': 'The form payload was malformed. Retry.',
  'missing-school-name': 'Enter the school name.',
  'missing-school-address': 'Enter the school address.',
  'school-not-found': 'That school was not found.',
  'invalid-programme': 'Select a valid programme.',
  'invalid-year': 'Enter the academic year as YYYY-YY (e.g. 2026-27).',
  'invalid-students': 'Enter a student count greater than zero.',
  'invalid-price': 'Enter a sale price per student greater than zero.',
  'missing-start-date': 'Enter the MOU start date.',
  'missing-end-date': 'Enter the MOU end date.',
  'date-order': 'The MOU end date must be on or after the start date.',
  'invalid-date': 'Dates must be YYYY-MM-DD.',
  'invalid-installments': 'Add at least one complete instalment row (due date and an amount greater than zero).',
  'invalid-sales-channel': 'Select a valid sales channel.',
  'pdf-only': 'Only PDF files are accepted for the signed MOU.',
  'too-large': 'The signed PDF exceeds 10 MB.',
  'save-failed': 'Failed to save the MOU.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UploadMouPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fmous%2Fupload')
  if (!canEditFinanceData(user!)) redirect('/mous?error=permission')

  const schools = (await schoolRepo.findAll())
    .filter((s) => s.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const salesPeople = (await salesTeamRepo.findActive())
    .map((s) => ({ id: s.id, name: s.name, territories: s.territories }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const currentFy = getCurrentFinancialYear()

  // Redirect-path error rendering (native-form fallback, login bounce).
  // The API attaches the real exception text as ?detail=, which the
  // pre-gate page silently dropped; surface it so the operator and the
  // person they escalate to see the actual cause, not a generic line.
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorDetail = typeof sp.detail === 'string' ? sp.detail : null
  const initialError = errorKey
    ? [ERRORS[errorKey] ?? errorKey, errorDetail].filter(Boolean).join(' ')
    : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Add MOU"
          subtitle="Enter a signed MOU: school identity, core terms, instalment schedule, signed document."
          breadcrumb={[{ label: 'MOUs', href: '/mous' }, { label: 'Add MOU' }]}
        />
        <div className="mx-auto max-w-2xl px-4 py-6">
          <AddMouForm
            schools={schools.map((s) => ({ id: s.id, name: s.name, city: s.city }))}
            salesPeople={salesPeople}
            defaultYear={currentFy}
            initialError={initialError}
          />
        </div>
      </main>
    </>
  )
}
