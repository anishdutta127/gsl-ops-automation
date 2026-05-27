/*
 * /finance/payments/match/[paymentLogId]
 *
 * Instalment repository for matching an unmatched payment.
 * Shows ALL instalments across all active MOUs (regardless of PI
 * status). Filterable by school name, status, amount range.
 * Match action calls recordPartialReceipt on the target instalment
 * and updates the PaymentLog.
 */

import { notFound, redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { MOU, Payment, PaymentLog } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { BackButton } from '@/components/ops/BackButton'
import { formatRs, formatDate } from '@/lib/format'
import { opsButtonClass } from '@/components/ops/OpsButton'

interface PageProps {
  params: Promise<{ paymentLogId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function computeDrift(mou: MOU, payment: Payment, totalInstalments: number): number | null {
  if (!mou.studentsActual || !mou.spWithTax || totalInstalments <= 0) return null
  const implied = Math.round((mou.studentsActual * mou.spWithTax) / totalInstalments)
  const diff = Math.abs(payment.expectedAmount - implied)
  return diff > 1 ? implied : null
}

export default async function MatchPaymentPage({ params, searchParams }: PageProps) {
  const { paymentLogId } = await params
  const sp = (await searchParams) ?? {}
  const schoolFilter = typeof sp.school === 'string' ? sp.school.toLowerCase() : ''
  const statusFilter = typeof sp.status === 'string' ? sp.status : 'unpaid'
  const matched = typeof sp.matched === 'string' ? sp.matched : null

  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!canEditFinanceData(user)) redirect('/finance/payments')

  const [allMous, allPayments, allLogs] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    paymentLogRepo.findAll() as Promise<PaymentLog[]>,
  ])

  const log = allLogs.find((l) => l.id === paymentLogId)
  if (!log) notFound()

  const allocatedFromAudit = (log.auditLog ?? [])
    .filter((e) => e.action === 'payment-matched')
    .reduce((s, e) => s + Number((e.after as Record<string, unknown> | undefined)?.amount ?? 0), 0)
  const remainingToMatch = Math.max(0, log.amount - allocatedFromAudit)

  const activeMous = allMous.filter(
    (m) => m.cohortStatus === 'active' && m.status === 'Active',
  )
  const mouById = new Map(activeMous.map((m) => [m.id, m]))

  const activeInstalments = allPayments
    .filter((p) => mouById.has(p.mouId))
    .sort((a, b) => a.mouId.localeCompare(b.mouId) || a.instalmentSeq - b.instalmentSeq)

  const filtered = activeInstalments.filter((p) => {
    const mou = mouById.get(p.mouId)
    if (!mou) return false
    if (schoolFilter && !mou.schoolName.toLowerCase().includes(schoolFilter)) return false
    if (statusFilter === 'unpaid') {
      const paid = p.receivedAmount ?? 0
      if (paid >= p.expectedAmount) return false
    }
    return true
  })

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Match payment to instalment"
          breadcrumb={[
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'Unmatched', href: '/finance/payments/unmatched' },
            { label: `Match ${log.id}` },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          <BackButton />

          {matched ? (
            <p role="status" className="rounded-md border border-signal-ok bg-card p-3 text-sm">
              Matched Rs {matched} to instalment. Receipt recorded.
            </p>
          ) : null}

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-heading text-sm font-semibold text-brand-navy">
              Bank receipt
            </h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Amount</dt>
                <dd className="font-semibold">{formatRs(log.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Date</dt>
                <dd>{formatDate(log.date)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Reference</dt>
                <dd>{log.reference ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Remaining</dt>
                <dd className="font-semibold text-brand-navy">{formatRs(remainingToMatch)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 font-heading text-sm font-semibold text-brand-navy">
              Instalment repository ({filtered.length} rows)
            </h2>
            <form method="GET" className="mb-3 flex flex-wrap gap-2">
              <input type="hidden" name="paymentLogId" value={paymentLogId} />
              <input
                name="school"
                placeholder="Search school name"
                defaultValue={schoolFilter}
                className="rounded border border-border px-2 py-1 text-sm"
              />
              <select name="status" defaultValue={statusFilter} className="rounded border border-border px-2 py-1 text-sm">
                <option value="unpaid">Unpaid / Partial only</option>
                <option value="all">All statuses</option>
              </select>
              <button type="submit" className={opsButtonClass({ variant: 'outline', size: 'sm' })}>
                Filter
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">School</th>
                    <th className="px-2 py-2 font-medium">MOU</th>
                    <th className="px-2 py-2 font-medium">Instalment</th>
                    <th className="px-2 py-2 font-medium">Due</th>
                    <th className="px-2 py-2 font-medium text-right">Expected</th>
                    <th className="px-2 py-2 font-medium text-right">Paid</th>
                    <th className="px-2 py-2 font-medium text-right">Balance</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">PI</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => {
                    const mou = mouById.get(p.mouId)!
                    const totalInsts = activeInstalments.filter((x) => x.mouId === p.mouId).length
                    const driftImplied = computeDrift(mou, p, totalInsts)
                    const paid = p.receivedAmount ?? 0
                    const balance = Math.max(0, p.expectedAmount - paid)
                    return (
                      <tr key={p.id} className="align-top">
                        <td className="px-2 py-2">{mou.schoolName}</td>
                        <td className="px-2 py-2 font-mono text-xs">{mou.id}</td>
                        <td className="px-2 py-2">{p.instalmentLabel}</td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">
                          {p.dueDateIso ? formatDate(p.dueDateIso) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatRs(p.expectedAmount)}
                          {driftImplied !== null ? (
                            <span className="ml-1 block text-[10px] text-amber-700">
                              <AlertTriangle aria-hidden className="mr-0.5 inline size-3" />
                              current contract implies {formatRs(driftImplied)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {paid > 0 ? formatRs(paid) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatRs(balance)}</td>
                        <td className="px-2 py-2 text-xs">{p.status}</td>
                        <td className="px-2 py-2 text-xs font-mono">{p.piNumber ?? 'no PI'}</td>
                        <td className="px-2 py-2">
                          {balance > 0 && remainingToMatch > 0 ? (
                            <form method="POST" action="/api/finance/payments/match-to-instalment">
                              <input type="hidden" name="paymentLogId" value={log.id} />
                              <input type="hidden" name="instalmentId" value={p.id} />
                              <input
                                type="number"
                                name="amount"
                                defaultValue={Math.min(remainingToMatch, balance)}
                                min={1}
                                max={remainingToMatch}
                                step={1}
                                className="mb-1 w-24 rounded border border-border px-1 py-0.5 text-xs"
                              />
                              <button
                                type="submit"
                                className={opsButtonClass({ variant: 'primary', size: 'sm' })}
                              >
                                Match
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {balance <= 0 ? 'fully paid' : 'no remaining'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
