/*
 * Phase 6C PI backfill page.
 *
 * Admin-only. Three sections matching the three bucket outcomes from
 * buildBackfillPlan: auto-matched, needs-review, impossible. Pranav
 * drives the apply via the buttons; CC does not click apply itself.
 */

import { notFound, redirect } from 'next/navigation'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import importJson from '@/data/imports/fy-2025-26-import.json'
import type { MOU, Payment } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { buildBackfillPlan } from '@/lib/imports/piBackfill'
import type { ImportFile } from '@/lib/imports/fy2526Import'
import { applyAllAutoMatches, applySingleRow } from './actions'

const PAGE = '/admin/imports/pi-backfill'

function formatRs(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  return 'Rs ' + Math.round(n).toLocaleString('en-IN')
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function PiBackfillPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=' + encodeURIComponent(PAGE))
  if (!canManageUsers(user)) notFound()

  const sp = (await searchParams) ?? {}
  const bulkApplied = sp.bulkApplied === '1'
  const bulkAppliedCount = Number(sp.applied ?? 0)
  const bulkFailedCount = Number(sp.failed ?? 0)
  const rowApplied = typeof sp.rowApplied === 'string' ? sp.rowApplied : null
  const rowOk = sp.ok === '1'
  const rowPi = typeof sp.pi === 'string' ? sp.pi : null
  const rowErr = typeof sp.err === 'string' ? sp.err : null

  const file = importJson as unknown as ImportFile
  const plan = buildBackfillPlan({
    payments: paymentsJson as unknown as Payment[],
    mous: mousJson as unknown as MOU[],
    importRecords: file.records,
  })

  const autoMatched = plan.rows.filter((r) => r.kind === 'auto-matched') as Array<
    Extract<typeof plan.rows[number], { kind: 'auto-matched' }>
  >
  const needsReview = plan.rows.filter((r) => r.kind === 'needs-review') as Array<
    Extract<typeof plan.rows[number], { kind: 'needs-review' }>
  >
  const impossible = plan.rows.filter((r) => r.kind === 'impossible') as Array<
    Extract<typeof plan.rows[number], { kind: 'impossible' }>
  >

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="PI backfill"
          subtitle="126 paid payment rows without piNumber. Auto-match, apply at your pace."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'PI backfill' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="pi-backfill-totals"
          >
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Summary
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <li>
                Auto-matched:{' '}
                <strong data-testid="auto-matched-count">
                  {plan.totals.autoMatched}
                </strong>
              </li>
              <li>
                Needs review:{' '}
                <strong data-testid="needs-review-count">
                  {plan.totals.needsReview}
                </strong>
              </li>
              <li>
                Impossible (no candidate):{' '}
                <strong data-testid="impossible-count">
                  {plan.totals.impossible}
                </strong>
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              An &quot;auto-match&quot; means exactly one instalment in
              Pratik&apos;s FY 25-26 import matches this Ops payment by
              amount (within Rs 10) + month (within +/- 30 days) +
              school name. Applying mints a fresh PI number from the
              FY-aware counter for the MOU&apos;s academic year.
              Pranav-supplied manual PI numbers are accepted verbatim
              for historic Excel records.
            </p>
          </section>

          {bulkApplied ? (
            <section
              className="rounded-md border border-emerald-200 bg-emerald-50 p-6"
              data-testid="bulk-applied-banner"
            >
              <h2 className="font-heading text-lg font-semibold text-emerald-900">
                Bulk apply completed
              </h2>
              <p className="mt-2 text-sm text-emerald-900">
                {bulkAppliedCount} row(s) applied, {bulkFailedCount} failed.
              </p>
            </section>
          ) : null}

          {rowApplied ? (
            <section
              className={
                rowOk
                  ? 'rounded-md border border-emerald-200 bg-emerald-50 p-6'
                  : 'rounded-md border border-amber-200 bg-amber-50 p-6'
              }
              data-testid="row-applied-banner"
            >
              <h2 className="font-heading text-lg font-semibold">
                Row {rowApplied}: {rowOk ? 'applied' : 'failed'}
              </h2>
              {rowOk && rowPi ? (
                <p className="mt-2 text-sm">
                  PI minted: <code className="font-mono">{rowPi}</code>
                </p>
              ) : null}
              {!rowOk && rowErr ? (
                <p className="mt-2 text-sm">Error: {rowErr}</p>
              ) : null}
            </section>
          ) : null}

          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="auto-matched-section"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Auto-matched ({autoMatched.length})
              </h2>
              {autoMatched.length > 0 ? (
                <form action={applyAllAutoMatches}>
                  <button
                    type="submit"
                    className="rounded-md border border-brand-navy bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    data-testid="apply-all-auto-matches"
                  >
                    Apply all auto-matches
                  </button>
                </form>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-600">
              These rows have exactly one Pratik candidate. Apply mints
              a fresh PI number per MOU academic year and entity.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Payment
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      School
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Received (Rs)
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Matched candidate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {autoMatched.slice(0, 60).map((r) => (
                    <tr
                      key={r.payment.id}
                      className="border-b border-border"
                      data-testid={`auto-row-${r.payment.id}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.payment.id}</td>
                      <td className="px-3 py-2 text-sm">{r.payment.schoolName}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm">
                        {formatRs(r.payment.receivedAmount)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.candidate.candidateId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {autoMatched.length > 60 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing first 60 of {autoMatched.length}.
                </p>
              ) : null}
            </div>
          </section>

          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="needs-review-section"
          >
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Needs review ({needsReview.length})
            </h2>
            <p className="mt-2 text-xs text-slate-600">
              These rows have 2+ Pratik candidates. Pick the right one
              from the dropdown OR type a manual PI number, then apply.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Payment
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      School / Amount
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Candidates
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Manual PI / Apply
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {needsReview.map((r) => (
                    <tr
                      key={r.payment.id}
                      className="border-b border-border align-top"
                      data-testid={`needs-row-${r.payment.id}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.payment.id}</td>
                      <td className="px-3 py-2 text-xs">
                        <div>{r.payment.schoolName}</div>
                        <div className="font-mono text-muted-foreground">{formatRs(r.payment.receivedAmount)}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <ul className="space-y-1">
                          {r.candidates.map((c) => (
                            <li key={c.candidateId}>
                              {c.candidateId} ({c.monthRaw ?? 'no month'})
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        <form
                          action={applySingleRow}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <input
                            type="hidden"
                            name="paymentId"
                            value={r.payment.id}
                          />
                          <input
                            type="hidden"
                            name="matchNotes"
                            value={`needs-review: ${r.candidates.length} candidates`}
                          />
                          <input
                            type="text"
                            name="manualPi"
                            placeholder="e.g. MTPL/UP/25-26/0001"
                            className="rounded border border-border bg-card px-2 py-1 text-xs"
                            data-testid={`needs-manual-input-${r.payment.id}`}
                          />
                          <button
                            type="submit"
                            className="rounded border border-brand-navy bg-brand-navy px-2 py-1 text-xs font-semibold text-white"
                            data-testid={`needs-apply-${r.payment.id}`}
                          >
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="impossible-section"
          >
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Impossible (no Pratik candidate) ({impossible.length})
            </h2>
            <p className="mt-2 text-xs text-slate-600">
              These rows have no Pratik candidate at the configured
              tolerance. Pranav can type a manual PI number for each,
              or leave them as-is.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Payment
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      School
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Received
                    </th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Manual PI / Apply
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {impossible.map((r) => (
                    <tr
                      key={r.payment.id}
                      className="border-b border-border align-top"
                      data-testid={`impossible-row-${r.payment.id}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.payment.id}</td>
                      <td className="px-3 py-2 text-xs">{r.payment.schoolName}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatRs(r.payment.receivedAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <form
                          action={applySingleRow}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <input
                            type="hidden"
                            name="paymentId"
                            value={r.payment.id}
                          />
                          <input
                            type="hidden"
                            name="matchNotes"
                            value="impossible: no Pratik candidate; manual entry"
                          />
                          <input
                            type="text"
                            name="manualPi"
                            placeholder="e.g. MTPL/UP/25-26/0001"
                            className="rounded border border-border bg-card px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded border border-brand-navy bg-brand-navy px-2 py-1 text-xs font-semibold text-white"
                          >
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
