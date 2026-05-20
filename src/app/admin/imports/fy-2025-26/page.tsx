/*
 * Phase 6C FY 2025-26 importer page.
 *
 * Admin-only. Renders the import plan as a dry-run preview, then offers
 * an Apply button that calls the server action. Post-apply, lands on
 * a success state with the counts that were enqueued.
 */

import { notFound, redirect } from 'next/navigation'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import importJson from '@/data/imports/fy-2025-26-import.json'
import type { MOU, Payment, School } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  buildImportPlan,
  type ImportFile,
} from '@/lib/imports/fy2526Import'
import { applyFy2526Import } from './actions'

const PAGE = '/admin/imports/fy-2025-26'

function formatRs(n: number): string {
  return 'Rs ' + Math.round(n).toLocaleString('en-IN')
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Fy2526ImportPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=' + encodeURIComponent(PAGE))
  if (!canManageUsers(user)) notFound()

  const sp = (await searchParams) ?? {}
  const applied = sp.applied === '1'
  const appliedSchools = Number(sp.schools ?? 0)
  const appliedMous = Number(sp.mous ?? 0)
  const appliedInstalments = Number(sp.instalments ?? 0)
  const appliedPayments = Number(sp.payments ?? 0)
  const appliedErrors = Number(sp.errors ?? 0)

  const file = importJson as unknown as ImportFile
  const plan = buildImportPlan({
    records: file.records,
    existingSchools: schoolsJson as unknown as School[],
    existingMous: mousJson as unknown as MOU[],
    existingPayments: paymentsJson as unknown as Payment[],
    programme: 'STEAM',
    now: () => new Date(),
    createdBy: user.id,
  })

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="FY 2025-26 importer (Pratik spreadsheet)"
          subtitle="Dry-run preview, then apply."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'FY 2025-26 import' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <section className="rounded-md border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Source
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {file.source}
              </code>
              , sheet <span className="font-mono text-xs">{file.sheet}</span>,
              exported {file.exportedAt}. {file.totalRecords} record(s).
            </p>
            <p className="mt-1 text-xs text-slate-500">{file.notes}</p>
          </section>

          {applied ? (
            <section
              className="rounded-md border border-emerald-200 bg-emerald-50 p-6"
              data-testid="fy2526-applied-state"
            >
              <h2 className="font-heading text-lg font-semibold text-emerald-900">
                Apply completed
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-3 text-sm text-emerald-900 sm:grid-cols-5">
                <li>Schools created: <strong>{appliedSchools}</strong></li>
                <li>MOUs created: <strong>{appliedMous}</strong></li>
                <li>Instalments created: <strong>{appliedInstalments}</strong></li>
                <li>Payments (paid) created: <strong>{appliedPayments}</strong></li>
                <li>Errors: <strong>{appliedErrors}</strong></li>
              </ul>
              <p className="mt-3 text-xs text-emerald-900">
                Writes queued through pendingUpdates. The sync cron drains
                within ~5 minutes; the records will appear in schools.json,
                mous.json, and payments.json after the drain.
              </p>
            </section>
          ) : null}

          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="fy2526-totals"
          >
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Plan totals
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-4">
              <li>
                Schools to create:{' '}
                <strong data-testid="fy2526-schools-create">
                  {plan.totals.schoolsToCreate}
                </strong>
              </li>
              <li>
                Schools skipped (exists):{' '}
                <strong>{plan.totals.schoolsSkipped}</strong>
              </li>
              <li>
                Schools conflict (city/state):{' '}
                <strong>{plan.totals.schoolsConflict}</strong>
              </li>
              <li>
                MOUs to create:{' '}
                <strong data-testid="fy2526-mous-create">
                  {plan.totals.mousToCreate}
                </strong>
              </li>
              <li>
                MOUs skipped (exists):{' '}
                <strong>{plan.totals.mousSkipped}</strong>
              </li>
              <li>
                MOU orphan-payment warnings:{' '}
                <strong>{plan.totals.mousOrphanWarnings}</strong>
              </li>
              <li>
                Instalments to create:{' '}
                <strong>{plan.totals.instalmentsToCreate}</strong>
              </li>
              <li>
                Payments (paid) to create:{' '}
                <strong>{plan.totals.paymentsToCreate}</strong>
              </li>
            </ul>
          </section>

          <section className="rounded-md border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              TDS summary (informational; not split per instalment)
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {plan.tdsSummary.totalRecordsWithTds} record(s) carry a TDS
              total summing to {formatRs(plan.tdsSummary.totalTdsRs)}.
              Pratik&apos;s sheet captures TDS per record, not per
              instalment; the import preserves the per-record total on
              the MOU.tds field. A per-instalment split needs a batch
              entry later via /finance/payments/batch.
            </p>
          </section>

          {plan.contractValueVsInstalmentSumMismatches.length > 0 ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-6"
              data-testid="fy2526-contract-mismatches"
            >
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                Contract value vs instalment sum mismatches
              </h2>
              <p className="mt-2 text-sm text-amber-900">
                These rows have a salesAmountWithTax that does not match
                the sum of their instalment amounts. The MOU will be
                created with contractValue=salesAmountWithTax; instalments
                use their own amounts. Investigate before applying.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-amber-900">
                {plan.contractValueVsInstalmentSumMismatches.slice(0, 20).map((m, i) => (
                  <li key={i}>
                    <code className="font-mono">{m.record.schoolName}</code>: contract{' '}
                    {formatRs(m.contractRs)} vs instalment sum {formatRs(m.instalmentSumRs)} (delta {formatRs(m.deltaRs)})
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {plan.totals.schoolsConflict > 0 ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-6"
              data-testid="fy2526-conflicts"
            >
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                School conflicts (will NOT be merged silently)
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-amber-900">
                {plan.schools
                  .filter((s) => s.kind === 'conflict-city-state')
                  .map((s, i) => {
                    if (s.kind !== 'conflict-city-state') return null
                    return (
                      <li key={i}>
                        <code className="font-mono">{s.record.schoolName}</code>: import says{' '}
                        {s.importCity}, {s.importState}; existing record (id{' '}
                        <code className="font-mono">{s.existingSchoolId}</code>) is {s.existingCity}, {s.existingState}.
                      </li>
                    )
                  })}
              </ul>
            </section>
          ) : null}

          {plan.totals.mousOrphanWarnings > 0 ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-6"
              data-testid="fy2526-orphan-warnings"
            >
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                Orphan-payment warnings
              </h2>
              <p className="mt-2 text-sm text-amber-900">
                These schools have payment rows in payments.json that
                reference a MOU id that does NOT exist in mous.json. The
                Phase 5A.8 import seeded payments without their parent
                MOU records. The current importer SKIPS creating a new
                MOU for these schools so we do not duplicate. Pranav
                should reconcile by either creating the missing MOU
                records or reassigning the orphan payments.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-amber-900">
                {plan.mous
                  .filter((m) => m.kind === 'orphan-payments-detected')
                  .map((m, i) => {
                    if (m.kind !== 'orphan-payments-detected') return null
                    return (
                      <li key={i}>
                        <code className="font-mono">{m.record.schoolName}</code> (school id{' '}
                        <code className="font-mono">{m.schoolId}</code>): orphan MOU id(s){' '}
                        <code className="font-mono">{m.orphanMouIds.join(', ')}</code>
                      </li>
                    )
                  })}
              </ul>
            </section>
          ) : null}

          {plan.unmatchedNameAnomalies.length > 0 ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-6"
              data-testid="fy2526-name-anomalies"
            >
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                Name anomalies
              </h2>
              <p className="mt-2 text-sm text-amber-900">
                Import rows whose schoolName starts with non-alphanumeric
                characters (asterisk, dash, etc.). These will be created
                with the literal leading punctuation. Confirm before
                applying so a typo or merge-flag does not land as a real
                school name.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-amber-900">
                {plan.unmatchedNameAnomalies.map((r, i) => (
                  <li key={i}>
                    <code className="font-mono">{r.schoolName}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-md border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Per-row plan
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      School
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      School action
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      MOU action
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contract Rs
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Instalments
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {file.records.map((rec, i) => {
                    const sp = plan.schools[i]
                    const mp = plan.mous[i]
                    const schoolAction =
                      sp?.kind === 'create'
                        ? 'CREATE'
                        : sp?.kind === 'conflict-city-state'
                          ? 'CONFLICT'
                          : 'SKIP'
                    const mouAction = mp
                      ? mp.kind === 'create'
                        ? 'CREATE'
                        : mp.kind === 'skip-existing'
                          ? 'SKIP'
                          : 'ORPHAN'
                      : ''
                    return (
                      <tr
                        key={i}
                        className="border-b border-border"
                        data-testid={`fy2526-row-${rec.srNo}`}
                      >
                        <td className="px-3 py-2 text-xs text-slate-700">
                          {rec.schoolName}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {schoolAction}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {mouAction}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatRs(rec.salesAmountWithTax)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {rec.instalments.length}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {plan.totals.schoolsToCreate + plan.totals.mousToCreate > 0 ? (
            <section className="rounded-md border border-brand-navy bg-card p-6">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Apply
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Will enqueue {plan.totals.schoolsToCreate} new school(s),{' '}
                {plan.totals.mousToCreate} new MOU(s),{' '}
                {plan.totals.instalmentsToCreate} new instalment(s), and{' '}
                {plan.totals.paymentsToCreate} payment(s). Skipped rows
                and orphan-warning rows are no-ops.
              </p>
              <form action={applyFy2526Import} className="mt-4">
                <button
                  type="submit"
                  className="rounded-md border border-brand-navy bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid="fy2526-apply-button"
                >
                  Apply import
                </button>
              </form>
            </section>
          ) : (
            <section className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
              <h2 className="font-heading text-lg font-semibold text-emerald-900">
                Nothing to apply
              </h2>
              <p className="mt-2 text-sm text-emerald-900">
                Every row in the import is either skipped (already
                exists) or blocked by a conflict / orphan warning.
                Resolve the warnings above before re-running.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  )
}
