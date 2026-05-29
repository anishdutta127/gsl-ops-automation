/*
 * /finance (Gate 2 Step 6 : full Finance workspace index).
 *
 * Replaces the Gate 1 Step 3 stub. Quick-link cards to the four
 * Gate-2 sub-routes (payments matcher, unmatched queue, tally export,
 * adjustments log) plus a pointer back at the per-MOU PI route at
 * /mous/[id]/pi which the existing flow uses. The /finance/pi/[id]
 * route surfaces a single PI when navigated directly (e.g., from an
 * audit row link) but is not a primary entry-point.
 *
 * View gate: canAccessFinance (Finance + Admin + Leadership read-only
 * in production lockdown). Testing-mode toggle keeps the route open
 * for every active user.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Banknote, FileX2, IndianRupee, Receipt, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { accentFor } from '@/lib/departmentAccents'
// P4 batch 3a (2026-05-24): live repo reads.
import { paymentRepo } from '@/lib/db/repos/payment'
import { paymentLogRepo, adjustmentRepo } from '@/lib/db/repos/leafRepos'
import type { Adjustment, PaymentLog } from '@/lib/types'

interface QuickLink {
  href: string
  label: string
  description: string
  icon: LucideIcon
  count: number | null
  unit: string | null
}

export default async function FinanceIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const accent = accentFor('finance')

  const [allLogs, allAdjustments, allPayments] = await Promise.all([
    paymentLogRepo.findAll() as Promise<PaymentLog[]>,
    adjustmentRepo.findAll() as Promise<Adjustment[]>,
    paymentRepo.findAll(),
  ])

  const unmatchedCount = allLogs.filter((l) => l.unmatched).length
  const activeAdjustments = allAdjustments.filter((a) => a.status === 'Active').length
  const pendingMatch = allPayments.filter(
    (p) => p.status === 'PI Sent' || p.status === 'Due Soon' || p.status === 'Overdue',
  ).length

  const links: QuickLink[] = [
    // Round 4 nav: Log Payment moved here from the global TopNav pill.
    // First card so it leads the daily Finance workflow (log -> match
    // -> unmatched).
    {
      href: '/finance/payments/new',
      label: 'Log a payment',
      description:
        'Record what hit the bank. Narrow to school, MOU, instalment for an auto-match, or park as unmatched.',
      icon: IndianRupee,
      count: null,
      unit: null,
    },
    {
      href: '/finance/payments',
      label: 'Match a payment',
      description:
        'Enter what hit the bank; the matcher ranks candidate Proforma Invoices and you Confirm the match.',
      icon: Banknote,
      count: pendingMatch,
      unit: pendingMatch === 1 ? 'Awaiting Match' : 'Awaiting Match',
    },
    {
      href: '/finance/payments/unmatched',
      label: 'Unmatched payments',
      description: 'Bank entries parked without an instalment match. Re-attempt match from this list.',
      icon: FileX2,
      count: unmatchedCount,
      unit: unmatchedCount === 1 ? 'Parked' : 'Parked',
    },
    {
      href: '/finance/tally-export',
      label: 'Tally export',
      description: 'Generate Tally Prime 6.2 voucher XML for a fiscal year + entity selection.',
      icon: Receipt,
      count: null,
      unit: null,
    },
    {
      href: '/finance/adjustments',
      label: 'Adjustments',
      description:
        'Adjustment-as-line-item log. Reverse an active adjustment from the detail view.',
      icon: ScrollText,
      count: activeAdjustments,
      unit: activeAdjustments === 1 ? 'Active' : 'Active',
    },
  ]

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <header
            className={
              'rounded-md border border-border border-l-4 bg-card p-6 ' +
              accent.cardBorderClass
            }
          >
            <span
              className={
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ' +
                accent.badgeBgClass +
                ' ' +
                accent.badgeTextClass
              }
            >
              Finance workspace
            </span>
            <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              Finance workspace
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Bank-entry matching, Tally export, adjustment log. PI generation lives on the per-MOU route at /mous/[id]/pi.
            </p>
          </header>

          <ul className="grid gap-3 sm:grid-cols-2">
            {links.map((link) => {
              const Icon = link.icon
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={
                      'group flex h-full items-start justify-between gap-3 rounded-md border border-border bg-card p-4 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy ' +
                      'border-l-4 ' +
                      accent.cardBorderClass
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon aria-hidden className="size-4 text-violet-700" />
                        <span className="font-medium text-brand-navy">{link.label}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{link.description}</p>
                      {link.count !== null ? (
                        <p className="mt-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-brand-navy">
                            {link.count}
                          </span>{' '}
                          {link.unit}
                        </p>
                      ) : null}
                    </div>
                    <ArrowRight
                      aria-hidden
                      className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </main>
    </>
  )
}
