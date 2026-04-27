/*
 * /mous/[mouId]/payment-receipt (W4-B.5).
 *
 * Form for recording a received payment. Surfaces the pending /
 * already-recorded Payment rows for the MOU; selecting one fills
 * the form with current values (edit-mode for already-paid rows).
 *
 * Permission: visible to every authenticated user (W3-B);
 * server-side enforcement gates the submit on
 * 'payment:reconcile' (Finance + Admin via wildcard). Non-Finance
 * submits 303 back with ?error=permission so the rail can render
 * the gate message.
 *
 * Variance handling: the lib accepts any positive amount; the
 * banner above the form warns when the requested amount differs
 * from the Payment row's expectedAmount. The audit entry captures
 * the variance Rs amount + sign.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MOU, Payment, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { formatRs } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Recording a payment receipt requires the Finance role.',
  'unknown-user': 'Session user not found. Please log in again.',
  'payment-not-found': 'Selected instalment was not found.',
  'invalid-amount': 'Received amount must be a positive number.',
  'invalid-date': 'Received date must be in yyyy-mm-dd format.',
  'invalid-mode': 'Pick a payment mode from the dropdown.',
  'missing-payment': 'No instalment selected for the receipt.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
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

export default async function PaymentReceiptPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const payments = allPayments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const recordedId = typeof sp.recorded === 'string' ? sp.recorded : null
  const varianceRaw = typeof sp.variance === 'string' ? sp.variance : null
  const varianceRs = varianceRaw !== null && Number.isFinite(Number(varianceRaw))
    ? Number(varianceRaw)
    : null

  const selectedPaymentId = typeof sp.paymentId === 'string'
    ? sp.paymentId
    : payments.find((p) => p.status !== 'Paid')?.id ?? payments[0]?.id ?? ''
  const selectedPayment = payments.find((p) => p.id === selectedPaymentId) ?? null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} payment receipt`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Payment receipt' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={mou.id}
            subtitle="Record a received payment against an open instalment"
            metadata={[
              { label: 'School', value: mou.schoolName },
              { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
              { label: 'Instalments on file', value: String(payments.length) },
            ]}
          />

          {recordedId !== null ? (
            <p
              role="status"
              data-testid="payment-recorded-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Payment recorded for instalment <strong>{recordedId}</strong>.
              {varianceRs !== null && varianceRs !== 0 ? (
                <> Variance Rs {varianceRs.toLocaleString('en-IN')} captured in the audit log.</>
              ) : null}
            </p>
          ) : null}
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="payment-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {selectedPayment !== null && selectedPayment.status === 'Paid' ? (
            <p
              role="status"
              data-testid="payment-edit-mode-banner"
              className="rounded-md border border-signal-attention bg-card p-3 text-xs text-foreground"
            >
              This instalment is already marked Paid. Submitting again replaces the
              recorded values (operator-correction mode); a fresh audit entry captures
              the diff.
            </p>
          ) : null}

          {payments.length === 0 ? (
            <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              No instalments on file yet. Generate a PI on{' '}
              <Link href={`/mous/${mou.id}/pi`} className="text-brand-navy hover:underline">
                /mous/{mou.id}/pi
              </Link>{' '}
              first; the resulting Payment row appears here.
            </p>
          ) : (
            <form
              action="/api/payment/record"
              method="POST"
              className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
              data-testid="payment-receipt-form"
            >
              <input type="hidden" name="mouId" value={mou.id} />
              <div>
                <label htmlFor="paymentId" className={FIELD_LABEL_CLASS}>Instalment</label>
                <select
                  id="paymentId"
                  name="paymentId"
                  required
                  defaultValue={selectedPaymentId}
                  className={FIELD_INPUT_CLASS}
                  data-testid="payment-instalment-select"
                >
                  {payments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.instalmentLabel} - expected {formatRs(p.expectedAmount)} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="receivedDate" className={FIELD_LABEL_CLASS}>Received date</label>
                  <input
                    id="receivedDate"
                    name="receivedDate"
                    type="date"
                    required
                    defaultValue={selectedPayment?.receivedDate ?? ''}
                    className={FIELD_INPUT_CLASS}
                    data-testid="payment-date-input"
                  />
                </div>
                <div>
                  <label htmlFor="receivedAmount" className={FIELD_LABEL_CLASS}>
                    Amount received (Rs)
                  </label>
                  <input
                    id="receivedAmount"
                    name="receivedAmount"
                    type="number"
                    min="1"
                    step="1"
                    required
                    defaultValue={selectedPayment?.receivedAmount ?? selectedPayment?.expectedAmount ?? ''}
                    className={FIELD_INPUT_CLASS}
                    data-testid="payment-amount-input"
                  />
                  {selectedPayment !== null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expected: {formatRs(selectedPayment.expectedAmount)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="paymentMode" className={FIELD_LABEL_CLASS}>Payment mode</label>
                  <select
                    id="paymentMode"
                    name="paymentMode"
                    required
                    defaultValue={selectedPayment?.paymentMode ?? 'Bank Transfer'}
                    className={FIELD_INPUT_CLASS}
                    data-testid="payment-mode-select"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bankReference" className={FIELD_LABEL_CLASS}>
                    Reference (UTR / Cheque / etc.)
                  </label>
                  <input
                    id="bankReference"
                    name="bankReference"
                    type="text"
                    defaultValue={selectedPayment?.bankReference ?? ''}
                    placeholder="e.g., UTR-ABC1234567"
                    className={FIELD_INPUT_CLASS}
                    data-testid="payment-reference-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="notes" className={FIELD_LABEL_CLASS}>Notes (optional)</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  defaultValue={selectedPayment?.notes ?? ''}
                  placeholder="e.g., Partial payment; balance expected by month-end."
                  className={FIELD_INPUT_CLASS}
                  data-testid="payment-notes-input"
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="payment-submit"
                >
                  Record payment received
                </button>
                <Link
                  href={`/mous/${mou.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}

        </div>
      </main>
    </>
  )
}
