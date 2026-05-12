/*
 * HighPriorityAlertsPanel (Gate 4.95 Session 2, Row 2 of /dashboard/finance).
 *
 * Up to 4 critical or high-severity open escalations scoped to the
 * current filter window. Card surface: severity pill + type, school
 * name, description line-clamped to 2 lines. Empty state celebrates
 * a clean board.
 */

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { HighPriorityAlert } from '@/lib/dashboard/financeDashboardData'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'

interface Props {
  alerts: HighPriorityAlert[]
}

const SEVERITY_TONE: Record<
  'critical' | 'high' | 'medium',
  { tone: StatusChipTone; label: string }
> = {
  critical: { tone: 'alert', label: 'Critical' },
  high: { tone: 'attention', label: 'High' },
  medium: { tone: 'neutral', label: 'Medium' },
}

export function HighPriorityAlertsPanel({ alerts }: Props) {
  return (
    <section
      data-testid="high-priority-alerts-panel"
      aria-labelledby="high-priority-alerts-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="high-priority-alerts-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          High-priority alerts
        </h2>
        <Link
          href="/escalations"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          See all alerts <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
      {alerts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 aria-hidden className="size-5 text-signal-ok" />}
          title="No high-priority alerts."
          description="The dashboard view is clean."
        />
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link
                href={alert.href}
                data-testid={`alert-card-${alert.severity}`}
                className="block h-full rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                <div className="flex items-center gap-2">
                  <SeverityPill severity={alert.severity} />
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    {alert.type}
                  </span>
                </div>
                <div className="mt-2 font-semibold text-brand-navy">
                  {alert.schoolName}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {alert.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SeverityPill({ severity }: { severity: 'critical' | 'high' | 'medium' }) {
  const meta = SEVERITY_TONE[severity]
  return <StatusChip tone={meta.tone} label={meta.label} withDot={false} />
}
