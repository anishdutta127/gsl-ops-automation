/*
 * /dashboard/finance (Gate 3.5 Step 7 rebuild).
 *
 * Replaces the 60-LOC skeleton with a focused two-card layout:
 * 3 KPI tiles up top, "Payments needing attention" + "PIs awaiting
 * payment" in the middle, Tally export quick link in the footer.
 *
 * Mobile: cards stack vertically.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, FileText, Receipt, AlertCircle } from 'lucide-react'
import type { Adjustment, MOU, Payment, PaymentLog } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import adjustmentsJson from '@/data/adjustments.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { formatRs } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allAdjustments = adjustmentsJson as unknown as Adjustment[]

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null
  const a = new Date(from).getTime()
  if (Number.isNaN(a)) return null
  return Math.floor((to.getTime() - a) / (1000 * 60 * 60 * 24))
}

function bucketByAge(daysOld: number | null): string {
  if (daysOld === null || daysOld === 0) return 'today'
  if (daysOld <= 3) return '1-3 days'
  if (daysOld <= 7) return '3-7 days'
  return '>7 days'
}

export default async function FinanceDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Ffinance')

  const now = new Date()

  const totalOutstanding = allMous
    .filter((m) => m.status === 'Active')
    .reduce((s, m) => s + (m.balance ?? 0), 0)

  const monthIsoPrefix = now.toISOString().slice(0, 7)
  const pisIssuedThisMonth = allPayments.filter(
    (p) => p.piGeneratedAt?.startsWith(monthIsoPrefix) ?? false,
  ).length

  const adjustmentsActive = allAdjustments.filter(
    (a) => a.status === 'Active',
  ).length

  const unmatched = allPaymentLogs
    .filter((pl) => pl.unmatched || (pl.matchedInstallmentIds ?? []).length === 0)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10)

  const ageBuckets: Record<string, number> = {
    today: 0,
    '1-3 days': 0,
    '3-7 days': 0,
    '>7 days': 0,
  }
  for (const pl of unmatched) {
    const b = bucketByAge(daysBetween(pl.date, now))
    ageBuckets[b] = (ageBuckets[b] ?? 0) + 1
  }

  const awaiting = allPayments
    .filter((p) => p.piGeneratedAt !== null && p.receivedDate === null)
    .slice()
    .sort((a, b) => (a.piGeneratedAt! < b.piGeneratedAt! ? 1 : -1))
    .slice(0, 10)

  // Scan payment auditLogs for a tally-export entry; if none present
  // in the data, show "never". The action verb is not in the canonical
  // AuditAction union today (would be added when Tally export actually
  // audits); the cast accepts whatever string surfaces.
  let lastTallyExportTs: string | null = null
  for (const p of allPayments) {
    const pool = (p.auditLog ?? []) as unknown as Array<{
      action: string
      timestamp: string
    }>
    for (const ae of pool) {
      if (ae.action !== 'tally-export') continue
      if (!lastTallyExportTs || ae.timestamp > lastTallyExportTs) {
        lastTallyExportTs = ae.timestamp
      }
    }
  }

  return (
    <>
      <TopNav currentPath="/dashboard/finance" />
      <main id="main-content" data-testid="finance-dashboard">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header>
            <h1 className="font-heading text-2xl font-bold text-brand-navy">
              Finance workspace
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              PIs, payments, adjustments, Tally export in one view.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiTile
              icon={<AlertCircle aria-hidden className="size-5 text-violet-600" />}
              label="Total outstanding"
              value={formatRs(totalOutstanding)}
              href="/finance/payments/unmatched"
              hrefLabel="Reconcile unmatched"
              testId="kpi-outstanding"
            />
            <KpiTile
              icon={<FileText aria-hidden className="size-5 text-brand-teal" />}
              label="PIs issued this month"
              value={`${pisIssuedThisMonth}`}
              href="/finance/payments?status=PI-issued"
              hrefLabel="View list"
              testId="kpi-pis-issued"
            />
            <KpiTile
              icon={<Receipt aria-hidden className="size-5 text-amber-600" />}
              label="Adjustments active"
              value={`${adjustmentsActive}`}
              href="/finance/adjustments"
              hrefLabel="Manage adjustments"
              testId="kpi-adjustments"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PaymentsAttentionCard
              unmatched={unmatched}
              ageBuckets={ageBuckets}
              now={now}
            />
            <PisAwaitingCard payments={awaiting} now={now} />
          </div>

          <div className="rounded-md border border-border bg-card p-3 text-sm text-slate-700">
            Last Tally export:{' '}
            <strong className="text-brand-navy">
              {lastTallyExportTs
                ? new Date(lastTallyExportTs).toISOString().slice(0, 10)
                : 'never'}
            </strong>
            .{' '}
            <Link
              href="/finance/tally-export"
              className="font-semibold text-brand-navy underline-offset-2 hover:underline"
              data-testid="tally-export-cta"
            >
              Run new export <ArrowRight aria-hidden className="ml-0.5 inline size-3" />
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}

function KpiTile({
  icon,
  label,
  value,
  href,
  hrefLabel,
  testId,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href: string
  hrefLabel: string
  testId: string
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4" data-testid={testId}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs uppercase tracking-wide text-slate-600">{label}</span>
      </div>
      <div className="mt-2 font-heading text-2xl font-bold text-brand-navy">{value}</div>
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        {hrefLabel} <ArrowRight aria-hidden className="size-3" />
      </Link>
    </div>
  )
}

function PaymentsAttentionCard({
  unmatched,
  ageBuckets,
  now,
}: {
  unmatched: PaymentLog[]
  ageBuckets: Record<string, number>
  now: Date
}) {
  return (
    <section
      data-testid="payments-attention-card"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          Payments needing attention
        </h2>
        <span className="text-xs text-slate-600">{unmatched.length} unmatched</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {(['today', '1-3 days', '3-7 days', '>7 days'] as const).map((b) => (
          <span
            key={b}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-slate-700"
            data-testid={`age-bucket-${b.replace(/[^a-z0-9]+/gi, '-')}`}
          >
            {b}: {ageBuckets[b] ?? 0}
          </span>
        ))}
      </div>
      {unmatched.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No unmatched bank entries. Reconciliation is current.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {unmatched.map((pl) => {
            const days = daysBetween(pl.date, now)
            const matchHref = `/finance/payments?amount=${pl.amount}&date=${encodeURIComponent(pl.date)}&narration=${encodeURIComponent(pl.narration ?? '')}`
            return (
              <li key={pl.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-brand-navy">{formatRs(pl.amount)}</div>
                  <div className="truncate text-xs text-slate-600">
                    {pl.narration ?? '(no narration)'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {pl.date}
                    {days !== null && days > 0 ? ` · ${days}d ago` : ''}
                  </div>
                </div>
                <Link
                  href={matchHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-teal bg-brand-teal px-2 py-1 text-xs font-semibold text-white hover:bg-brand-teal/90"
                >
                  Match
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PisAwaitingCard({ payments, now }: { payments: Payment[]; now: Date }) {
  return (
    <section
      data-testid="pis-awaiting-card"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          PIs awaiting payment
        </h2>
        <span className="text-xs text-slate-600">{payments.length} open</span>
      </div>
      {payments.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No PIs awaiting payment.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {payments.map((p) => {
            const daysSince = daysBetween(p.piGeneratedAt, now)
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-brand-navy">
                    {p.piNumber ?? p.id}
                  </div>
                  <div className="truncate text-xs text-slate-600">{p.schoolName}</div>
                  <div className="text-[11px] text-slate-500">
                    {p.piGeneratedAt?.slice(0, 10)}
                    {daysSince !== null ? ` · ${daysSince}d since issued` : ''}
                  </div>
                </div>
                <Link
                  href={`/mous/${p.mouId}/installments/${p.id}/mark-pi-sent`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-brand-navy hover:bg-slate-50"
                >
                  Re-send PI
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
