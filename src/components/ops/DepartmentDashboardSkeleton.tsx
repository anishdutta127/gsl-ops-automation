/*
 * Shared department-dashboard skeleton (Gate 1 Step 3).
 *
 * Each of /dashboard/sales, /dashboard/ops, /dashboard/finance, and
 * /dashboard/leadership renders this skeleton with department-
 * specific copy + primary actions. Gate 5 will populate KPIs and
 * exception feeds; this gate ships the layout + dept-aware accent
 * + the empty-state placeholder.
 *
 * Composition (top to bottom):
 *   1. Welcome card with the user's name and a department badge.
 *   2. "Primary actions for [Department]" row of CTA buttons that
 *      link to the stages relevant to the department.
 *   3. "Recent activity" list, scoped to department (Phase 1 stub
 *      shows the latest 10 entries from any audited write; Gate 5
 *      narrows the scope per dept).
 *   4. KPI empty-state card pointing to the Reports module.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { User } from '@/lib/types'
import { accentFor, type StageDepartment } from '@/lib/departmentAccents'

export interface PrimaryAction {
  label: string
  href: string
  description?: string
}

export interface RecentActivityItem {
  id: string
  timestamp: string
  user: string
  action: string
  description: string
  href?: string
}

interface DepartmentDashboardSkeletonProps {
  user: User
  /** Drives the department badge, accent classes, and welcome copy. */
  stageDepartment: StageDepartment
  title: string
  subtitle: string
  primaryActions: PrimaryAction[]
  recentActivity: RecentActivityItem[]
}

const DATE_DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function DepartmentDashboardSkeleton({
  user,
  stageDepartment,
  title,
  subtitle,
  primaryActions,
  recentActivity,
}: DepartmentDashboardSkeletonProps) {
  const accent = accentFor(stageDepartment)
  const today = DATE_DISPLAY.format(new Date())

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
      <header
        className={
          'rounded-md border border-border border-l-4 bg-card p-6 ' +
          accent.cardBorderClass
        }
        data-testid="dashboard-welcome"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ' +
              accent.badgeBgClass +
              ' ' +
              accent.badgeTextClass
            }
            data-testid="dashboard-dept-badge"
            data-dept={stageDepartment}
          >
            {accent.label}
          </span>
          <span className="text-xs text-slate-500">{today}</span>
        </div>
        <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-700">{subtitle}</p>
        <p className="mt-3 text-sm text-slate-600">
          Welcome, <span className="font-medium text-brand-navy">{user.name}</span>.
        </p>
      </header>

      <section
        aria-labelledby="primary-actions-heading"
        className="rounded-md border border-border bg-card p-6"
      >
        <h2
          id="primary-actions-heading"
          className="font-heading text-lg font-semibold text-brand-navy"
        >
          Primary actions for {accent.label}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Quick links to the stages you spend most time in.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {primaryActions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className={
                  'group flex items-center justify-between rounded-md border border-border bg-card p-4 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy ' +
                  'border-l-4 ' +
                  accent.cardBorderClass
                }
              >
                <div>
                  <div className="font-medium text-brand-navy">{action.label}</div>
                  {action.description ? (
                    <div className="mt-0.5 text-sm text-slate-600">
                      {action.description}
                    </div>
                  ) : null}
                </div>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="recent-activity-heading"
        className="rounded-md border border-border bg-card p-6"
      >
        <h2
          id="recent-activity-heading"
          className="font-heading text-lg font-semibold text-brand-navy"
        >
          Recent activity
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The latest 10 audited events scoped to {accent.label}.
        </p>
        {recentActivity.length === 0 ? (
          <div
            className="mt-4 rounded-md border border-dashed border-border bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
            data-testid="dashboard-recent-activity-empty"
          >
            No recent activity yet. Activity entries appear here as the team works through the stages.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border" data-testid="dashboard-recent-activity">
            {recentActivity.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-brand-navy">{item.description}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {item.user} <span aria-hidden>&middot;</span> {item.action}
                    </div>
                  </div>
                  <time
                    className="shrink-0 text-xs text-slate-500"
                    dateTime={item.timestamp}
                  >
                    {item.timestamp.slice(0, 10)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="kpi-placeholder-heading"
        className="rounded-md border border-border bg-card p-6"
        data-testid="dashboard-kpi-empty-state"
      >
        <h2
          id="kpi-placeholder-heading"
          className="font-heading text-lg font-semibold text-brand-navy"
        >
          Headline metrics
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Detailed KPIs available in the Reports module (coming soon). Gate 5 will fold dispatch counts, payment cycles, escalation SLA breaches, and feedback ratings into this card.
        </p>
        <Link
          href="/reports"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-navy hover:underline"
        >
          Open Reports <ArrowRight aria-hidden className="size-4" />
        </Link>
      </section>
    </div>
  )
}
