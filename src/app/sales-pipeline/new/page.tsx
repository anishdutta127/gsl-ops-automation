/*
 * /sales-pipeline/new (W4-F.2 create form).
 *
 * Server component renders the 12-field form. salesRepId pre-fills
 * from the session for SalesRep users (auto-pick own); SalesHead /
 * Admin see a dropdown of every active sales rep.
 *
 * Status field carries inline help text flagging "workflow being
 * defined; round 2 formalises". Programme is the existing 5-value
 * enum + a "(none)" option for early-stage opportunities. Region
 * is the 6-value W4-F.2 list (3 existing schools.json + 3 forward-
 * looking).
 *
 * No did-you-mean inline suggestion at create-time per W4-F.2 scope
 * (deferred to W4-F.3 detail-page edit; the form's schoolId field
 * stays free-text + null-on-blank).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import salesTeamJson from '@/data/sales_team.json'
import type { Programme, SalesPerson } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { REGION_OPTIONS } from '@/lib/salesOpportunity/createOpportunity'
import { createOpportunityAction } from '../actions'

const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const ALL_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

const ERROR_FLASH: Record<string, string> = {
  'invalid-region': 'Region must be one of the listed values.',
  'invalid-programme': 'Programme is not recognised.',
  'missing-school-name': 'School name is required.',
  'missing-city': 'City is required.',
  'missing-state': 'State is required.',
  'missing-status': 'Status is required.',
  'unknown-sales-rep': 'Sales rep is not in sales_team.json.',
  'invalid-recce-completed-at': 'Recce completed date must be ISO yyyy-mm-dd.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SalesPipelineNewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline%2Fnew')
  if (!canPerform(user, 'sales-opportunity:create')) {
    redirect('/sales-pipeline?error=permission')
  }

  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null

  const isSalesRep = user.role === 'SalesRep'
  // Match the session user to a SalesPerson by email (same heuristic as
  // W4-E.5 fan-out). When SalesRep + match found, pre-fill the form;
  // otherwise the dropdown defaults to first active rep.
  const ownSalesPerson = allSalesTeam.find((s) => s.email === user.email) ?? null
  const activeReps = allSalesTeam.filter((s) => s.active)

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title="New opportunity"
        breadcrumb={[
          { label: 'Sales pipeline', href: '/sales-pipeline' },
          { label: 'New opportunity' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href="/sales-pipeline"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to pipeline
        </Link>

        {errorKey ? (
          <p
            role="alert"
            data-testid="sales-pipeline-new-error"
            className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <form
          action={createOpportunityAction}
          className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
        >
          <div>
            <label htmlFor="schoolName" className="block text-sm font-medium">
              School name <span aria-hidden className="text-rose-600">*</span>
            </label>
            <input
              id="schoolName"
              name="schoolName"
              type="text"
              required
              data-testid="form-schoolName"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <p className="mt-1 text-xs text-slate-500">
              Free-text. If this school already exists in the system, you can link it later from the detail page.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="block text-sm font-medium">
                City <span aria-hidden className="text-rose-600">*</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                data-testid="form-city"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium">
                State <span aria-hidden className="text-rose-600">*</span>
              </label>
              <input
                id="state"
                name="state"
                type="text"
                required
                data-testid="form-state"
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
                id="region"
                name="region"
                required
                defaultValue={REGION_OPTIONS[0]}
                data-testid="form-region"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="salesRepId" className="block text-sm font-medium">
                Sales rep <span aria-hidden className="text-rose-600">*</span>
              </label>
              {isSalesRep && ownSalesPerson ? (
                <>
                  <input
                    type="hidden"
                    name="salesRepId"
                    value={ownSalesPerson.id}
                    data-testid="form-salesRepId-hidden"
                  />
                  <p
                    id="salesRepId"
                    className="mt-1 block w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                  >
                    {ownSalesPerson.name} (you)
                  </p>
                </>
              ) : (
                <select
                  id="salesRepId"
                  name="salesRepId"
                  required
                  data-testid="form-salesRepId"
                  className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  {activeReps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="programmeProposed" className="block text-sm font-medium">
                Programme proposed
              </label>
              <select
                id="programmeProposed"
                name="programmeProposed"
                defaultValue=""
                data-testid="form-programme"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(not yet decided)</option>
                {ALL_PROGRAMMES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gslModel" className="block text-sm font-medium">
                GSL Model
              </label>
              <input
                id="gslModel"
                name="gslModel"
                type="text"
                placeholder="e.g., GSL-Trainer / TTT / Bootcamp"
                data-testid="form-gslModel"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
              <p className="mt-1 text-xs text-slate-500">
                Free-text. Vocabulary will formalise after round 2 testing.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium">
              Status <span aria-hidden className="text-rose-600">*</span>
            </label>
            <input
              id="status"
              name="status"
              type="text"
              required
              placeholder="e.g., Recce scheduled"
              data-testid="form-status"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <p className="mt-1 text-xs text-slate-500">
              Describe your current state in your own words (e.g., &ldquo;Recce scheduled&rdquo;, &ldquo;Awaiting Pratik approval&rdquo;). The system will formalise standard statuses after round 2 testing.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recceStatus" className="block text-sm font-medium">
                Recce status
              </label>
              <input
                id="recceStatus"
                name="recceStatus"
                type="text"
                placeholder="e.g., Pending / Scheduled / Done"
                data-testid="form-recceStatus"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
            <div>
              <label htmlFor="recceCompletedAt" className="block text-sm font-medium">
                Recce completed (yyyy-mm-dd)
              </label>
              <input
                id="recceCompletedAt"
                name="recceCompletedAt"
                type="date"
                data-testid="form-recceCompletedAt"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
            </div>
          </div>

          <div>
            <label htmlFor="commitmentsMade" className="block text-sm font-medium">
              Commitments made to school
            </label>
            <textarea
              id="commitmentsMade"
              name="commitmentsMade"
              rows={3}
              data-testid="form-commitmentsMade"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="outOfScopeRequirements" className="block text-sm font-medium">
              Out-of-scope requirements
            </label>
            <textarea
              id="outOfScopeRequirements"
              name="outOfScopeRequirements"
              rows={2}
              data-testid="form-outOfScopeRequirements"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="approvalNotes" className="block text-sm font-medium">
              Approval notes
            </label>
            <textarea
              id="approvalNotes"
              name="approvalNotes"
              rows={2}
              placeholder="Free-text. Record approval state in your own words; e.g., 'Pratik OK 2026-04-25; Shashank pending'."
              data-testid="form-approvalNotes"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              data-testid="form-submit"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Create opportunity
            </button>
            <Link
              href="/sales-pipeline"
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
