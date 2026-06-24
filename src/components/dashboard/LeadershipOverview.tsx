/*
 * LeadershipOverview (Gate 3.5 Step 2 + Step 8).
 *
 * Renders the three-section Leadership console: "Are we making money?"
 * + "Are we delivering?" + "Needs leadership attention". Plus two
 * navigation tiles below (Finance health / Operations health).
 *
 * Used by /dashboard/leadership (Step 2) and prepended to /admin (Step
 * 8) so the Admin landing combines the leadership overview with the
 * Admin toolbox below.
 *
 * All data is computed at the page level (via leadershipData helpers)
 * and passed in as props so this component stays presentational.
 */

import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  IndianRupee,
  ShieldAlert,
  TrendingUp,
  Truck,
} from 'lucide-react'
import { formatRs } from '@/lib/format'
import {
  PROGRAMME_ORDER,
  PROGRAMME_PALETTE,
  type AttentionItem,
  type AttentionSeverity,
  type DeliveryHealth,
  type FinancialHealth,
  type MonthlyReceiptPoint,
  type SchoolBucket,
} from '@/lib/dashboard/leadershipData'

interface Props {
  financial: FinancialHealth
  delivery: DeliveryHealth
  attention: AttentionItem[]
  fyLabel: string
}

export function LeadershipOverview({
  financial,
  delivery,
  attention,
  fyLabel,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <MoneySection data={financial} fyLabel={fyLabel} />
      <DeliverySection data={delivery} />
      <AttentionSection items={attention} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TileLink
          href="/dashboard/finance"
          label="Finance health"
          description="PIs issued, payments matched, Tally export."
          accentClass="border-l-violet-500"
          icon={<IndianRupee aria-hidden className="size-5 text-violet-600" />}
        />
        <TileLink
          href="/"
          label="Operations health"
          description="Schools, dispatches, escalations, inventory."
          accentClass="border-l-orange-500"
          icon={<Truck aria-hidden className="size-5 text-orange-600" />}
        />
      </div>
    </div>
  )
}

function MoneySection({
  data,
  fyLabel,
}: {
  data: FinancialHealth
  fyLabel: string
}) {
  return (
    <section
      aria-labelledby="money-heading"
      data-testid="money-section"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h2
        id="money-heading"
        className="font-heading text-base font-semibold text-brand-navy"
      >
        Are we making money?
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi
          label="Signed contract value"
          subtitle={`FY ${fyLabel}`}
          value={formatRs(data.signedContractValueFy)}
          delta={
            data.signedContractValueDeltaPct !== null
              ? `${data.signedContractValueDeltaPct >= 0 ? '+' : ''}${data.signedContractValueDeltaPct.toFixed(1)}% YoY`
              : 'no prior FY'
          }
        />
        <Kpi
          label="Received"
          subtitle={`${data.collectionPct.toFixed(1)}% of target`}
          value={formatRs(data.receivedFy)}
        />
        <Kpi label="Outstanding" value={formatRs(data.outstanding)} />
        <Kpi
          label="Schools"
          subtitle={`${data.activeSchools} active of ${data.signedSchools} signed`}
          value={`${data.activeSchools}`}
        />
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-slate-600">
          Monthly receipts (last 12 months)
        </div>
        <Sparkline points={data.monthlyReceipts} />
      </div>
    </section>
  )
}

function Kpi({
  label,
  value,
  subtitle,
  delta,
}: {
  label: string
  value: string
  subtitle?: string
  delta?: string
}) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 font-heading text-lg font-bold text-brand-navy">{value}</div>
      {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
      {delta && (
        <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700">
          <TrendingUp aria-hidden className="size-3" /> {delta}
        </div>
      )}
    </div>
  )
}

