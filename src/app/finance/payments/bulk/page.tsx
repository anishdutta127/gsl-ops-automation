/*
 * /finance/payments/bulk (Gate 5A.6 Step 3).
 *
 * CSV upload + review-and-confirm flow. Single-page client component
 * stays in memory: upload -> parse -> per-row school dropdown (with
 * fuzzy match pre-fill) -> Import N payments button submits the
 * confirmed bag to /api/finance/payment/bulk-import.
 *
 * Server route auto-matches rows where a single open instalment lines
 * up by amount, else parks the row as a PaymentLog. Result toast
 * summarises N total / M auto-matched / K parked.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
// P4 batch 3a (2026-05-24): live repo reads.
import { schoolRepo } from '@/lib/db/repos/school'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { canEditFinanceData } from '@/lib/access'
import { BulkUploadClient } from './BulkUploadClient'
import type { PaymentLog } from '@/lib/types'

export default async function BulkUploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpayments%2Fbulk')

  const canSubmit = canEditFinanceData(user)

  const [allSchools, allMous, allPayments, allLogs] = await Promise.all([
    schoolRepo.findAll(),
    mouRepo.findAll(),
    paymentRepo.findAll(),
    paymentLogRepo.findAll() as Promise<PaymentLog[]>,
  ])

  const schools = allSchools
    .filter((s) => s.active !== false)
    .map((s) => ({ id: s.id, name: s.name, city: s.city, state: s.state }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const schoolIdByMou = new Map<string, string>(
    allMous.map((m) => [m.id, m.schoolId]),
  )
  const mous = allMous
    .filter((m) => m.cohortStatus === 'active')
    .map((m) => ({
      id: m.id,
      schoolId: m.schoolId,
      schoolName: m.schoolName,
      programme: m.programme,
      programmeSubType: m.programmeSubType,
      academicYear: m.academicYear,
    }))

  const installments = allPayments
    .filter((p) => p.status !== 'Paid' && p.status !== 'Received')
    .map((p) => ({
      id: p.id,
      mouId: p.mouId,
      instalmentLabel: p.instalmentLabel,
      expectedAmount: p.expectedAmount,
      schoolId: schoolIdByMou.get(p.mouId) ?? null,
    }))

  const existingBankRefs = new Set(
    allLogs
      .map((l) => (l.reference ?? '').trim().toUpperCase())
      .filter((r) => r !== ''),
  )

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Bulk upload payments"
          subtitle="Upload a CSV exported from the bank statement. Confirm each row's school + instalment, then import in one go."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'Bulk upload' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          {!canSubmit ? (
            <p
              role="status"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              You are signed in as a non-Finance user; the form is visible but importing requires the Finance role.
            </p>
          ) : null}
          <BulkUploadClient
            schools={schools}
            mous={mous}
            installments={installments}
            existingBankRefs={Array.from(existingBankRefs)}
            disabled={!canSubmit}
          />
        </div>
      </main>
    </>
  )
}
