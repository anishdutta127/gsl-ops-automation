/*
 * /mous/[mouId]/installments (Step 5).
 *
 * Installment tracker. Lists every Payment row for the MOU
 * (payments.json filtered by mouId), columns matching gsl-mou-system's
 * InstallmentsPanel: Instalment label · due · expected · paid · status
 * · PI · students · actions.
 *
 * Per-role edit affordances:
 *   - Finance + Admin (`canEditFinanceData` / `canPerform('payment:reconcile')`)
 *     can record receipts via /mous/[mouId]/payment-receipt.
 *   - Sales + Admin (`canEditMOU`) can update PI sent date / recipient
 *     via the inline form.
 *   - Ops sees read-only.
 *
 * Inline-collapse pattern matches gsl-mou-system: the action row opens
 * directly beneath the cell. (See STEP5_QUESTIONS Q4.)
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, FileText, IndianRupee, ListPlus, Pencil, Send, Users } from 'lucide-react'
import type { MOU, Payment, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData, canEditMOU, canGeneratePI } from '@/lib/access'
import { deriveScheduleSummary } from '@/lib/mou/scheduleSummary'
import { formatInstalmentPercent } from '@/lib/mou/instalmentPercent'
import { formatRs, formatDate } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function paymentStatusTone(s: Payment['status']): 'ok' | 'attention' | 'alert' | 'neutral' | 'navy' | 'teal' {
  switch (s) {
    case 'Received':
    case 'Paid':
      return 'ok'
    case 'Pending':
      return 'neutral'
    case 'Overdue':
      return 'alert'
    case 'Partial':
      return 'attention'
    case 'Due Soon':
      return 'attention'
    case 'PI Sent':
      return 'navy'
    default:
      return 'neutral'
  }
}

export default async function InstallmentsPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}
  const markedPaid = typeof sp['marked-paid'] === 'string' ? sp['marked-paid'] : null
  const markedPartial = typeof sp['marked-partial'] === 'string' ? sp['marked-partial'] : null
  const edited = typeof sp.edited === 'string' ? sp.edited : null
  const flashAction = markedPaid !== null
    ? 'Mark Paid'
    : markedPartial !== null
      ? 'Partial'
      : edited !== null
        ? 'Edit'
        : null
  const flashId = markedPaid ?? markedPartial ?? edited
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!user) notFound()

  const installments = allPayments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  const totalExpected = installments.reduce((s, p) => s + p.expectedAmount, 0)
  const totalReceived = installments.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)

  const canRecordReceipt = canEditFinanceData(user)
  const canEditPiSent = canEditMOU(user)
  const canGenPi = canGeneratePI(user)
  const canSaveSchedule = canEditMOU(user) || canEditFinanceData(user)
  const isMouSigned = mou.status !== 'Pending Signature' && mou.status !== 'Draft'

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} · Instalments`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Instalments' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {flashAction && flashId ? (
            <p
              role="status"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
              data-testid="installment-action-flash"
            >
              {flashAction} recorded for instalment <strong>{flashId}</strong>. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          <DetailHeaderCard
            title={mou.id}
            subtitle={`${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''} · ${installments.length} instalments`}
            metadata={[
              { label: 'Total expected', value: formatRs(totalExpected) },
              { label: 'Total received', value: formatRs(totalReceived) },
              { label: 'Balance', value: formatRs(Math.max(0, totalExpected - totalReceived)) },
              {
                label: 'Schedule',
                value:
                  deriveScheduleSummary(installments, mou.contractValue, mou.paymentSchedule) ||
                  'not set',
              },
            ]}
          />

          {installments.length === 0 ? (
            <div
              className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-card px-5 py-6 text-center text-sm"
              data-testid="no-installments"
            >
              <p className="text-muted-foreground">
                No instalments yet. They&apos;ll appear here once this MOU is Signed and a payment
                schedule is set.
              </p>
              {isMouSigned && canSaveSchedule ? (
                <Link
                  href={`/mous/${mou.id}/installments/schedule-edit`}
                  className={opsButtonClass({ variant: 'primary', size: 'md' })}
                  data-testid="empty-state-set-schedule"
                >
                  Set payment schedule {'→'}
                </Link>
              ) : null}
              {!isMouSigned ? (
                <p className="text-xs text-muted-foreground" data-testid="empty-state-unsigned-hint">
                  Sign the MOU first to enable scheduling.{' '}
                  <Link
                    href={`/mous/${mou.id}`}
                    className="text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Go to MOU detail {'→'}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Instalment</th>
                    <th className="px-3 py-2.5 font-medium">Due</th>
                    <th className="px-3 py-2.5 font-medium text-right">%</th>
                    <th className="px-3 py-2.5 font-medium text-right">Expected</th>
                    <th className="px-3 py-2.5 font-medium text-right">Paid</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">PI</th>
                    <th className="px-3 py-2.5 font-medium">Students</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {installments.map((p) => {
                    const balance = Math.max(0, p.expectedAmount - (p.receivedAmount ?? 0))
                    const paid = p.receivedAmount ?? 0
                    return (
                      <tr key={p.id} className="align-top">
                        <td className="px-3 py-3 text-foreground">
                          <span className="font-medium">{p.instalmentLabel}</span>
                          {p.description ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">{p.description}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-muted-foreground">
                          {p.dueDateIso ? formatDate(p.dueDateIso) : (p.dueDateRaw ?? '-')}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {formatInstalmentPercent(p.expectedAmount, mou.contractValue) ?? '-'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatRs(p.expectedAmount)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {paid > 0 ? formatRs(paid) : '-'}
                          {paid > 0 && paid < p.expectedAmount ? (
                            <span className="ml-1 block text-[11px] text-signal-alert">
                              {formatRs(balance)} open
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip
                            tone={paymentStatusTone(p.status)}
                            label={p.status}
                            withDot={false}
                          />
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                          {p.piNumber ? (
                            <>
                              <span className="block font-mono">{p.piNumber}</span>
                              {p.piSentDate ? (
                                <span className="block text-[11px] text-muted-foreground">
                                  Sent {formatDate(p.piSentDate)}
                                  {p.piSentTo ? ` → ${p.piSentTo}` : ''}
                                </span>
                              ) : null}
                            </>
                          ) : canGenPi ? (
                            <Link
                              href={`/mous/${mou.id}/pi`}
                              className="text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            >
                              Generate PI
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{'-'}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                          {p.studentCountActual !== null
                            ? p.studentCountActual.toLocaleString('en-IN')
                            : mou.studentsActual !== null
                              ? mou.studentsActual.toLocaleString('en-IN')
                              : '-'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {canEditPiSent ? (
                              <Link
                                href={`/mous/${mou.id}/installments/${encodeURIComponent(p.id)}/mark-pi-sent`}
                                title="Mark PI sent"
                                aria-label="Mark PI sent"
                                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                data-testid={`action-mark-pi-sent-${p.id}`}
                              >
                                <Send aria-hidden className="size-4" />
                              </Link>
                            ) : null}
                            {canRecordReceipt ? (
                              <>
                                <Link
                                  href={`/mous/${mou.id}/installments/${encodeURIComponent(p.id)}/mark-paid`}
                                  title="Mark as Paid"
                                  aria-label="Mark as Paid"
                                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                  data-testid={`action-mark-paid-${p.id}`}
                                >
                                  <CheckCircle2 aria-hidden className="size-4" />
                                </Link>
                                <Link
                                  href={`/mous/${mou.id}/installments/${encodeURIComponent(p.id)}/mark-partial`}
                                  title="Mark as Partial Paid"
                                  aria-label="Mark as Partial Paid"
                                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                  data-testid={`action-mark-partial-${p.id}`}
                                >
                                  <IndianRupee aria-hidden className="size-4" />
                                </Link>
                                <Link
                                  href={`/mous/${mou.id}/installments/${encodeURIComponent(p.id)}/edit`}
                                  title="Edit instalment"
                                  aria-label="Edit instalment"
                                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                  data-testid={`action-edit-installment-${p.id}`}
                                >
                                  <Pencil aria-hidden className="size-4" />
                                </Link>
                                <Link
                                  href={`/finance/payments/new?schoolId=${encodeURIComponent(mou.schoolId)}&mouId=${encodeURIComponent(mou.id)}&paymentId=${encodeURIComponent(p.id)}`}
                                  title="Log payment against this instalment"
                                  aria-label="Log payment against this instalment"
                                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                  data-testid={`action-log-via-finance-${p.id}`}
                                >
                                  <ListPlus aria-hidden className="size-4" />
                                </Link>
                              </>
                            ) : null}
                            {canEditPiSent ? (
                              <Link
                                href={`/mous/${mou.id}/actuals`}
                                title="Update Actual student count"
                                aria-label="Update Actual student count"
                                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                                data-testid={`action-update-students-${p.id}`}
                              >
                                <Users aria-hidden className="size-4" />
                              </Link>
                            ) : null}
                            {canGenPi ? (
                              <Link
                                href={`/mous/${mou.id}/pi`}
                                title="Generate PI"
                                aria-label="Generate PI"
                                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 text-foreground hover:border-brand-navy hover:text-brand-navy"
                              >
                                <FileText aria-hidden className="size-4" />
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/mous/${mou.id}`}
              className={opsButtonClass({ variant: 'outline', size: 'md' })}
            >
              Back to MOU detail
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
