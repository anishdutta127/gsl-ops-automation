/*
 * /finance/payments/unmatched (Gate 2 Step 6).
 *
 * Mirrors gsl-mou-system's /payments/unmatched. Sortable list of
 * PaymentLog rows where unmatched=true. Each row has a "Re-attempt
 * match" link that opens /finance/payments with the row's data
 * pre-filled so Finance can complete the match without re-typing.
 *
 * Default sort: most recent first. Optional sort query-string:
 * sort=amount-desc | amount-asc | date-desc (default) | date-asc |
 * reference-asc.
 *
 * Permission gate: canAccessFinance.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { PaymentLog } from '@/lib/types'
// P4 batch 3a (2026-05-24): live repo reads.
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance, canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { formatRs, formatDate } from '@/lib/format'
import { opsButtonClass } from '@/components/ops/OpsButton'

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'reference-asc'

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'date-desc', label: 'Newest first' },
  { key: 'date-asc', label: 'Oldest first' },
  { key: 'amount-desc', label: 'Amount: high to low' },
  { key: 'amount-asc', label: 'Amount: low to high' },
  { key: 'reference-asc', label: 'Bank reference A-Z' },
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickSort(raw: string | undefined): SortKey {
  if (!raw) return 'date-desc'
  const found = SORT_OPTIONS.find((s) => s.key === raw)
  return found ? found.key : 'date-desc'
}

function sortLogs(logs: PaymentLog[], sort: SortKey): PaymentLog[] {
  const copy = logs.slice()
  switch (sort) {
    case 'date-asc':
      return copy.sort((a, b) => a.date.localeCompare(b.date))
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount)
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount)
    case 'reference-asc':
      return copy.sort((a, b) => (a.reference ?? '').localeCompare(b.reference ?? ''))
    case 'date-desc':
    default:
      return copy.sort((a, b) => b.date.localeCompare(a.date))
  }
}

export default async function UnmatchedPaymentsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpayments%2Funmatched')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const sp = await searchParams
  const sort = pickSort(typeof sp.sort === 'string' ? sp.sort : undefined)
  const canLog = canEditFinanceData(user)
  const parkedId = typeof sp.parked === 'string' ? sp.parked : null
  const flashSchool = typeof sp.school === 'string' ? sp.school : null

  const [allLogs, allSalesTeam] = await Promise.all([
    paymentLogRepo.findAll() as Promise<PaymentLog[]>,
    salesTeamRepo.findAll(),
  ])

  const unmatched = sortLogs(allLogs.filter((l) => l.unmatched), sort)
  const salesById = new Map(allSalesTeam.map((s) => [s.id, s]))

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Unmatched payments"
          subtitle={`${unmatched.length} parked payment${unmatched.length === 1 ? '' : 's'} waiting for an instalment match. Click "Re-attempt match" on any row to open the matcher pre-filled.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'Unmatched' },
          ]}
          actions={
            <>
              {canLog ? (
                <Link
                  href="/finance/payments/new"
                  className={opsButtonClass({ variant: 'action', size: 'md' })}
                  data-testid="payment-log-new-cta"
                >
                  <Plus aria-hidden className="size-4" /> Log payment
                </Link>
              ) : null}
              <Link href="/finance/payments" className={opsButtonClass({ variant: 'outline', size: 'md' })}>
                Match a payment
              </Link>
            </>
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          {parkedId ? (
            <p
              role="status"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
              data-testid="payment-parked-flash"
            >
              Payment logged for {flashSchool ?? 'this school'}. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          <form
            method="GET"
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
          >
            <div>
              <label htmlFor="sort" className="block text-xs font-medium text-brand-navy">
                Sort
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className="mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={opsButtonClass({ variant: 'primary', size: 'md' })}>
              Apply
            </button>
          </form>

          {unmatched.length === 0 ? (
            <div className="rounded-md border border-border bg-card">
              <EmptyState
                title="No unmatched payments"
                description="When you park a payment as unmatched it shows up here until you reconcile it."
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium tabular-nums">Date</th>
                    <th className="px-3 py-2.5 font-medium tabular-nums text-right">Amount</th>
                    <th className="px-3 py-2.5 font-medium">Mode</th>
                    <th className="px-3 py-2.5 font-medium">Reference</th>
                    <th className="px-3 py-2.5 font-medium">Narration</th>
                    <th className="px-3 py-2.5 font-medium">Logged by</th>
                    <th className="px-3 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {unmatched.map((p) => {
                    const sp = p.salesPersonId ? salesById.get(p.salesPersonId) ?? null : null
                    const link =
                      `/finance/payments?amount=${encodeURIComponent(String(p.amount))}` +
                      `&date=${encodeURIComponent(p.date)}` +
                      `&ref=${encodeURIComponent(p.reference ?? '')}` +
                      `&narration=${encodeURIComponent(p.narration ?? '')}`
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2.5 tabular-nums">{formatDate(p.date)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-brand-navy">
                          {formatRs(p.amount, { bare: true })}
                        </td>
                        <td className="px-3 py-2.5 text-brand-navy">{p.mode}</td>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-brand-navy">
                          {p.reference ?? '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-brand-navy">{p.narration ?? '-'}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {p.loggedBy}
                          {sp ? <span className="block text-muted-foreground">via {sp.name}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Link
                              href={`/finance/payments/match/${encodeURIComponent(p.id)}`}
                              className="inline-flex min-h-9 items-center rounded-md bg-brand-teal px-2.5 py-1 text-xs font-semibold text-brand-navy hover:opacity-90"
                              data-testid={`match-to-instalment-${p.id}`}
                            >
                              Match to instalment
                            </Link>
                            <Link
                              href={link}
                              className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
                            >
                              Re-attempt PI match
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section className="rounded-md border border-border bg-card p-4 text-xs text-brand-navy">
            <h2 className="mb-1 font-heading text-sm font-semibold text-brand-navy">
              How matching works
            </h2>
            <p className="text-muted-foreground">
              The matcher filters open instalments by amount tolerance and date window, then ranks the most likely matches. When you confirm a match, the payment moves out of this queue and into the corresponding MOU&apos;s instalment record. Writes drain into the canonical JSON files within ~5 minutes via the GitHub Actions cron.
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
