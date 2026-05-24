/*
 * /mous/[mouId]/installments/[paymentId]/edit (Gate 5A.6 Step 4).
 *
 * Edit a single instalment's due date, expected amount, and notes.
 * When a PI has been issued for this instalment (piNumber !== null)
 * the form warns that saving will materialise an Adjustment row;
 * the API runs computeRecalcWithAdjustments() and writes via
 * appendAdjustments() so the audit trail stays clean. Otherwise it
 * enqueues a normal payment update.
 *
 * VIEW: every authenticated user. EDIT (submit): canEditFinanceData.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
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
  permission: 'Editing an instalment requires the Finance role.',
  'unknown-user': 'Session expired. Please sign in again.',
  'invalid-amount': 'Expected amount must be a positive number.',
  'invalid-date': 'Due date must be in yyyy-mm-dd format.',
  'payment-not-found': 'Instalment not found.',
  'queue-failure': 'Failed to queue the edit. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function EditInstallmentPage({ params, searchParams }: PageProps) {
  const { mouId, paymentId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/mous/${mouId}/installments/${paymentId}/edit`)}`,
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
  const canSubmit = canEditFinanceData(user)
  const piIssued = payment.piNumber !== null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Edit instalment`}
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
              { label: 'Current expected', value: formatRs(payment.expectedAmount) },
              {
                label: 'Current due date',
                value: payment.dueDateIso ? formatDate(payment.dueDateIso) : (payment.dueDateRaw ?? '-'),
              },
              { label: 'Status', value: payment.status },
              { label: 'PI', value: payment.piNumber ?? '-' },
            ]}
          />

          {piIssued ? (
            <div
              role="status"
              className="flex gap-2 rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              <AlertTriangle aria-hidden className="size-4 text-signal-attention" />
              <p>
                PI <strong>{payment.piNumber}</strong> has been issued for this instalment. Saving the changes will create an Adjustment record rather than overwrite the PI value; the audit log keeps the original number intact.
              </p>
            </div>
          ) : null}

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
            action="/api/mou/installments/edit"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <input type="hidden" name="paymentId" value={payment.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="dueDateIso" className={FIELD_LABEL_CLASS}>
                  Due date
                </label>
                <input
                  id="dueDateIso"
                  name="dueDateIso"
                  type="date"
                  required
                  defaultValue={payment.dueDateIso ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="expectedAmount" className={FIELD_LABEL_CLASS}>
                  Expected amount (Rs)
                </label>
                <input
                  id="expectedAmount"
                  name="expectedAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  defaultValue={payment.expectedAmount}
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
                defaultValue={payment.notes ?? ''}
                placeholder="Optional context for the edit."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={opsButtonClass({ variant: 'action', size: 'md' })}
              >
                Save changes
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
