/*
 * DashboardStatCards (W4-I.5 Phase 2 commit 1).
 *
 * Six stat cards laid out in a single row (responsive: 1 col mobile,
 * 2 cols tablet, 6 cols desktop). Each card matches the reference:
 * top-right icon + label + large bold primary number + small unit
 * suffix + subtitle line + CTA button at bottom.
 *
 * Per Phase 2 strategy ("build StatCard inline; factor into ui/ only
 * if used 3+ places after Phase 2 lands"): the StatCard primitive is
 * defined inside this file and not yet exported. Phase 4 may extract
 * it to src/components/ui/ once we see whether other surfaces want
 * the same shape.
 */

import Link from 'next/link'
import {
  ArrowRight,
  ClipboardList,
  GraduationCap,
  PackageCheck,
  Truck,
  AlertOctagon,
  Boxes,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StatCardData } from '@/lib/dashboard/dashboardData'

const ICONS: Record<StatCardData['iconKey'], LucideIcon> = {
  mous: ClipboardList,
  schools: GraduationCap,
  orders: PackageCheck,
  shipments: Truck,
  escalations: AlertOctagon,
  inventory: Boxes,
}

const ICON_TINT: Record<StatCardData['iconKey'], string> = {
  mous: 'bg-brand-navy/10 text-brand-navy',
  schools: 'bg-brand-teal/10 text-brand-navy',
  orders: 'bg-brand-teal/10 text-brand-navy',
  shipments: 'bg-brand-teal/10 text-brand-navy',
  escalations: 'bg-signal-alert/10 text-signal-alert',
  inventory: 'bg-brand-teal/10 text-brand-navy',
}

const CTA_BY_VARIANT: Record<StatCardData['ctaVariant'], string> = {
  navy: 'bg-brand-navy text-white hover:bg-brand-navy/90 focus-visible:ring-brand-navy',
  teal: 'bg-brand-teal text-brand-navy hover:bg-brand-teal/90 focus-visible:ring-brand-navy',
  alert: 'bg-signal-alert text-white hover:bg-signal-alert/90 focus-visible:ring-signal-alert',
}

interface StatCardProps {
  data: StatCardData
}

function StatCard({ data }: StatCardProps) {
  const Icon = ICONS[data.iconKey]
  return (
    <article
      className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md sm:p-5"
      data-testid={`stat-card-${data.key}`}
    >
      <header className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {data.label}
        </p>
        <span
          aria-hidden
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${ICON_TINT[data.iconKey]}`}
        >
          <Icon className="size-5" />
        </span>
      </header>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-bold text-brand-navy sm:text-4xl">
          {data.primary}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{data.primaryUnit}</span>
      </div>
      <p className="mt-1 min-h-[18px] text-xs text-muted-foreground">{data.subtitle}</p>
      <div className="mt-4 flex-1" />
      <Link
        href={data.ctaHref}
        className={
          'inline-flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '
          + CTA_BY_VARIANT[data.ctaVariant]
        }
        data-testid={`stat-card-${data.key}-cta`}
      >
        <span>{data.ctaLabel}</span>
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </article>
  )
}

export interface DashboardStatCardsProps {
  cards: StatCardData[]
}

export function DashboardStatCards({ cards }: DashboardStatCardsProps) {
  return (
    <section
      aria-label="Operational summary"
      data-testid="dashboard-stat-cards"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      {cards.map((card) => (
        <StatCard key={card.key} data={card} />
      ))}
    </section>
  )
}
