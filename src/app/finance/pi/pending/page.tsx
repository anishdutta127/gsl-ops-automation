/*
 * /finance/pi/pending (Gate 4 Step 6 carry-forward from Gate 3.6).
 *
 * Shortlists installments that need a PI generated soon:
 *   - Payment.status not in {Paid, Received}
 *   - Payment.piGeneratedAt is null (no PI raised yet)
 *   - Due within next 30 days OR already past due
 *   - Underlying MOU is Active
 *   - Underlying School is active
 *   - MOU has a billing block populated (prerequisite for PI render)
 *
 * Each row carries an inline "Generate PI" CTA that routes to the
 * existing /mous/[id]/installments page, which then drills to the
 * per-installment generate-PI flow. The CTA is gated by
 * isPiParallelBuildLocked() and shows the lock copy when set.
 *
 * Replaces the /mous indirection that the consolidated landing Zone 4
 * "Generate PI" button previously used.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowRight, Receipt } from 'lucide-react'
// P4 batch 3a (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'
import {
  isPiParallelBuildLocked,
  parallelBuildLockMessage,
} from '@/lib/pi/parallelBuildLock'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { formatRs, formatDate } from '@/lib/format'
import { computePendingPi } from '@/lib/finance/computePendingPi'

export default async function PendingPiPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpi%2Fpending')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const [allMous, allPayments, allSchools] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    schoolRepo.findAll(),
  ])

  const now = new Date()
  const rows = computePendingPi({
    mous: allMous,
    schools: allSchools,
    payments: allPayments,
    now,
  })
  const piLocked = isPiParallelBuildLocked()

  return (
    <>
      <TopNav currentPath="/finance" />
      <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
        <PageHeader
          title="Pending PIs"
          subtitle="Installments due within 30 days or already overdue, awaiting PI generation."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/dashboard/finance' },
            { label: 'Pending PIs' },
          ]}
        />

        {piLocked ? (
          <div
            role="alert"
            data-testid="pi-lock-banner"
            className="mt-4 flex items-start gap-2 rounded-md border border-signal-attention bg-signal-attention/10 p-3 text-sm text-signal-attention"
          >
            <AlertCircle aria-hidden className="size-4 shrink-0" />
            <span>{parallelBuildLockMessage()}</span>
          </div>
        ) : null}

        <section
          aria-labelledby="pending-pi-heading"
          data-testid="pending-pi-list"
          className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2
              id="pending-pi-heading"
              className="font-heading text-base font-semibold text-brand-navy"
            >
              {rows.length} installment{rows.length === 1 ? '' : 's'} pending PI
            </h2>
          </header>

          {rows.length === 0 ? (
            <div data-testid="pending-pi-empty">
              <EmptyState
                icon={<Receipt aria-hidden className="size-6" />}
                title="No installments need a PI right now"
                description="Check back when the next installment window opens."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const ctaDisabled = piLocked || !row.hasBillingBlock
                return (
                  <li
                    key={row.paymentId}
                    data-testid={`pending-pi-row-${row.paymentId}`}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link
                          href={`/mous/${row.mouId}`}
                          className="font-medium text-brand-navy hover:underline"
                        >
                          {row.schoolName}
                        </Link>
                        <span className="text-xs text-slate-500">
                          {row.installmentLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-3 text-xs text-slate-600">
                        <span>
                          Due {row.dueDateIso ? formatDate(row.dueDateIso) : '-'}
                        </span>
                        <span className="font-semibold text-brand-navy">
                          {formatRs(row.expectedAmount)}
                        </span>
                        {row.isOverdue ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-signal-alert/10 px-2 py-0.5 text-signal-alert"
                            data-testid={`pending-pi-overdue-${row.paymentId}`}
                          >
                            <AlertCircle aria-hidden className="size-3" />
                            Overdue {Math.abs(row.daysUntilDue ?? 0)}d
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            in {row.daysUntilDue}d
                          </span>
                        )}
                        {!row.hasBillingBlock ? (
                          <span
                            className="text-amber-700"
                            data-testid={`pending-pi-no-billing-${row.paymentId}`}
                          >
                            Billing block missing
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {ctaDisabled ? (
                      <span
                        data-testid={`pending-pi-cta-disabled-${row.paymentId}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500"
                        aria-disabled="true"
                        title={
                          piLocked
                            ? 'PI generation is locked'
                            : 'Billing block missing on MOU'
                        }
                      >
                        Generate PI
                      </span>
                    ) : (
                      <Link
                        href={row.generateHref}
                        data-testid={`pending-pi-cta-${row.paymentId}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        Generate PI <ArrowRight aria-hidden className="size-3" />
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
