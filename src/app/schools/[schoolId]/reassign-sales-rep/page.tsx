/*
 * /schools/[schoolId]/reassign-sales-rep
 *
 * Sales-rep reassignment form. Two scopes (future-only default,
 * all-MOUs destructive). The POST target is
 * /api/schools/[schoolId]/reassign-sales-rep which calls
 * reassignSalesRep and redirects back to the school detail page with
 * a notice.
 *
 * Permission gate: canEditMOU || canEditFinanceData. Layer 1 here
 * matches the lib's Layer 2 check.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import type { MOU, SalesPerson, School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { getCurrentSalesRepForSchool } from '@/lib/schools/currentSalesRep'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const ERROR_COPY: Record<string, string> = {
  'invalid-scope': 'Pick which scope to apply (future MOUs or all MOUs).',
  permission:
    'You do not have permission to reassign the sales rep. Sales, Finance, or an Admin with cross-functional rights must run this.',
  'unknown-user': 'Your session user could not be resolved. Sign out and back in, then retry.',
  'school-not-found': 'That school could not be found.',
  'unknown-sales-rep': 'Pick a sales rep from the list.',
  'inactive-sales-rep': 'That sales rep is inactive. Activate them first or pick another.',
  'no-change':
    'The chosen sales rep matches the current rep on file. Nothing to reassign.',
}

interface PageProps {
  params: Promise<{ schoolId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ReassignSalesRepPage({ params, searchParams }: PageProps) {
  const { schoolId } = await params
  const sp = (await searchParams) ?? {}
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? null : null

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fschools%2F${encodeURIComponent(schoolId)}%2Freassign-sales-rep`)
  if (!canEditMOU(user) && !canEditFinanceData(user)) {
    redirect(`/schools/${schoolId}?notice=sales-rep-reassign-forbidden`)
  }

  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) notFound()

  const schoolMous = allMous.filter((m) => m.schoolId === school.id)
  const currentRepId = getCurrentSalesRepForSchool(school, schoolMous)
  const currentRep = currentRepId
    ? allSalesTeam.find((sp) => sp.id === currentRepId) ?? null
    : null
  const activeReps = allSalesTeam.filter((sp) => sp.active)

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content">
        <PageHeader
          title="Reassign sales rep"
          subtitle={school.name}
          breadcrumb={[
            { label: 'Schools', href: '/schools' },
            { label: school.id, href: `/schools/${school.id}` },
            { label: 'Reassign sales rep' },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          {errorMessage ? (
            <div
              role="alert"
              data-testid="reassign-error"
              data-error={errorKey}
              className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            >
              <AlertCircle aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <form
            method="POST"
            action={`/api/schools/${encodeURIComponent(school.id)}/reassign-sales-rep`}
            className="space-y-4 rounded-lg border border-border bg-card p-5"
            data-testid="reassign-sales-rep-form"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current sales rep
              </div>
              <div className="mt-1 font-mono text-sm text-foreground" data-testid="current-sales-rep">
                {currentRep ? `${currentRep.name} (${currentRep.id})` : '(none on file)'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: {school.auditLog.some((e) => e.action === 'sales-rep-reassigned')
                  ? 'most recent reassignment audit entry'
                  : schoolMous.length > 0
                    ? 'most recent MOU at this school'
                    : 'no MOUs or audit entries yet'}
                .
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                New sales rep
              </span>
              <select
                name="newSalesPersonId"
                required
                defaultValue=""
                className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                data-testid="new-sales-rep-select"
              >
                <option value="">{'- Pick a sales rep -'}</option>
                {activeReps.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} {'·'} {sp.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason (optional)
              </span>
              <textarea
                name="reason"
                rows={3}
                placeholder="Why is this reassignment happening?"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                data-testid="reassign-reason"
              />
            </label>

            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Future-only updates the school&apos;s current rep going forward; existing
                MOUs keep their original rep on the record. All-MOUs also rewrites
                every existing MOU at this school - destructive of historical signal,
                use deliberately.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  name="scope"
                  value="future-only"
                  className={opsButtonClass({ variant: 'primary', size: 'md' })}
                  data-testid="submit-future-only"
                >
                  Reassign for future MOUs only
                </button>
                <button
                  type="submit"
                  name="scope"
                  value="all-mous"
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                  data-testid="submit-all-mous"
                >
                  Reassign all {schoolMous.length} MOUs at this school
                </button>
                <Link
                  href={`/schools/${school.id}`}
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                >
                  Cancel
                </Link>
              </div>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
