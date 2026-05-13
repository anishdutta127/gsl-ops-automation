/*
 * /dashboard/finance (Gate 4.95 Session 2 rebuild).
 *
 * Rich Finance workspace combining the legacy two-card layout
 * (Payments needing attention + PIs awaiting payment) with the
 * Gate 4.95 sections: KPI strip, high-priority alerts, top overdue
 * payments + renewal needed, amount receipt summary, VEX kit orders,
 * programme breakdown. Filters live in a URL-mirrored bar at the top.
 *
 * The two-card middle layout from the previous build is preserved as
 * Row 3; do not restyle it without an explicit user ask.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type {
  Adjustment,
  Escalation,
  MOU,
  Payment,
  PaymentLog,
  School,
  VexDispatch,
  VexPi,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import adjustmentsJson from '@/data/adjustments.json'
import escalationsJson from '@/data/escalations.json'
import schoolsJson from '@/data/schools.json'
import vexPisJson from '@/data/vex_pis.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { formatRs } from '@/lib/format'
import {
  applyFilters,
  computeAmountReceiptSummary,
  computeHighPriorityAlerts,
  computeKpiStrip,
  computeProgrammeBreakdown,
  computeRenewalNeeded,
  computeTopOverduePayments,
  computeVexKitOrders,
  filterSubtitle,
  fyOptionsList,
  parseFinanceFilters,
  type FinanceFilters,
} from '@/lib/dashboard/financeDashboardData'
import { FinanceFilterBar } from '@/components/dashboard/FinanceFilterBar'
import { KpiStrip } from '@/components/dashboard/finance/KpiStrip'
import { HighPriorityAlertsPanel } from '@/components/dashboard/finance/HighPriorityAlertsPanel'
import { TopOverduePaymentsPanel } from '@/components/dashboard/finance/TopOverduePaymentsPanel'
import { RenewalNeededPanel } from '@/components/dashboard/finance/RenewalNeededPanel'
import { AmountReceiptSummary } from '@/components/dashboard/finance/AmountReceiptSummary'
import { VexKitOrdersTile } from '@/components/dashboard/finance/VexKitOrdersTile'
import { ProgrammeBreakdown } from '@/components/dashboard/finance/ProgrammeBreakdown'
import { EmptyState } from '@/components/ops/EmptyState'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allAdjustments = adjustmentsJson as unknown as Adjustment[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allSchools = schoolsJson as unknown as School[]
const allVexPis = vexPisJson as unknown as VexPi[]
const allVexDispatches = vexDispatchesJson as unknown as VexDispatch[]

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

function serializeFilters(f: FinanceFilters): string {
  const params = new URLSearchParams()
  if (f.programmes.length > 0) params.set('p', f.programmes.join(','))
  if (f.salesChannels.length > 0) params.set('sc', f.salesChannels.join(','))
  if (f.fy) params.set('fy', f.fy)
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  return params.toString()
}

function windowLabel(filters: FinanceFilters): string {
  if (filters.from || filters.to) {
    return `${filters.from ?? '...'} to ${filters.to ?? '...'}`
  }
  if (filters.fy) return `FY ${filters.fy}`
  return 'this FY'
}

export default async function FinanceDashboard({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Ffinance')

  const now = new Date()
  const filters = parseFinanceFilters(searchParams ?? {})
  const fyOptions = fyOptionsList(allMous, now)
  const subtitle = filterSubtitle(filters, now)

  const { filteredMous, filteredMouIds, filteredPayments, windowFrom, windowTo } =
    applyFilters({ mous: allMous, payments: allPayments, filters })

  const kpiStrip = computeKpiStrip({
    filteredMous,
    filteredPayments,
    filteredMouIds,
    now,
  })
  const highPriorityAlerts = computeHighPriorityAlerts({
    escalations: allEscalations,
    schools: allSchools,
    filteredMouIds,
  })
  const topOverdue = computeTopOverduePayments({ filteredPayments, now })
  const renewal = computeRenewalNeeded({ filteredMous, now })
  const receiptSummary = computeAmountReceiptSummary({
    filteredPayments,
    windowFrom,
    windowTo,
  })
  const vexKitOrders = computeVexKitOrders({
    vexPis: allVexPis,
    vexDispatches: allVexDispatches,
    windowFrom,
    windowTo,
  })
  const programmeBreakdown = computeProgrammeBreakdown(filteredMous)

  const qs = serializeFilters(filters)
  const receiptsHref = qs ? `/finance/receipts?${qs}` : '/finance/receipts'
  const wLabel = windowLabel(filters)
  const filterActive =
    filters.programmes.length > 0 ||
    filters.salesChannels.length > 0 ||
    filters.fy !== null ||
    filters.from !== null ||
    filters.to !== null

  // Existing two-card layout data (preserved).
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

  // Adjustments count surfaced in the Tally footer line.
  const adjustmentsActive = allAdjustments.filter(
    (a) => a.status === 'Active',
  ).length

  // Scan payment auditLogs for a tally-export entry; if none present
  // the footer shows "never". The action verb is not in the canonical
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
      <div data-testid="finance-dashboard">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header>
            <h1 className="font-heading text-2xl font-bold text-brand-navy">
              Finance workspace
            </h1>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </header>

          <FinanceFilterBar initialFilters={filters} fyOptions={fyOptions} />

          <KpiStrip
            data={kpiStrip}
            needsAttentionHref="/dashboard/finance#top-overdue-payments"
            scopeLabel={filters.fy ? `FY ${filters.fy}` : undefined}
          />

          <HighPriorityAlertsPanel alerts={highPriorityAlerts} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PaymentsAttentionCard
              unmatched={unmatched}
              ageBuckets={ageBuckets}
              now={now}
            />
            <PisAwaitingCard payments={awaiting} now={now} />
          </div>

          <div
            id="top-overdue-payments"
            className="grid scroll-mt-20 grid-cols-1 gap-4 lg:grid-cols-2"
          >
            <TopOverduePaymentsPanel rows={topOverdue} />
            <RenewalNeededPanel
              rows={renewal.rows}
              expiredCount={renewal.expiredCount}
              expiringSoonCount={renewal.expiringSoonCount}
            />
          </div>

          <AmountReceiptSummary
            data={receiptSummary}
            windowLabel={wLabel}
            receiptsHref={receiptsHref}
          />

          <VexKitOrdersTile data={vexKitOrders} windowLabel={wLabel} />

          <ProgrammeBreakdown
            rows={programmeBreakdown}
            filterActive={filterActive}
          />

          <div className="rounded-md border border-border bg-card p-3 text-sm text-slate-700">
            Last Tally export:{' '}
            <strong className="text-brand-navy">
              {lastTallyExportTs
                ? new Date(lastTallyExportTs).toISOString().slice(0, 10)
                : 'never'}
            </strong>
            . {adjustmentsActive} active{' '}
            {adjustmentsActive === 1 ? 'adjustment' : 'adjustments'}.{' '}
            <Link
              href="/finance/tally-export"
              className="font-semibold text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              data-testid="tally-export-cta"
            >
              Run new export <ArrowRight aria-hidden className="ml-0.5 inline size-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
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
        <EmptyState
          icon={<CheckCircle2 aria-hidden className="size-5 text-signal-ok" />}
          title="No unmatched bank entries."
          description="Reconciliation is current."
        />
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
