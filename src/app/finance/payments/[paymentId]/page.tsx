/*
 * /finance/payments/[paymentId] (Gate 5A.6 Step 10).
 *
 * Payment detail surface with three operator actions:
 *   - Edit (Finance + Admin): change date, amount, ref, notes.
 *     Amount changes emit an Adjustment for the delta.
 *   - Unmatch (Finance + Admin): revert receivedAmount + status back
 *     to Pending (or Partial if partial entries exist).
 *   - Delete (Admin wildcard only): soft-delete via status='Cancelled'.
 *
 * Read-access: every authenticated user (W3-B testing-mode VIEW
 * opens up); server actions still gate via the mutation lib.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { MOU, Payment } from '@/lib/types'
import paymentsJson from '@/data/payments.json'
import mousJson from '@/data/mous.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { StatusChip } from '@/components/ops/StatusChip'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'

const allPayments = paymentsJson as unknown as Payment[]
const allMous = mousJson as unknown as MOU[]

interface PageProps {
  params: Promise<{ paymentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to perform this action.',
  'unknown-user': 'Session expired. Sign in again.',
  'payment-not-found': 'Payment not found.',
  'invalid-amount': 'Amount must be a positive number.',
  'invalid-date': 'Date must be yyyy-mm-dd.',
  'not-matched': 'No matched receipt on this row to unmatch.',
  'missing-reason': 'Reason is required.',
  'invalid-action': 'Unknown action.',
}

const OK_MESSAGES: Record<string, string> = {
  edit: 'Payment edited. Will reflect everywhere within ~5 minutes.',
  unmatch: 'Payment unmatched. Status reverted to Pending / Partial.',
  delete: 'Payment soft-deleted. Status flipped to Cancelled.',
}

const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'
const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Zoho', 'Razorpay', 'Other'] as const

function isAdminWildcard(u: { role: string; department: string | null | undefined }): boolean {
  return u.role === 'Admin' && (u.department ?? null) === null
}

export default async function PaymentDetailPage({ params, searchParams }: PageProps) {
  const { paymentId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/finance/payments/${paymentId}`)}`)
  const payment = allPayments.find((p) => p.id === paymentId)
  if (!payment) notFound()
  const mou = allMous.find((m) => m.id === payment.mouId)

  const okKey = typeof sp.ok === 'string' ? sp.ok : null
  const okMessage = okKey ? OK_MESSAGES[okKey] ?? `Action ${okKey} completed.` : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const adjustmentCreated = sp.adjustment === '1'

  const canFinanceEdit = canEditFinanceData(user)
  const canHardDelete = isAdminWildcard({ role: user.role, department: user.department })

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title={`Payment ${payment.id}`}
          breadcrumb={[
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: payment.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={payment.schoolName}
            subtitle={`Instalment ${payment.instalmentLabel}${mou ? ` · MOU ${mou.id}` : ''}`}
            metadata={[
              { label: 'Status', value: payment.status },
              { label: 'Expected', value: formatRs(payment.expectedAmount) },
              { label: 'Received', value: payment.receivedAmount !== null ? formatRs(payment.receivedAmount) : 'none' },
              { label: 'Received date', value: payment.receivedDate ? formatDate(payment.receivedDate) : 'n/a' },
              { label: 'PI number', value: payment.piNumber ?? 'none' },
              { label: 'Bank ref', value: payment.bankReference ?? 'none' },
            ]}
          />

          {okMessage ? (
            <p
              role="status"
              data-testid="payment-action-ok-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              {okMessage}
              {adjustmentCreated ? ' An Adjustment row was created for the amount delta.' : ''}
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              data-testid="payment-action-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {/* Edit form */}
          {canFinanceEdit ? (
            <section className="rounded-lg border border-border bg-card p-4 sm:p-6 space-y-4">
              <div>
                <h2 className="font-heading text-base font-semibold text-brand-navy">
                  Edit payment
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Editing a matched payment generates an Adjustment for the
                  amount delta so issued PIs stay coherent.
                </p>
              </div>
              <form
                method="POST"
                action={`/api/finance/payment/${payment.id}`}
                className="space-y-3"
                data-testid="payment-edit-form"
              >
                <input type="hidden" name="action" value="edit" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="receivedDate" className={FIELD_LABEL_CLASS}>
                      Received date
                    </label>
                    <input
                      id="receivedDate"
                      name="receivedDate"
                      type="date"
                      required
                      defaultValue={payment.receivedDate ?? ''}
                      className={FIELD_INPUT_CLASS}
                      data-testid="edit-date-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="receivedAmount" className={FIELD_LABEL_CLASS}>
                      Received amount (Rs)
                    </label>
                    <input
                      id="receivedAmount"
                      name="receivedAmount"
                      type="number"
                      min={1}
                      step={1}
                      required
                      defaultValue={payment.receivedAmount ?? payment.expectedAmount}
                      className={FIELD_INPUT_CLASS}
                      data-testid="edit-amount-input"
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
                      required
                      defaultValue={payment.paymentMode ?? 'Bank Transfer'}
                      className={FIELD_INPUT_CLASS}
                      data-testid="edit-mode-select"
                    >
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bankReference" className={FIELD_LABEL_CLASS}>
                      Reference (UTR / Cheque)
                    </label>
                    <input
                      id="bankReference"
                      name="bankReference"
                      type="text"
                      defaultValue={payment.bankReference ?? ''}
                      className={FIELD_INPUT_CLASS}
                      data-testid="edit-ref-input"
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
                    defaultValue={payment.notes ?? ''}
                    className={FIELD_INPUT_CLASS}
                    data-testid="edit-notes-input"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    data-testid="edit-submit"
                  >
                    Save edit
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {/* Unmatch form */}
          {canFinanceEdit && (payment.receivedAmount !== null || payment.bankReference !== null) ? (
            <section className="rounded-lg border border-signal-attention bg-card p-4 sm:p-6 space-y-3">
              <div>
                <h2 className="font-heading text-base font-semibold text-brand-navy">
                  Unmatch payment
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reverts the match. Instalment status flips to Pending (or
                  Partial if other partial entries exist).
                </p>
              </div>
              <form
                method="POST"
                action={`/api/finance/payment/${payment.id}`}
                className="flex flex-wrap gap-2 items-end"
                data-testid="payment-unmatch-form"
              >
                <input type="hidden" name="action" value="unmatch" />
                <div className="grow min-w-[200px]">
                  <label htmlFor="unmatchReason" className={FIELD_LABEL_CLASS}>
                    Reason
                  </label>
                  <input
                    id="unmatchReason"
                    name="reason"
                    type="text"
                    required
                    minLength={5}
                    className={FIELD_INPUT_CLASS}
                    data-testid="unmatch-reason-input"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md border border-signal-attention bg-card px-4 py-2 text-sm font-semibold text-signal-attention hover:bg-signal-attention/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="unmatch-submit"
                >
                  Unmatch
                </button>
              </form>
            </section>
          ) : null}

          {/* Delete form (Admin wildcard only) */}
          {canHardDelete ? (
            <section className="rounded-lg border border-signal-alert bg-card p-4 sm:p-6 space-y-3">
              <div>
                <h2 className="font-heading text-base font-semibold text-signal-alert">
                  Soft delete payment
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Marks the payment as Cancelled. The record stays in
                  payments.json with the full audit trail. Reactivating a
                  cancelled payment requires a JSON edit (Phase 1.1).
                </p>
              </div>
              <form
                method="POST"
                action={`/api/finance/payment/${payment.id}`}
                className="flex flex-wrap gap-2 items-end"
                data-testid="payment-delete-form"
              >
                <input type="hidden" name="action" value="delete" />
                <div className="grow min-w-[240px]">
                  <label htmlFor="deleteReason" className={FIELD_LABEL_CLASS}>
                    Reason (min 10 chars)
                  </label>
                  <input
                    id="deleteReason"
                    name="reason"
                    type="text"
                    required
                    minLength={10}
                    className={FIELD_INPUT_CLASS}
                    data-testid="delete-reason-input"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-signal-alert px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="delete-submit"
                >
                  Soft delete
                </button>
              </form>
            </section>
          ) : null}

          {/* Audit history */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Audit history
            </h2>
            {payment.auditLog && payment.auditLog.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs">
                {payment.auditLog.slice().reverse().map((a, i) => (
                  <li key={i} className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-muted-foreground">
                        {a.timestamp}
                      </span>
                      <StatusChip
                        tone="neutral"
                        label={a.action}
                        withDot={false}
                      />
                      <span className="text-muted-foreground">{a.user}</span>
                    </div>
                    {a.notes ? <p className="mt-1 text-foreground">{a.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No audit entries on this payment yet.</p>
            )}
          </section>

          <div>
            <Link
              href="/finance/payments"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to payments
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
