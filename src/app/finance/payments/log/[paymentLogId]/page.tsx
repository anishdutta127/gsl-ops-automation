/*
 * /finance/payments/log/[paymentLogId] (Pass 1 finance corrections).
 *
 * Manage a logged bank receipt. For a PARKED (unmatched) log, Finance can edit
 * its fields or void it (soft-delete tombstone). A log that still feeds a
 * balance is read-only here with guidance:
 *   - matched to an instalment -> unmatch the instalment first
 *   - feeding a VexPi -> use the VEX payment actions on the PI page
 *
 * Server actions gate via the mutation lib; this page only decides what to show.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { paymentRepo } from '@/lib/db/repos/payment'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'
import type { Payment, VexPi } from '@/lib/types'

interface PageProps {
  params: Promise<{ paymentLogId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to perform this action.',
  'log-not-found': 'Payment log not found.',
  'already-voided': 'This receipt is already voided.',
  'still-matched': 'This receipt is matched to an instalment. Unmatch the instalment first, then void.',
  'vex-payment': 'This is a VEX payment. Edit or void it from the VEX PI page.',
  'invalid-amount': 'Amount must be a positive number.',
  'invalid-date': 'Date must be yyyy-mm-dd.',
  'missing-reason': 'A reason of at least 10 characters is required.',
  'duplicate-reference': 'Another live receipt already has that reference and amount.',
  'invalid-action': 'Unknown action.',
}

const OK_MESSAGES: Record<string, string> = {
  edit: 'Receipt edited. Will reflect everywhere within ~5 minutes.',
  void: 'Receipt voided (soft-deleted). Kept for audit; excluded from balances.',
}

const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'
const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Zoho', 'Razorpay', 'Other'] as const

export default async function PaymentLogManagePage({ params, searchParams }: PageProps) {
  const { paymentLogId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/finance/payments/log/${paymentLogId}`)}`)

  const [log, allPayments, allPis] = await Promise.all([
    paymentLogRepo.findById(paymentLogId),
    paymentRepo.findAll() as unknown as Promise<Payment[]>,
    vexPiRepo.findAll() as unknown as Promise<VexPi[]>,
  ])
  if (!log) notFound()

  const okKey = typeof sp.ok === 'string' ? sp.ok : null
  const okMessage = okKey ? OK_MESSAGES[okKey] ?? `Action ${okKey} completed.` : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const canFinance = canEditFinanceData(user)
  const matchedIds = log.matchedInstallmentIds ?? []
  const linkedVexPi = allPis.find((p) => (p.paymentLogIds ?? []).includes(log.id))
  const isVoided = !!log.voidedAt
  const isMatched = matchedIds.length > 0
  const isVex = !!linkedVexPi
  const isParked = !isVoided && !isMatched && !isVex
  const matchedPayments = matchedIds
    .map((pid) => allPayments.find((p) => p.id === pid))
    .filter((p): p is Payment => !!p)

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title={`Receipt ${log.id}`}
          breadcrumb={[
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'Unmatched', href: '/finance/payments/unmatched' },
            { label: log.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={formatRs(log.amount)}
            subtitle={`Logged ${formatDate(log.date)} via ${log.mode}`}
            metadata={[
              { label: 'Reference', value: log.reference ?? 'none' },
              { label: 'State', value: isVoided ? 'Voided' : isMatched ? 'Matched' : isVex ? 'VEX payment' : 'Parked (unmatched)' },
              { label: 'Narration', value: log.narration ?? 'none' },
            ]}
          />

          {okMessage ? (
            <p role="status" className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground">
              {okMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p role="alert" className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert">
              {errorMessage}
            </p>
          ) : null}

          {isVoided ? (
            <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h2 className="font-heading text-base font-semibold text-brand-navy">Voided receipt</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Voided on {formatDate((log.voidedAt ?? '').slice(0, 10))} by {log.voidedBy ?? 'unknown'}.
                {log.voidReason ? ` Reason: ${log.voidReason}` : ''} The row is kept for audit and is
                excluded from all balances.
              </p>
            </section>
          ) : null}

          {isMatched ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-6">
              <h2 className="font-heading text-base font-semibold text-brand-navy">Matched to an instalment</h2>
              <p className="mt-1 text-sm text-foreground">
                This receipt feeds {matchedPayments.length} instalment{matchedPayments.length === 1 ? '' : 's'}.
                Unmatch the instalment first, then return here to void this receipt.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {matchedPayments.map((p) => (
                  <li key={p.id}>
                    <Link href={`/finance/payments/${p.id}`} className="font-semibold text-brand-navy hover:underline">
                      {p.id}
                    </Link>{' '}
                    <span className="text-muted-foreground">({p.schoolName}, {p.instalmentLabel})</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isVex ? (
            <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h2 className="font-heading text-base font-semibold text-brand-navy">VEX payment</h2>
              <p className="mt-1 text-sm text-foreground">
                This receipt is recorded against a VEX PI. Edit or void it from the PI page so the PI
                balance reconciles.
              </p>
              <Link
                href={`/operations/vex/pi/${linkedVexPi.id}`}
                className="mt-2 inline-block font-semibold text-brand-navy hover:underline"
              >
                Open {linkedVexPi.piNumber || linkedVexPi.id}
              </Link>
            </section>
          ) : null}

          {canFinance && isParked ? (
            <>
              <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
                <h2 className="font-heading text-base font-semibold text-brand-navy">Edit receipt</h2>
                <form action={`/api/finance/payments/log/${log.id}`} method="post" className="grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="action" value="edit" />
                  <div>
                    <label htmlFor="amount" className={FIELD_LABEL_CLASS}>Amount (Rs)</label>
                    <input id="amount" name="amount" type="number" step="0.01" defaultValue={log.amount} className={FIELD_INPUT_CLASS} />
                  </div>
                  <div>
                    <label htmlFor="date" className={FIELD_LABEL_CLASS}>Date</label>
                    <input id="date" name="date" type="date" defaultValue={log.date} className={FIELD_INPUT_CLASS} />
                  </div>
                  <div>
                    <label htmlFor="mode" className={FIELD_LABEL_CLASS}>Mode</label>
                    <select id="mode" name="mode" defaultValue={log.mode} className={FIELD_INPUT_CLASS}>
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reference" className={FIELD_LABEL_CLASS}>Reference</label>
                    <input id="reference" name="reference" type="text" defaultValue={log.reference ?? ''} className={FIELD_INPUT_CLASS} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="narration" className={FIELD_LABEL_CLASS}>Narration</label>
                    <input id="narration" name="narration" type="text" defaultValue={log.narration ?? ''} className={FIELD_INPUT_CLASS} />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                      Save changes
                    </button>
                  </div>
                </form>
              </section>

              <section className="space-y-3 rounded-lg border border-red-200 bg-card p-4 sm:p-6">
                <h2 className="font-heading text-base font-semibold text-brand-navy">Void this receipt</h2>
                <p className="text-sm text-muted-foreground">
                  Soft-deletes the receipt. The row is kept for audit and excluded from balances. It is
                  parked (no instalment or PI relies on it), so nothing else changes.
                </p>
                <form action={`/api/finance/payments/log/${log.id}`} method="post" className="space-y-2">
                  <input type="hidden" name="action" value="void" />
                  <label htmlFor="reason" className={FIELD_LABEL_CLASS}>Reason (min 10 characters)</label>
                  <input id="reason" name="reason" type="text" minLength={10} required className={FIELD_INPUT_CLASS} />
                  <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    Void receipt
                  </button>
                </form>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </>
  )
}
