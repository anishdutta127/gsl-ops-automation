/*
 * /mous/[mouId]/installments/[paymentId]/mark-partial (Gate 5A.6 Step 4).
 *
 * Standalone form for Finance to log a partial payment against an
 * instalment. Calls recordPartialReceipt() which appends to
 * Payment.partialPayments[] and sets status='Partial' until the
 * cumulative reaches expectedAmount.
 *
 * VIEW: every authenticated user. EDIT (submit): canEditFinanceData.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { MOU, Payment, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

interface PageProps {
  params: Promise<{ mouId: string; paymentId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Logging a partial payment requires the Finance role.',
  'unknown-user': 'Session expired. Please sign in again.',
  'invalid-amount': 'Received amount must be a positive number.',
  'invalid-date': 'Received date must be in yyyy-mm-dd format.',
  'invalid-mode': 'Pick a payment mode.',
  'payment-not-found': 'Instalment not found.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

const PAYMENT_MODES = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
] as const

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function MarkPartialPage({ params, searchParams }: PageProps) {
  const { mouId, paymentId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/mous/${mouId}/installments/${paymentId}/mark-partial`)}`,
    )
  }
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  const payment = allPayments.find((p) => p.id === paymentId && p.mouId === mou.id)
  if (!payment) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null
  const today = new Date().toISOString().slice(0, 10)
  const canSubmit = canEditFinanceData(user)

  const partialSoFar = (payment.partialPayments ?? []).reduce(
    (s, p) => s + (p.amount ?? 0),
    0,
  )
  const balance = Math.max(0, payment.expectedAmount - partialSoFar)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Mark as Partial Paid`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Instalments', href: `/mous/${mou.id}/installments` },
            { label: payment.instalmentLabel },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={payment.instalmentLabel}
            subtitle={`${mou.id} · ${payment.description}`}
            metadata={[
              { label: 'Expected', value: formatRs(payment.expectedAmount) },
              { label: 'Received so far', value: formatRs(partialSoFar) },
              { label: 'Balance', value: formatRs(balance) },
              {
                label: 'Due',
                value: payment.dueDateIso ? formatDate(payment.dueDateIso) : (payment.dueDateRaw ?? '-'),
              },
            ]}
          />

          {!canSubmit ? (
            <p
              role="status"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              You are signed in as a non-Finance user; the form is visible but submitting requires the Finance role.
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form
            action="/api/mou/installments/mark-partial"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <input type="hidden" name="paymentId" value={payment.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="receivedAmount" className={FIELD_LABEL_CLASS}>
                  Amount received this time (Rs)
                </label>
                <input
                  id="receivedAmount"
                  name="receivedAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="receivedDate" className={FIELD_LABEL_CLASS}>
                  Date received
                </label>
                <input
                  id="receivedDate"
                  name="receivedDate"
                  type="date"
                  required
                  defaultValue={today}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="paymentMode" className={FIELD_LABEL_CLASS}>
                  Payment mode
                </label>
                <select
                  id="paymentMode"
                  name="paymentMode"
                  defaultValue="Bank Transfer"
                  className={FIELD_INPUT_CLASS}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bankReference" className={FIELD_LABEL_CLASS}>
                  Bank reference
                </label>
                <input
                  id="bankReference"
                  name="bankReference"
                  type="text"
                  placeholder="UTR / Cheque / DD"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="What was paid this round; expected balance and timeline."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Log partial payment
              </button>
              <Link
                href={`/mous/${mou.id}/installments`}
                className={opsButtonClass({ variant: 'outline', size: 'md' })}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
