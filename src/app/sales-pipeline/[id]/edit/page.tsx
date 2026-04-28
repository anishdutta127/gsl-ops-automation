/*
 * /sales-pipeline/[id]/edit (W4-F.3 edit form).
 *
 * Renders the same 12-field form as /sales-pipeline/new pre-filled
 * from the existing SalesOpportunity. Submit calls
 * editOpportunityAction; failure / success redirects back to the
 * detail page with flash query params.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import type {
  Programme,
  SalesOpportunity,
  SalesPerson,
} from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { REGION_OPTIONS } from '@/lib/salesOpportunity/createOpportunity'
import { editOpportunityAction } from '../../actions'

const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const ALL_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to edit this opportunity.',
  'not-creator-and-not-lead': 'Only the creator or a SalesHead/Admin can edit this row.',
  'invalid-region': 'Region must be one of the listed values.',
  'invalid-programme': 'Programme is not recognised.',
  'missing-school-name': 'School name is required.',
  'missing-city': 'City is required.',
  'missing-state': 'State is required.',
  'missing-status': 'Status is required.',
  'unknown-sales-rep': 'Sales rep is not in sales_team.json.',
  'invalid-recce-completed-at': 'Recce completed date must be ISO yyyy-mm-dd.',
  'no-changes': 'No fields changed.',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpportunityEditPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fsales-pipeline%2F${encodeURIComponent(id)}%2Fedit`)
  if (!canPerform(user, 'sales-opportunity:edit')) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=permission`)
  }

  const opp = allOpportunities.find((o) => o.id === id)
  if (!opp) return notFound()

  const canEditAnyRow = user.role === 'Admin' || user.role === 'SalesHead'
  if (!canEditAnyRow && opp.createdBy !== user.id) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=not-creator-and-not-lead`)
  }
  if (opp.lossReason !== null) {
    // Edit on a lost opportunity is blocked at the UI; the row stays
    // visible but is no longer mutable.
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=already-lost`)
  }

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const activeReps = allSalesTeam.filter((s) => s.active)

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title={`Edit ${opp.schoolName}`}
        breadcrumb={[
          { label: 'Sales pipeline', href: '/sales-pipeline' },
          { label: opp.id, href: `/sales-pipeline/${encodeURIComponent(opp.id)}` },
          { label: 'Edit' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href={`/sales-pipeline/${encodeURIComponent(opp.id)}`}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to detail
        </Link>

        {errorKey ? (
          <p
            role="alert"
            data-testid="opp-edit-error"
            className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <form
          action={editOpportunityAction}
          className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
        >
          <input type="hidden" name="id" value={opp.id} />

          <div>
            <label htmlFor="schoolName" className="block text-sm font-medium">
              School name <span aria-hidden className="text-rose-600">*</span>
            </label>
            <input
              id="schoolName" name="schoolName" type="text" required
              defaultValue={opp.schoolName}
              data-testid="edit-schoolName"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="schoolId" className="block text-sm font-medium">
              Linked school id (optional)
            </label>
            <input
              id="schoolId" name="schoolId" type="text"
              defaultValue={opp.schoolId ?? ''}
              data-testid="edit-schoolId"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              placeholder="SCH-..."
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave blank to keep this opportunity as a new school. The detail page surfaces a token-match suggestion when applicable.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="block text-sm font-medium">
                City <span aria-hidden className="text-rose-600">*</span>
              </label>
              <input
                id="city" name="city" type="text" required
                defaultValue={opp.city}
                data-testid="edit-city"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium">
                State <span aria-hidden className="text-rose-600">*</span>
              </label>
              <input
                id="state" name="state" type="text" required
                defaultValue={opp.state}
                data-testid="edit-state"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="region" className="block text-sm font-medium">
                Region <span aria-hidden className="text-rose-600">*</span>
              </label>
              <select
                id="region" name="region" required
                defaultValue={opp.region}
                data-testid="edit-region"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="salesRepId" className="block text-sm font-medium">
                Sales rep <span aria-hidden className="text-rose-600">*</span>
              </label>
              <select
                id="salesRepId" name="salesRepId" required
                defaultValue={opp.salesRepId}
                data-testid="edit-salesRepId"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {activeReps.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="programmeProposed" className="block text-sm font-medium">
                Programme proposed
              </label>
              <select
                id="programmeProposed" name="programmeProposed"
                defaultValue={opp.programmeProposed ?? ''}
                data-testid="edit-programme"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(not yet decided)</option>
                {ALL_PROGRAMMES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gslModel" className="block text-sm font-medium">GSL Model</label>
              <input
                id="gslModel" name="gslModel" type="text"
                defaultValue={opp.gslModel ?? ''}
                data-testid="edit-gslModel"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium">
              Status <span aria-hidden className="text-rose-600">*</span>
            </label>
            <input
              id="status" name="status" type="text" required
              defaultValue={opp.status}
              data-testid="edit-status"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <p className="mt-1 text-xs text-slate-500">
              Edits to this field land verbatim in the audit log (before / after); no autocorrect.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recceStatus" className="block text-sm font-medium">Recce status</label>
              <input
                id="recceStatus" name="recceStatus" type="text"
                defaultValue={opp.recceStatus ?? ''}
                data-testid="edit-recceStatus"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
            <div>
              <label htmlFor="recceCompletedAt" className="block text-sm font-medium">
                Recce completed (yyyy-mm-dd)
              </label>
              <input
                id="recceCompletedAt" name="recceCompletedAt" type="date"
                defaultValue={opp.recceCompletedAt ?? ''}
                data-testid="edit-recceCompletedAt"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
          </div>

          <div>
            <label htmlFor="commitmentsMade" className="block text-sm font-medium">
              Commitments made to school
            </label>
            <textarea
              id="commitmentsMade" name="commitmentsMade" rows={3}
              defaultValue={opp.commitmentsMade ?? ''}
              data-testid="edit-commitmentsMade"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="outOfScopeRequirements" className="block text-sm font-medium">
              Out-of-scope requirements
            </label>
            <textarea
              id="outOfScopeRequirements" name="outOfScopeRequirements" rows={2}
              defaultValue={opp.outOfScopeRequirements ?? ''}
              data-testid="edit-outOfScopeRequirements"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="approvalNotes" className="block text-sm font-medium">Approval notes</label>
            <textarea
              id="approvalNotes" name="approvalNotes" rows={2}
              defaultValue={opp.approvalNotes ?? ''}
              data-testid="edit-approvalNotes"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              data-testid="edit-submit"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Save changes
            </button>
            <Link
              href={`/sales-pipeline/${encodeURIComponent(opp.id)}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
