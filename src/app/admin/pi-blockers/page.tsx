/*
 * /admin/pi-blockers (Phase 6B cutover diagnostics).
 *
 * Admin-only read-only audit of every code path that blocks PI
 * generation. Surfaces TESTING_OPEN_ACCESS bypass status next to each
 * blocker so the reviewer can confirm at a glance that finance-
 * correctness invariants (entity-prefix, GSTIN policy, PAN policy)
 * are not opened up by the testing toggle. Mirrors PI_BLOCKERS.md.
 */

import { notFound, redirect } from 'next/navigation'
import type { Payment } from '@/lib/types'
import { paymentRepo } from '@/lib/db/repos/payment'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  PI_BLOCKERS,
  type BypassedByTestingOpenAccess,
  type PiBlocker,
} from '@/lib/pi/blockers'

interface PiMissingRow {
  paymentId: string
  mouId: string | null
  schoolName: string | null
  receivedAmount: number
  instalmentSeq: number
}

function piMissingBackfillCandidates(allPayments: Payment[]): PiMissingRow[] {
  const out: PiMissingRow[] = []
  for (const p of allPayments) {
    if (!((p.receivedAmount ?? 0) > 0)) continue
    if (p.piNumber && String(p.piNumber).trim() !== '') continue
    out.push({
      paymentId: p.id,
      mouId: p.mouId,
      schoolName: p.schoolName,
      receivedAmount: p.receivedAmount ?? 0,
      instalmentSeq: p.instalmentSeq,
    })
  }
  return out
}

const BYPASS_LABEL: Record<BypassedByTestingOpenAccess, string> = {
  no: 'No',
  yes: 'Yes',
  'not-applicable': 'N/A',
}

const BYPASS_CLASS: Record<BypassedByTestingOpenAccess, string> = {
  no: 'text-signal-ok',
  yes: 'text-signal-warning',
  'not-applicable': 'text-muted-foreground',
}

function groupByCategory(blockers: PiBlocker[]) {
  const out = new Map<string, PiBlocker[]>()
  for (const b of blockers) {
    const arr = out.get(b.category) ?? []
    arr.push(b)
    out.set(b.category, arr)
  }
  return out
}

const CATEGORY_ORDER: PiBlocker['category'][] = [
  'cutover',
  'auth',
  'access',
  'validation',
  'data',
  'finance-correctness',
  'system',
]

const CATEGORY_LABEL: Record<PiBlocker['category'], string> = {
  cutover: 'Cutover lock',
  auth: 'Authentication',
  access: 'Access (department or role)',
  validation: 'Payload validation',
  data: 'Data integrity',
  'finance-correctness': 'Finance correctness',
  system: 'System / infrastructure',
}

export default async function PiBlockersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fpi-blockers')
  if (!canManageUsers(user)) notFound()

  const grouped = groupByCategory(PI_BLOCKERS)
  const financeCorrectnessIncorrectlyBypassed = PI_BLOCKERS.filter(
    (b) => b.category === 'finance-correctness' && b.bypassed === 'yes',
  )
  const allPayments = await paymentRepo.findAll()
  const backfillCandidates = piMissingBackfillCandidates(allPayments)

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="PI blockers audit"
          subtitle="Every code path that prevents a PI from being issued. Read-only."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'PI blockers' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <section className="rounded-md border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Summary
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {PI_BLOCKERS.length} blockers documented across both PI
              surfaces (per-MOU PI generation and VEX PI creation).
              Bypass status indicates whether{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                TESTING_OPEN_ACCESS=true
              </code>{' '}
              allows a user past that specific check.
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Finance-correctness checks (entity-prefix, GSTIN policy,
              PAN policy) must NOT bypass under TESTING_OPEN_ACCESS.
              Status:{' '}
              {financeCorrectnessIncorrectlyBypassed.length === 0 ? (
                <span
                  className="font-semibold text-signal-ok"
                  data-testid="finance-correctness-ok"
                >
                  PASS. No finance-correctness blocker is bypassed by
                  TESTING_OPEN_ACCESS.
                </span>
              ) : (
                <span
                  className="font-semibold text-signal-alert"
                  data-testid="finance-correctness-fail"
                >
                  FAIL.{' '}
                  {financeCorrectnessIncorrectlyBypassed
                    .map((b) => b.id)
                    .join(', ')}{' '}
                  is bypassed. Investigate.
                </span>
              )}
            </p>
          </section>

          <section
            className="rounded-md border border-border bg-card p-6"
            data-testid="pi-missing-backfill"
          >
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              PI-missing backfill candidates
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              Paid payment rows (receivedAmount &gt; 0) with no piNumber
              set. These came in via the Pratik / Pranav Excel imports
              where the PI column was blank on the source sheet. They
              are NOT blocked by code; the system can generate fresh
              PIs against any of these instalments and the counter
              advances normally. Surfacing here so Pranav can backfill
              at his pace.
            </p>
            <p
              className="mt-3 text-sm font-semibold text-brand-navy"
              data-testid="pi-missing-count"
            >
              {backfillCandidates.length} row(s) outstanding.
            </p>
            {backfillCandidates.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full table-auto border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Payment id
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        MOU
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        School
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Instalment
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Received (Rs)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {backfillCandidates.slice(0, 50).map((row) => (
                      <tr
                        key={row.paymentId}
                        className="border-b border-border align-top"
                        data-testid={`pi-missing-row-${row.paymentId}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                          {row.paymentId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                          {row.mouId ?? '(no mou)'}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">
                          {row.schoolName ?? '(no school)'}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">
                          {row.instalmentSeq}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-sm text-brand-navy">
                          {row.receivedAmount.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {backfillCandidates.length > 50 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Showing first 50 of {backfillCandidates.length}. The
                    full list is in src/data/payments.json (filter:
                    receivedAmount &gt; 0 AND piNumber is null).
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                No backfill candidates. Every paid payment row carries a
                PI number.
              </p>
            )}
          </section>

          {CATEGORY_ORDER.map((cat) => {
            const items = grouped.get(cat)
            if (!items || items.length === 0) return null
            return (
              <section
                key={cat}
                className="rounded-md border border-border bg-card p-6"
                data-testid={`pi-blockers-section-${cat}`}
              >
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  {CATEGORY_LABEL[cat]}
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full table-auto border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Surface
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Condition
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Message
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Source
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Testing bypass
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b) => (
                        <tr
                          key={b.id}
                          className="border-b border-border align-top"
                          data-testid={`pi-blocker-row-${b.id}`}
                        >
                          <td className="px-3 py-3 text-xs text-slate-700">
                            {b.surface}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">
                            <span className="block font-semibold text-brand-navy">
                              {b.id}
                            </span>
                            <span className="mt-1 block text-xs text-slate-600">
                              {b.condition}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {b.errorKey ? (
                              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                {b.errorKey}
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                (no error key)
                              </span>
                            )}
                            <p className="mt-1 text-xs text-slate-600">
                              {b.message}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-slate-700">
                            {b.source}
                          </td>
                          <td
                            className={`px-3 py-3 text-xs font-semibold ${BYPASS_CLASS[b.bypassed]}`}
                            data-testid={`pi-blocker-bypass-${b.id}`}
                          >
                            {BYPASS_LABEL[b.bypassed]}
                            <p className="mt-1 max-w-xs whitespace-normal text-xs font-normal text-slate-600">
                              {b.note}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      </main>
    </>
  )
}
