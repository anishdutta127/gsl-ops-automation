/*
 * /finance/adjustments/new (Gate 5A.6 Step 5).
 *
 * Manual adjustment entry form. Pranav creates an Adjustment when
 * a student count change, fee revision, discount, or refund needs to
 * surface as an adjustment-as-line-item against a specific instalment.
 *
 * Permission: canEditFinanceData. Non-Finance users are redirected
 * back to the adjustments list with a permission flash.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
// P4 batch 3a (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { formatRs } from '@/lib/format'
import { AdjustmentEntryClient } from './AdjustmentEntryClient'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Only Finance and Admin can create adjustments.',
  'unknown-user': 'Session expired. Sign in again.',
  'mou-not-found': 'Selected MOU not found.',
  'installment-not-found': 'Selected instalment not found.',
  'installment-mismatch': 'Instalment does not belong to the selected MOU.',
  'invalid-amount': 'Amount must be a non-zero number.',
  'missing-reason': 'Reason is required (minimum 10 characters).',
  'missing-mou': 'Select an MOU.',
  'missing-installment': 'Select the affected instalment.',
  'invalid-type': 'Pick an adjustment type from the dropdown.',
}

const ADJUSTMENT_TYPES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'student-count', label: 'Student count change' },
  { key: 'fee-revision', label: 'Fee revision' },
  { key: 'discount', label: 'Discount applied' },
  { key: 'refund', label: 'Refund' },
  { key: 'other', label: 'Other' },
]

interface MouOption {
  id: string
  schoolName: string
  programme: string
  contractValue: number
  schoolId: string
}

interface InstallmentOption {
  id: string
  mouId: string
  label: string
  expectedAmount: number
  status: string
  isLocked: boolean
  seq: number
}

export default async function NewAdjustmentPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fadjustments%2Fnew')
  if (!canEditFinanceData(user)) {
    redirect('/finance/adjustments?error=permission')
  }

  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`
    : null
  const preselectMouId = typeof sp.mouId === 'string' ? sp.mouId : null

  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])

  const mouOptions: MouOption[] = allMous
    .filter((m) => m.cohortStatus === 'active')
    .map((m) => ({
      id: m.id,
      schoolName: m.schoolName,
      programme: m.programme,
      contractValue: m.contractValue,
      schoolId: m.schoolId,
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))

  const installmentOptionsByMou = new Map<string, InstallmentOption[]>()
  for (const p of allPayments) {
    const isLocked =
      p.piNumber !== null ||
      p.piSentDate !== null ||
      (p.receivedAmount !== null && p.receivedAmount > 0)
    const list = installmentOptionsByMou.get(p.mouId) ?? []
    list.push({
      id: p.id,
      mouId: p.mouId,
      label: `${p.instalmentLabel} – expected ${formatRs(p.expectedAmount)} (${p.status})`,
      expectedAmount: p.expectedAmount,
      status: p.status,
      isLocked,
      seq: p.instalmentSeq,
    })
    list.sort((a, b) => a.seq - b.seq)
    installmentOptionsByMou.set(p.mouId, list)
  }

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="New adjustment"
          subtitle="Record an adjustment against a specific instalment. The recalc engine will surface the cumulative delta on the next unpaid PI as 'Balance due Previous Instalments / (Excess Received)'."
          breadcrumb={[
            { label: 'Finance', href: '/finance' },
            { label: 'Adjustments', href: '/finance/adjustments' },
            { label: 'New adjustment' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="adjustment-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <AdjustmentEntryClient
            mouOptions={mouOptions}
            installmentOptionsByMou={Object.fromEntries(installmentOptionsByMou)}
            adjustmentTypes={[...ADJUSTMENT_TYPES]}
            preselectMouId={preselectMouId}
          />

          <div>
            <Link
              href="/finance/adjustments"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to adjustments list
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
