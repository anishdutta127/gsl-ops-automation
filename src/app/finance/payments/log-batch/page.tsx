/*
 * /finance/payments/log-batch (Phase 4, 2026-05-19).
 *
 * Per-school batch payment entry. Server component picks the school
 * from `?schoolId=` (or shows a picker), loads the outstanding
 * instalments for that school, and hands the data to LogBatchForm
 * for the bank + TDS per-row UI.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { MOU, Payment, PaymentLog, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { formatDate } from '@/lib/format'
import { LogBatchForm, type BatchInstallmentLite, type SchoolLite } from './LogBatchForm'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allSchools = schoolsJson as unknown as School[]

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function outstandingForSchool(schoolId: string): {
  installments: BatchInstallmentLite[]
  schoolMous: MOU[]
} {
  const schoolMous = allMous.filter(
    (m) => m.schoolId === schoolId && m.cohortStatus === 'active',
  )
  const mouIds = new Set(schoolMous.map((m) => m.id))
  const installments = allPayments
    .filter((p) => mouIds.has(p.mouId))
    .filter((p) =>
      p.status === 'Pending' || p.status === 'PI Sent' || p.status === 'Due Soon' || p.status === 'Overdue' || p.status === 'Partial',
    )
    .sort((a, b) => {
      const aDue = a.dueDateIso ?? ''
      const bDue = b.dueDateIso ?? ''
      if (aDue < bDue) return -1
      if (aDue > bDue) return 1
      return 0
    })
    .map<BatchInstallmentLite>((p) => {
      const mou = schoolMous.find((m) => m.id === p.mouId)
      const balanceDue = Math.max(0, p.expectedAmount - (p.receivedAmount ?? 0))
      return {
        paymentId: p.id,
        mouId: p.mouId,
        mouLabel: mou ? `${mou.id} (${mou.programme})` : p.mouId,
        instalmentLabel: p.instalmentLabel,
        instalmentSeq: p.instalmentSeq,
        dueDateIso: p.dueDateIso,
        dueDateDisplay: p.dueDateIso ? formatDate(p.dueDateIso) : (p.dueDateRaw ?? '-'),
        expectedAmount: p.expectedAmount,
        receivedAmount: p.receivedAmount ?? 0,
        balanceDue,
        status: p.status,
      }
    })
  return { installments, schoolMous }
}

export default async function LogBatchPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fpayments%2Flog-batch')
  if (!canEditFinanceData(user)) {
    redirect('/finance/payments?notice=batch-finance-only')
  }

  const schoolIdParam = typeof sp.schoolId === 'string' ? sp.schoolId : null
  const selectedSchool = schoolIdParam
    ? allSchools.find((s) => s.id === schoolIdParam) ?? null
    : null
  const { installments, schoolMous } = selectedSchool
    ? outstandingForSchool(selectedSchool.id)
    : { installments: [], schoolMous: [] }

  // School picker option set: every active school that has at least
  // one outstanding instalment. Sorted by name for the dropdown.
  const schoolsWithOutstanding = new Set<string>()
  for (const p of allPayments) {
    if (
      p.status === 'Pending' ||
      p.status === 'PI Sent' ||
      p.status === 'Due Soon' ||
      p.status === 'Overdue' ||
      p.status === 'Partial'
    ) {
      const m = allMous.find((mm) => mm.id === p.mouId)
      if (m) schoolsWithOutstanding.add(m.schoolId)
    }
  }
  const schoolOptions: SchoolLite[] = allSchools
    .filter((s) => s.active && schoolsWithOutstanding.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, city: s.city, state: s.state }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Log payment batch"
          subtitle={
            selectedSchool
              ? `${selectedSchool.name} - ${installments.length} outstanding instalment${installments.length === 1 ? '' : 's'}`
              : 'Pick a school. Fill bank + TDS per outstanding instalment. Submit once.'
          }
          breadcrumb={[
            { label: 'Finance', href: '/finance' },
            { label: 'Payments', href: '/finance/payments' },
            { label: 'Log batch' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          {!selectedSchool ? (
            <section
              className="rounded-lg border border-border bg-card p-5"
              data-testid="batch-school-picker"
            >
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                Pick a school
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {schoolOptions.length} school{schoolOptions.length === 1 ? '' : 's'} with at least one outstanding instalment.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {schoolOptions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/finance/payments/log-batch?schoolId=${encodeURIComponent(s.id)}`}
                      data-testid={`batch-school-option-${s.id}`}
                      className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      <span className="text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.city}, {s.state}
                      </span>
                    </Link>
                  </li>
                ))}
                {schoolOptions.length === 0 ? (
                  <li className="px-2 py-3 text-sm text-muted-foreground">
                    No schools have outstanding instalments right now.
                  </li>
                ) : null}
              </ul>
              <div className="mt-3 border-t border-border pt-3">
                <Link
                  href="/finance/payments"
                  className={opsButtonClass({ variant: 'outline', size: 'sm' })}
                >
                  Cancel
                </Link>
              </div>
            </section>
          ) : (
            <LogBatchForm
              school={{
                id: selectedSchool.id,
                name: selectedSchool.name,
                city: selectedSchool.city,
                state: selectedSchool.state,
              }}
              installments={installments}
              totalsForHeader={{
                totalExpected: installments.reduce((s, p) => s + p.expectedAmount, 0),
                totalBalance: installments.reduce((s, p) => s + p.balanceDue, 0),
              }}
              mousCount={schoolMous.length}
              defaultReceivedDate={new Date().toISOString().slice(0, 10)}
              userName={user.name}
              // Phase 4 Step 5: pass unmatched PaymentLog rows so the
              // batch form can surface a "this might be PL-001" banner
              // when the totals + reference align with a parked bank
              // entry. The set is small (11 rows in production today)
              // so passing it client-side is fine.
              unmatchedLogs={allPaymentLogs.filter((pl) => pl.unmatched).map((pl) => ({
                id: pl.id,
                date: pl.date,
                amount: pl.amount,
                reference: pl.reference,
                narration: pl.narration,
              }))}
            />
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Looking to log a single payment instead?{' '}
            <Link
              href="/finance/payments/new"
              className="text-brand-navy underline-offset-2 hover:underline"
              data-testid="batch-fallback-single-link"
            >
              Use the single-payment form {'→'}
            </Link>
            {' '}for entries that do not match an outstanding instalment cleanly (refunds, adjustments, advance payments).
          </p>
        </div>
      </main>
    </>
  )
}
