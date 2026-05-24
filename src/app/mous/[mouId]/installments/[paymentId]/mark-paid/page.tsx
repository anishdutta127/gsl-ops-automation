/*
 * /mous/[mouId]/installments/[paymentId]/mark-paid (Gate 5A.6 Step 4).
 *
 * Standalone modal-style server form for Finance to mark an instalment
 * as fully paid. Captures the received amount + date + bank reference
 * + reason for manual mark. Submit calls recordReceipt() with the
 * supplied amount; the audit notes carry the operator reason.
 *
 * VIEW: every authenticated user (Phase 1 testing-mode default).
 * EDIT (submit): canEditFinanceData. Non-Finance hits ?error=permission.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'

interface PageProps {
  params: Promise<{ mouId: string; paymentId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_COPY: Record<string, string> = {
  permission: 'Marking an instalment as Paid requires the Finance role.',
  'unknown-user': 'Session expired. Please sign in again.',
  'invalid-amount': 'Received amount must be a positive number.',
  'invalid-date': 'Received date must be in yyyy-mm-dd format.',
  'invalid-mode': 'Pick a payment mode.',
  'missing-reason': 'A reason is required when marking an instalment manually.',
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

export default async function MarkPaidPage({ params, searchParams }: PageProps) {
  const { mouId, paymentId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/mous/${mouId}/installments/${paymentId}/mark-paid`)}`,
    )
  }
  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  const payment = allPayments.find((p) => p.id === paymentId && p.mouId === mou.id)
  if (!payment) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null
  const today = new Date().toISOString().slice(0, 10)
  const canSubmit = canEditFinanceData(user)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Mark as Paid`}
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
              {
                label: 'Due',
                value: payment.dueDateIso ? formatDate(payment.dueDateIso) : (payment.dueDateRaw ?? '-'),
              },
              { label: 'Status', value: payment.status },
              { label: 'PI', value: payment.piNumber ?? '-' },
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
            action="/api/mou/installments/mark-paid"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <input type="hidden" name="paymentId" value={payment.id} />

            {/* Phase 6E Finding 4: Bank + TDS split mirroring the batch
                form (/finance/payments/log-batch). Pranav files form 26AS
                from the TDS amount, so the split has to be captured at
                the single-payment surface too. Bank Amount + TDS Amount
                are the editable inputs; total received is read-only and
                surfaces as their sum. The legacy single-field
                receivedAmount input is preserved as a hidden field
                computed from bank + TDS so the existing API contract
                (recordReceipt reads receivedAmount as the canonical
                total) keeps working. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="bankAmount" className={FIELD_LABEL_CLASS}>
                  Bank Amount (Rs)
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (cash credited to the bank)
                  </span>
                </label>
                <input
                  id="bankAmount"
                  name="bankAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={payment.expectedAmount}
                  className={FIELD_INPUT_CLASS}
                  data-testid="mark-paid-bank-amount"
                />
              </div>
              <div>
                <label htmlFor="tdsAmount" className={FIELD_LABEL_CLASS}>
                  TDS Amount (Rs)
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (defaults to 0)
                  </span>
                </label>
                <input
                  id="tdsAmount"
                  name="tdsAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={0}
                  className={FIELD_INPUT_CLASS}
                  data-testid="mark-paid-tds-amount"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div>
                <p className={FIELD_LABEL_CLASS}>Total received (Bank + TDS)</p>
                <p
                  className="block w-full min-h-11 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
                  data-testid="mark-paid-total-received"
                >
                  {formatRs(payment.expectedAmount)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Server recomputes from the two inputs on submit.
                  </span>
                </p>
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
              <label htmlFor="reasonForManualMark" className={FIELD_LABEL_CLASS}>
                Reason for manual mark
                <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
              </label>
              <textarea
                id="reasonForManualMark"
                name="reasonForManualMark"
                rows={2}
                required
                placeholder="e.g., Bank reconciliation gap; payment landed but UTR mismatched."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Mark as Paid
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
