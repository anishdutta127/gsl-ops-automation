/*
 * /finance/payments (Gate 2 Step 6).
 *
 * Bank-entry matcher. Mirrors gsl-mou-system's /reconcile + /payments
 * surfaces : operator enters amount, date, mode, bank reference and
 * narration; the migrated `mouSystem/reconcile.ts findCandidates`
 * returns ranked PI candidates; Confirm writes Payment + PaymentLog +
 * MOU audit atomically through the queue.
 *
 * Permission gate: canAccessFinance (Finance + Admin + Leadership
 * read-only in production lockdown). Write-time canEditFinanceData
 * gating happens inside confirmMatch / parkUnmatched.
 *
 * Prefill: a row from /finance/payments/unmatched links here with
 * amount + date + reference + narration query-string params so
 * Finance can re-attempt the match without re-typing.
 *
 * Recent matched + parked-queue lists appear below the matcher for
 * orientation (last 20 matched, count of parked) so Finance can see
 * the queue state without leaving the page.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Upload } from 'lucide-react'
import type {
  MOU,
  Payment,
  PaymentLog,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance, canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { formatRs, formatDate } from '@/lib/format'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { PaymentMatcher } from './PaymentMatcher'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allLogs = paymentLogsJson as unknown as PaymentLog[]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FinancePaymentsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpayments')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const sp = await searchParams
  const prefill = {
    amount: typeof sp.amount === 'string' ? sp.amount : '',
    date: typeof sp.date === 'string' ? sp.date : '',
    reference: typeof sp.ref === 'string' ? sp.ref : '',
    narration: typeof sp.narration === 'string' ? sp.narration : '',
  }
  const hasPrefill =
    prefill.amount !== '' || prefill.date !== '' || prefill.reference !== '' || prefill.narration !== ''

  const canLog = canEditFinanceData(user)
  const loggedId = typeof sp.logged === 'string' ? sp.logged : null
  const parkedId = typeof sp.parked === 'string' ? sp.parked : null
  const flashSchool = typeof sp.school === 'string' ? sp.school : null

  const unmatchedCount = allLogs.filter((l) => l.unmatched).length
  const recentMatched = allLogs
    .filter((l) => !l.unmatched)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Match a payment"
          subtitle="Enter what hit the bank and we will rank candidate Proforma Invoices by match likelihood."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Payments' },
          ]}
          actions={
            canLog ? (
              <>
                <Link
                  href="/finance/payments/new"
                  className={opsButtonClass({ variant: 'action', size: 'md' })}
                  data-testid="payment-log-new-cta"
                >
                  <Plus aria-hidden className="size-4" /> Log payment
                </Link>
                <Link
                  href="/finance/payments/bulk"
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                  data-testid="payment-bulk-cta"
                >
                  <Upload aria-hidden className="size-4" /> Bulk upload
                </Link>
              </>
            ) : null
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6">
          {loggedId ? (
            <p
              role="status"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
              data-testid="payment-logged-flash"
            >
              Payment logged for {flashSchool ?? 'this school'}. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          {parkedId ? (
            <p
              role="status"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
              data-testid="payment-parked-flash"
            >
              Payment logged for {flashSchool ?? 'this school'}. Will reflect everywhere within ~5 minutes. The entry parked for manual matching against the school&rsquo;s open instalments.
            </p>
          ) : null}
          <PaymentMatcher
            payments={allPayments}
            mous={allMous}
            prefill={hasPrefill ? prefill : undefined}
          />

          <section
            aria-labelledby="recent-matched-heading"
            className="rounded-md border border-border bg-card p-4 sm:p-6"
          >
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2
                id="recent-matched-heading"
                className="font-heading text-sm font-semibold text-brand-navy"
              >
                Recent matched
              </h2>
              <Link
                href="/finance/payments/unmatched"
                className="text-xs font-semibold text-violet-700 hover:underline"
              >
                Unmatched queue ({unmatchedCount}) -&gt;
              </Link>
            </header>
            {recentMatched.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments matched yet. Use the matcher above to log against an instalment.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentMatched.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-brand-navy">
                        {formatRs(log.amount)} · {log.mode}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(log.date)}
                        {log.reference ? ` · Ref ${log.reference}` : ''}
                        {log.matchedInstallmentIds.length > 0
                          ? ` · Matched to ${log.matchedInstallmentIds.length} instalment${log.matchedInstallmentIds.length === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