function Sparkline({ points }: { points: MonthlyReceiptPoint[] }) {
  if (points.length === 0) return null
  const max = Math.max(...points.map((p) => p.amount), 1)
  const width = 480
  const height = 48
  const stepX = width / Math.max(1, points.length - 1)
  const path = points
    .map((p, i) => {
      const x = i * stepX
      const y = height - (p.amount / max) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastPoint = points[points.length - 1]
  return (
    <div className="mt-1 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-12 w-full min-w-[320px] text-brand-teal"
        role="img"
        aria-label="Monthly receipts sparkline"
        data-testid="sparkline"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {lastPoint && (
          <circle
            cx={(points.length - 1) * stepX}
            cy={height - (lastPoint.amount / max) * (height - 4) - 2}
            r="2"
            fill="currentColor"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0]?.month}</span>
        <span>{lastPoint?.month}</span>
      </div>
    </div>
  )
}

function DeliverySection({ data }: { data: DeliveryHealth }) {
  return (
    <section
      aria-labelledby="delivery-heading"
      data-testid="delivery-section"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h2
        id="delivery-heading"
        className="font-heading text-base font-semibold text-brand-navy"
      >
        Are we delivering?
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DeliveryColumn label="Active schools" bucket={data.active} tone="neutral" />
        <DeliveryColumn label="In trouble" bucket={data.inTrouble} tone="alert" />
        <DeliveryColumn label="Healthy" bucket={data.healthy} tone="ok" />
      </div>
    </section>
  )
}

function DeliveryColumn({
  label,
  bucket,
  tone,
}: {
  label: string
  bucket: SchoolBucket
  tone: 'neutral' | 'alert' | 'ok'
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: 'text-brand-navy',
    alert: 'text-signal-alert',
    ok: 'text-signal-ok',
  }
  const total = bucket.count || 1
  return (
    <Link
      href={`/schools${bucket.hrefQuery}`}
      className="block rounded-md border border-border bg-white p-3 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
      data-testid={`delivery-column-${tone}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-600">{label}</div>
      <div className={`mt-1 font-heading text-2xl font-bold ${toneClass[tone]}`}>
        {bucket.count}
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {PROGRAMME_ORDER.map((p) => {
          const count = bucket.byProgramme[p] ?? 0
          const segWidth = (count / total) * 100
          if (segWidth === 0) return null
          return (
            <div
              key={p}
              className={PROGRAMME_PALETTE[p]}
              style={{ width: `${segWidth}%` }}
              title={`${p}: ${count}`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
        {PROGRAMME_ORDER.map((p) =>
          (bucket.byProgramme[p] ?? 0) > 0 ? (
            <span key={p} className="inline-flex items-center gap-1">
              <span
                className={`inline-block size-2 rounded-sm ${PROGRAMME_PALETTE[p]}`}
                aria-hidden
              />
              {p}: {bucket.byProgramme[p] ?? 0}
            </span>
          ) : null,
        )}
      </div>
    </Link>
  )
}

const SEVERITY_ICON: Record<AttentionSeverity, React.ReactNode> = {
  'p0-escalation': <AlertCircle aria-hidden className="size-4 text-signal-alert" />,
  financial: <AlertTriangle aria-hidden className="size-4 text-amber-600" />,
  dispatch: <Truck aria-hidden className="size-4 text-orange-600" />,
  legal: <ShieldAlert aria-hidden className="size-4 text-violet-600" />,
  positive: <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />,
}

function AttentionSection({ items }: { items: AttentionItem[] }) {
  return (
    <section
      aria-labelledby="attention-heading"
      data-testid="attention-section"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h2
        id="attention-heading"
        className="font-heading text-base font-semibold text-brand-navy"
      >
        Needs leadership attention
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600" data-testid="attention-empty">
          No leadership-level items right now. The platform is healthy.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item, i) => (
            <li key={`${item.href}-${i}`} className="py-2">
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-sm text-sm text-foreground hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
                data-testid={`attention-item-${item.severity}`}
              >
                <span className="flex items-center gap-2">
                  {SEVERITY_ICON[item.severity]}
                  <span>{item.description}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TileLink({
  href,
  label,
  description,
  accentClass,
  icon,
}: {
  href: string
  label: string
  description: string
  accentClass: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        'group flex items-center justify-between gap-3 rounded-md border border-border border-l-4 bg-card p-4 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy ' +
        accentClass
      }
      data-testid={`tile-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="font-medium text-brand-navy">{label}</div>
          <div className="text-xs text-slate-600">{description}</div>
        </div>
      </div>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}
