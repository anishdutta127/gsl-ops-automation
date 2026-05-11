/*
 * ConsolidatedLanding (Gate 3.6 Steps 1-3 + 6).
 *
 * The five-zone orientation surface that sits at /. Designed for the
 * five-second test: when a leadership / ops / finance user opens the
 * platform, they should be oriented in five seconds and a click away
 * from their workspace.
 *
 * Zones, top to bottom:
 *   Zone 1: Commercial position (4 KPIs + sparkline)
 *   Zone 2: Operational position (3 columns)
 *   Zone 3: Items requiring attention (max 5)
 *   Zone 4: Quick actions (5 outlined buttons)
 *   Zone 5: Drill-down tiles (Finance / Operations / Leadership)
 *
 * Visual discipline (DESIGN.md):
 *   - One primary purpose per zone: orient, not analyse.
 *   - Calm card design: 1px border, no background fills.
 *   - Tailwind tokens only (no raw hex codes).
 *   - Lucide icons; no emoji.
 *   - British English copy; no em-dashes.
 *   - WCAG AA: every icon has aria-hidden or aria-label; focus rings on
 *     every interactive element.
 */

import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Info,
  MessageSquareWarning,
  PackagePlus,
  Plus,
  Truck,
} from 'lucide-react'
import { formatRs } from '@/lib/format'
import type {
  CommercialPosition,
  FinanceTileKpis,
  LandingAttentionItem,
  LandingAttentionSeverity,
  LeadershipTileKpis,
  OperationalPosition,
  OpsTileKpis,
} from '@/lib/dashboard/landingData'
import { type MonthlyReceiptPoint } from '@/lib/dashboard/leadershipData'
import {
  STAGE_LABEL,
  STAGE_ORDER,
  type LifecycleStage,
} from '@/lib/statusTracker'

interface Props {
  commercial: CommercialPosition
  operational: OperationalPosition
  attention: LandingAttentionItem[]
  finance: FinanceTileKpis
  ops: OpsTileKpis
  leadership: LeadershipTileKpis
  fyLabel: string
}

export function ConsolidatedLanding({
  commercial,
  operational,
  attention,
  finance,
  ops,
  leadership,
  fyLabel,
}: Props) {
  // Gate 4.95 Step 4: drill-down tiles promoted above Quick actions
  // and Items requiring attention so a user opening the platform sees
  // their department dashboard as the next-action option before
  // scanning attention items. Order: Commercial -> Operational ->
  // Drill-down tiles -> Quick actions -> Items requiring attention.
  return (
    <div className="flex flex-col gap-6" data-testid="landing-zones">
      <CommercialZone data={commercial} fyLabel={fyLabel} />
      <OperationalZone data={operational} />
      <DrillDownZone finance={finance} ops={ops} leadership={leadership} />
      <QuickActionsZone />
      <AttentionZone items={attention} />
    </div>
  )
}

// ===========================================================================
// Zone 1: Commercial position
// ===========================================================================

