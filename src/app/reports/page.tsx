/*
 * /reports landing page (Gate 5A Step 1).
 *
 * Lists the 5 reports as click-through cards. Cards the current user
 * cannot access are filtered out via visibleReports(); a department
 * user therefore only sees fy-summary + escalations + their own
 * department's report.
 *
 * Single-<main> rule: the root layout owns the only <main>; this
 * page wraps in a <section>.
 */

import { redirect } from 'next/navigation'
import {
  BarChart3,
  Truck,
  Users,
  AlertTriangle,
  Wallet,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { ReportCard } from '@/components/reports/ReportCard'
import { visibleReports, type ReportSlug } from '@/lib/reports/access'

interface ReportEntry {
  slug: ReportSlug
  title: string
  description: string
  icon: typeof BarChart3
}

const ENTRIES: ReportEntry[] = [
  {
    slug: 'fy-summary',
    title: 'FY summary',
    description:
      'Headline numbers, programme-wise breakdown, and monthly receipts for the fiscal year.',
    icon: BarChart3,
  },
  {
    slug: 'sales-performance',
    title: 'Sales performance',
    description:
      'Per-rep MOU count and contract value, with top 5 and bottom 5 leaderboards.',
    icon: Users,
  },
  {
    slug: 'dispatch-performance',
    title: 'Dispatch performance',
    description:
      'Turnaround days from MOU sign through delivery, plus a stalled dispatches list.',
    icon: Truck,
  },
  {
    slug: 'payment-aging',
    title: 'Payment aging',
    description:
      'Outstanding amounts bucketed by age, top 10 overdue accounts, and unpaid PIs.',
    icon: Wallet,
  },
  {
    slug: 'escalations',
    title: 'Escalations',
    description:
      'Open escalations by department and severity, plus category trends.',
    icon: AlertTriangle,
  },
]

export default async function ReportsIndex() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports')
  const allowed = new Set(visibleReports(user))
  const visible = ENTRIES.filter((e) => allowed.has(e.slug))

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="reports-index">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header>
            <h1 className="font-heading text-2xl font-bold text-brand-navy">
              Reports
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Five report views computed from live data.
            </p>
          </header>
          {visible.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-6 text-sm text-slate-600">
              No reports are available for your role. Ask an administrator
              for access.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visible.map((entry) => (
                <li key={entry.slug}>
                  <ReportCard
                    href={`/reports/${entry.slug}`}
                    title={entry.title}
                    description={entry.description}
                    icon={entry.icon}
                    testId={`report-card-${entry.slug}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
