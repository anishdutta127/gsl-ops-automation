/*
 * /finance/payments/new (Gate 5A.6 Step 2).
 *
 * Manual payment logging entry point. Operator enters what hit the bank
 * (bankReference, receivedAmount, receivedDate, bankName, paymentMode),
 * narrows the destination (school -> MOU -> installment), and submits.
 *
 * Server-side branching in /api/finance/payment/log:
 *   1. school + MOU + installment + amount equals expectedAmount
 *      -> calls recordReceipt() (auto-match path).
 *   2. school + MOU but no installment match
 *      -> enqueues a fresh PaymentLog (entity 'paymentLog'); redirects to
 *      /finance/payments banner pointing at the matcher.
 *   3. school only
 *      -> enqueues PaymentLog with mouId hint null; redirects to
 *      /finance/payments/unmatched.
 *
 * Discoverability: linked from /finance/payments + /finance/payments/
 * unmatched headers + per-row "Log payment for this installment" affordance
 * on /mous/[id]/installments.
 *
 * VIEW: every authenticated user (Phase 1 testing-mode default).
 * EDIT (submit): canEditFinanceData (Finance + Admin wildcard).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
// P4 batch 3a (2026-05-24): live repo reads.
import { schoolRepo } from '@/lib/db/repos/school'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { canEditFinanceData } from '@/lib/access'
import { PaymentLogForm } from './PaymentLogForm'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Logging a payment requires the Finance role.',
  'unknown-user': 'Session user not found. Please log in again.',
  'invalid-amount': 'Received amount must be a positive number.',
  'invalid-date': 'Received date must be in yyyy-mm-dd format.',
  'invalid-mode': 'Pick a payment mode from the dropdown.',
  'missing-reference': 'Bank reference is required.',
  'missing-school': 'Pick the destination school.',
  'school-not-found': 'School not found in the master list.',
  'queue-failure': 'Failed to queue the payment. Retry.',
}

export default async function NewPaymentPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpayments%2Fnew')

  const canSubmit = canEditFinanceData(user)

  const [allSchools, allMous, allPayments] = await Promise.all([
    schoolRepo.findAll(),
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])

  const activeSchools = allSchools
    .filter((s) => s.active !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const schoolIdByMou = new Map<string, string>(
    allMous.map((m) => [m.id, m.schoolId]),
  )
  const mousLite = allMous
    .filter((m) => m.cohortStatus === 'active')
    .map((m) => ({
      id: m.id,
      schoolId: m.schoolId,
      schoolName: m.schoolName,
      programme: m.programme,
      programmeSubType: m.programmeSubType,
      academicYear: m.academicYear,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const installmentsLite = allPayments
    .filter((p) => p.status !== 'Paid' && p.status !== 'Received')
    .map((p) => ({
      id: p.id,
      mouId: p.mouId,
      instalmentLabel: p.instalmentLabel,
      expectedAmount: p.expectedAmount,
      dueDateIso: p.dueDateIso,
      status: p.status,
      schoolId: schoolIdByMou.get(p.mouId) ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`
    : null

  const prefill = {
    schoolId: typeof sp.schoolId === 'string' ? sp.schoolId : '',
    mouId: typeof sp.mouId === 'string' ? sp.mouId : '',
    paymentId: typeof sp.paymentId === 'string' ? sp.paymentId : '',
  }

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Log a payment"
          subtitle="Capture a bank entry against a school. The form will try to match an open instalment automatically; if it can't, the entry parks for manual matching."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-screen-md space-y-4 px-4 py-6">
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
              data-testid="payment-log-error"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <PaymentLogForm
            schools={activeSchools}
            mous={mousLite}
            installments={installmentsLite}
            prefill={prefill}
            disabled={!canSubmit}
          />
        </div>
      </main>
    </>
  )
}