function CommercialZone({
  data,
  fyLabel,
}: {
  data: CommercialPosition
  fyLabel: string
}) {
  const delta = data.signedContractValueDeltaPct
  const deltaLabel =
    delta === null
      ? 'no prior FY baseline'
      : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs FY ${priorFyShort(fyLabel)}`
  return (
    <section
      aria-labelledby="commercial-heading"
      data-testid="zone-commercial"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="commercial-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Commercial position
        </h2>
        <span className="text-xs text-slate-500">FY {fyLabel}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <KpiBlock
          label="Signed contract value"
          value={formatRs(data.signedContractValueFy, { compact: true })}
          subtitle={deltaLabel}
          testId="kpi-signed-contract"
        />
        <KpiBlock
          label="Received"
          value={formatRs(data.receivedFy, { compact: true })}
          subtitle={`${data.collectionPct.toFixed(1)}% collected`}
          testId="kpi-received"
        />
        <KpiBlock
          label="Outstanding"
          value={formatRs(data.outstanding, { compact: true })}
          subtitle="across active MOUs"
          testId="kpi-outstanding"
        />
        <KpiBlock
          label="Active schools"
          value={`${data.activeSchools}`}
          subtitle={data.activeSchools === 1 ? 'school' : 'schools'}
          testId="kpi-active-schools"
        />
      </div>
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-600">
            Monthly receipts (12-month trend)
          </span>
          <span className="text-[11px] text-slate-500">
            {data.monthlyReceipts[0]?.month} to {data.monthlyReceipts[11]?.month}
          </span>
        </div>
        <ReceiptSparkline points={data.monthlyReceipts} />
      </div>
      <div className="mt-4 flex justify-end">
        <Link
          href="/dashboard/finance"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="commercial-finance-link"
        >
          View finance dashboard <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
    </section>
  )
}

function KpiBlock({
  label,
  value,
  subtitle,
  testId,
}: {
  label: string
  value: string
  subtitle?: string
  testId?: string
}) {
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className="mt-1 truncate font-heading text-xl font-bold text-brand-navy sm:text-2xl">
        {value}
      </div>
      {subtitle && (
        <div className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</div>
      )}
    </div>
  )
}

function priorFyShort(fy: string): string {
  const m = fy.match(/^(\d{4})-(\d{2})$/)
  if (!m) return fy
  const startYear = Number(m[1])
  const endShort = String(startYear % 100).padStart(2, '0')
  return `${startYear - 1}-${endShort}`
}

function ReceiptSparkline({ points }: { points: MonthlyReceiptPoint[] }) {
  if (points.length === 0) return null
  const max = Math.max(...points.map((p) => p.amount), 1)
  const width = 480
  const height = 56
  const stepX = width / Math.max(1, points.length - 1)
  const path = points
    .map((p, i) => {
      const x = i * stepX
      const y = height - (p.amount / max) * (height - 6) - 3
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = points[points.length - 1]
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 h-14 w-full text-brand-teal"
      role="img"
      aria-label="Monthly receipts trend over the last 12 months"
      data-testid="commercial-sparkline"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <circle
          cx={(points.length - 1) * stepX}
          cy={height - (last.amount / max) * (height - 6) - 3}
          r="2.5"
          fill="currentColor"
        />
      )}
    </svg>
  )
}

// ===========================================================================
// Zone 2: Operational position
// ===========================================================================

// Stage palette: completed stages on the brand-teal end, current /
// transit-in-progress on amber, pre-onboarding on navy. The palette
// is deliberately tonal rather than per-stage rainbow so a 10-segment
// bar still reads cleanly at landing-card width.
const STAGE_BAR_CLASS: Record<LifecycleStage, string> = {
  pipeline: 'bg-slate-400',
  'mou-uploaded': 'bg-slate-500',
  active: 'bg-brand-navy/70',
  'payment-pending': 'bg-amber-500',
  'installment-1-received': 'bg-amber-600',
  'pi-generated': 'bg-violet-500',
  'dispatch-requested': 'bg-orange-500',
  'shipment-in-progress': 'bg-orange-600',
  delivered: 'bg-brand-teal',
  closed: 'bg-emerald-600',
}

function OperationalZone({ data }: { data: OperationalPosition }) {
  const stageTotal = STAGE_ORDER.reduce((sum, s) => sum + data.byStage[s], 0)
  const stageDenominator = stageTotal || 1
  return (
    <section
      aria-labelledby="operational-heading"
      data-testid="zone-operational"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="operational-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Operational position
        </h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Link
          href="/mous"
          data-testid="op-pipeline-by-stage"
          className="block rounded-md border border-border bg-white p-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <div className="text-[11px] uppercase tracking-wide text-slate-600">
            MOUs in pipeline
          </div>
          <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
            {stageTotal}
          </div>
          <div
            className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
            data-testid="stage-bar"
            role="img"
            aria-label={`Pipeline by stage: ${STAGE_ORDER.map(
              (s) => `${STAGE_LABEL[s]} ${data.byStage[s]}`,
            ).join(', ')}`}
          >
            {STAGE_ORDER.map((s) => {
              const segWidth = (data.byStage[s] / stageDenominator) * 100
              if (segWidth === 0) return null
              return (
                <div
                  key={s}
                  className={STAGE_BAR_CLASS[s]}
                  style={{ width: `${segWidth}%` }}
                  title={`${STAGE_LABEL[s]}: ${data.byStage[s]}`}
                  data-testid={`stage-seg-${s}`}
                />
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
            {STAGE_ORDER.map((s) =>
              data.byStage[s] > 0 ? (
                <span key={s} className="inline-flex items-center gap-1">
                  <span
                    className={`inline-block size-2 rounded-sm ${STAGE_BAR_CLASS[s]}`}
                    aria-hidden
                  />
                  {STAGE_LABEL[s]}: {data.byStage[s]}
                </span>
              ) : null,
            )}
          </div>
        </Link>
        <Link
          href="/dispatch?status=In+Transit"
          data-testid="op-in-transit"
          className="block rounded-md border border-border bg-white p-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <div className="text-[11px] uppercase tracking-wide text-slate-600">
            In transit
          </div>
          <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
            {data.inTransit}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            kit shipments in flight today
          </div>
        </Link>
        <Link
          href="/dispatch/kits"
          data-testid="op-pending-allocation"
          className="block rounded-md border border-border bg-white p-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <div className="text-[11px] uppercase tracking-wide text-slate-600">
            Pending allocation
          </div>
          <div className="mt-1 font-heading text-2xl font-bold text-brand-navy">
            {data.pendingAllocation}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            signed MOUs awaiting grade-wise split
          </div>
        </Link>
      </div>
      <div className="mt-4 flex justify-end">
        <Link
          href="/dashboard/ops"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="operational-ops-link"
        >
          View operations dashboard <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
    </section>
  )
}

// ===========================================================================
// Zone 3: Items requiring attention
// ===========================================================================

const SEVERITY_ICON: Record<LandingAttentionSeverity, React.ReactNode> = {
  p0: <AlertCircle aria-hidden className="size-4 text-signal-alert" />,
  p1: <AlertTriangle aria-hidden className="size-4 text-amber-600" />,
  info: <Info aria-hidden className="size-4 text-blue-600" />,
}

const SEVERITY_LABEL: Record<LandingAttentionSeverity, string> = {
  p0: 'P0',
  p1: 'P1',
  info: 'Info',
}

function AttentionZone({ items }: { items: LandingAttentionItem[] }) {
  return (
    <section
      aria-labelledby="attention-heading"
      data-testid="zone-attention"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="attention-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Items requiring attention
        </h2>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p
          className="mt-4 flex items-center gap-2 text-sm text-slate-600"
          data-testid="attention-empty"
        >
          <CheckCircle2 aria-hidden className="size-4 text-signal-ok" />
          Nothing requires attention today.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item, i) => (
            <li key={`${item.href}-${i}`} className="py-2">
              <Link
                href={item.href}
                data-testid={`attention-item-${item.severity}`}
                className="flex items-center justify-between gap-3 rounded-sm text-sm text-foreground hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {SEVERITY_ICON[item.severity]}
                  <span className="sr-only">
                    {SEVERITY_LABEL[item.severity]} item:
                  </span>
                  <span className="truncate">{item.description}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Link
          href="/escalations"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="attention-all-link"
        >
          View all open items <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
    </section>
  )
}

// ===========================================================================
// Zone 4: Quick actions
// ===========================================================================

interface QuickAction {
  href: string
  label: string
  icon: React.ReactNode
  testId: string
  tooltip: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: '/mous/new',
    label: 'New MOU',
    icon: <Plus aria-hidden className="size-4" />,
    testId: 'quick-new-mou',
    tooltip: 'Draft a new MOU for a school',
  },
  {
    href: '/finance/payments/unmatched',
    label: 'Match payment',
    icon: <CircleDollarSign aria-hidden className="size-4" />,
    testId: 'quick-match-payment',
    tooltip: 'Reconcile a bank entry against an open installment',
  },
  {
    href: '/dispatch/kits',
    label: 'Raise dispatch',
    icon: <PackagePlus aria-hidden className="size-4" />,
    testId: 'quick-raise-dispatch',
    tooltip: 'Allocate kits and raise a new dispatch',
  },
  {
    // Gate 4 Step 5 carry-forward: the dedicated /escalations/new flow
    // landed in Gate 4. The button now opens the create form so any
    // logged-in user can raise a ticket directly. Resolution stays
    // scoped to the owning department via 'escalation:resolve'.
    href: '/escalations/new',
    label: 'Raise escalation',
    icon: <MessageSquareWarning aria-hidden className="size-4" />,
    testId: 'quick-raise-escalation',
    tooltip: 'Log a new escalation against a school or MOU',
  },
  {
    // Gate 4 Step 6 carry-forward: the pending-PI shortlist landed in
    // Gate 4 so the button now opens that surface directly (overdue +
    // due-within-30d installments without a PI yet, gated by the
    // PI parallel build lock).
    href: '/finance/pi/pending',
    label: 'Generate PI',
    icon: <FileText aria-hidden className="size-4" />,
    testId: 'quick-generate-pi',
    tooltip: 'Open the pending-PI shortlist and generate against an installment',
  },
]

function QuickActionsZone() {
  return (
    <section
      aria-labelledby="quick-actions-heading"
      data-testid="zone-quick-actions"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h2
        id="quick-actions-heading"
        className="font-heading text-base font-semibold text-brand-navy"
      >
        Quick actions
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.href} className="flex">
            <Link
              href={action.href}
              data-testid={action.testId}
              title={action.tooltip}
              aria-label={`${action.label}: ${action.tooltip}`}
              className="flex w-full min-h-11 items-center justify-center gap-2 rounded-md border border-brand-navy/40 bg-white px-3 py-2 text-sm font-medium text-brand-navy transition hover:border-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              {action.icon}
              <span>{action.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ===========================================================================
// Zone 5: Drill-down tiles
// ===========================================================================

function DrillDownZone({
  finance,
  ops,
  leadership,
}: {
  finance: FinanceTileKpis
  ops: OpsTileKpis
  leadership: LeadershipTileKpis
}) {
  return (
    <section
      aria-labelledby="drill-down-heading"
      data-testid="zone-drill-down"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <h2 id="drill-down-heading" className="sr-only">
        Department dashboards
      </h2>
      <DrillTile
        href="/dashboard/finance"
        testId="tile-finance"
        accentClass="border-l-violet-500"
        iconBgClass="bg-violet-100"
        iconTextClass="text-violet-700"
        icon={<CircleDollarSign aria-hidden className="size-6" />}
        title="Finance health"
        subtitle="PIs, payments, adjustments, Tally export."
        kpis={[
          { label: 'Outstanding', value: formatRs(finance.outstanding, { compact: true }) },
          { label: 'PIs awaiting', value: `${finance.pisAwaitingPayment}` },
          { label: 'Unmatched', value: `${finance.unmatchedPayments}` },
        ]}
      />
      <DrillTile
        href="/dashboard/ops"
        testId="tile-ops"
        accentClass="border-l-orange-500"
        iconBgClass="bg-orange-100"
        iconTextClass="text-orange-700"
        icon={<Truck aria-hidden className="size-6" />}
        title="Operations"
        subtitle="Schools, dispatches, escalations, inventory."
        kpis={[
          { label: 'Active dispatches', value: `${ops.activeDispatches}` },
          { label: 'Pending allocation', value: `${ops.pendingAllocation}` },
          { label: 'Open escalations', value: `${ops.openEscalations}` },
        ]}
      />
      <DrillTile
        href="/dashboard/leadership"
        testId="tile-leadership"
        accentClass="border-l-slate-500"
        iconBgClass="bg-slate-100"
        iconTextClass="text-slate-700"
        icon={<BarChart3 aria-hidden className="size-6" />}
        title="Leadership view"
        subtitle="Money, delivery, attention items."
        kpis={[
          { label: 'Active schools', value: `${leadership.activeSchools}` },
          { label: 'Collected', value: `${leadership.collectionPct.toFixed(0)}%` },
          { label: 'P0 escalations', value: `${leadership.openP0Escalations}` },
        ]}
      />
    </section>
  )
}

function DrillTile({
  href,
  testId,
  accentClass,
  iconBgClass,
  iconTextClass,
  icon,
  title,
  subtitle,
  kpis,
}: {
  href: string
  testId: string
  accentClass: string
  iconBgClass: string
  iconTextClass: string
  icon: React.ReactNode
  title: string
  subtitle: string
  kpis: { label: string; value: string }[]
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={
        'group flex flex-col rounded-lg border border-border border-l-4 bg-card p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy sm:p-5 ' +
        accentClass
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-md ${iconBgClass} ${iconTextClass}`}
        >
          {icon}
        </span>
        <ArrowRight
          aria-hidden
          className="mt-2 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
        />
      </div>
      <div className="mt-3">
        <div className="font-heading text-lg font-bold text-brand-navy">
          {title}
        </div>
        <div className="mt-0.5 text-xs text-slate-600">{subtitle}</div>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        {kpis.map((k) => (
          <li key={k.label} className="min-w-0">
            <div className="truncate text-[10px] uppercase tracking-wide text-slate-500">
              {k.label}
            </div>
            <div className="mt-0.5 truncate font-heading text-sm font-bold text-brand-navy">
              {k.value}
            </div>
          </li>
        ))}
      </ul>
      <span className="mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-brand-navy">
        Go
        <ArrowRight aria-hidden className="size-3" />
      </span>
    </Link>
  )
}
