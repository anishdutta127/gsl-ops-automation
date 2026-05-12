/*
 * /dashboard/leadership/accountability (Gate 4.9 Step 5).
 *
 * Single-page overview of stage ownership for Leadership. Reads the
 * stage_responsibility.json matrix, joins it with live MOU state to
 * compute per-stage counts + stalled-entity feed (>7 days at stage).
 *
 * Sections:
 *   - Top summary card: total stages configured, count of user-overridden
 *     stages, last-configuration-change line.
 *   - Middle table: 10 stages with responsible party + count of MOUs at
 *     that stage + count of stalled MOUs (>7 days since stage entry).
 *   - Bottom: top 10 stalled MOUs across all stages.
 *
 * Mobile (<640px): the 6-column table collapses to a card-per-stage
 * stack via the same Tailwind responsive utility set the rest of the
 * platform uses.
 */

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { AlertCircle, ArrowRight, ClipboardList, UserCog } from 'lucide-react'
import type {
  KitDispatch,
  MOU,
  Payment,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'
import {
  getResponsibilityMatrix,
  userOverrideCount,
} from '@/lib/stageResponsibility'
import {
  bucketByStage,
  computeStage,
  STAGE_LABEL,
  STAGE_ORDER,
  type LifecycleStage,
} from '@/lib/statusTracker'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allUsers = usersJson as unknown as User[]

const STALL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

interface StalledMou {
  mouId: string
  schoolName: string
  stage: LifecycleStage
  daysAtStage: number
  href: string
}

function computeStallsForMou(args: {
  mou: MOU
  payments: Payment[]
  dispatches: KitDispatch[]
  now: Date
}): StalledMou | null {
  const stage = computeStage({
    mou: args.mou,
    payments: args.payments,
    dispatches: args.dispatches,
    now: args.now,
  })
  // Use the most recent MOU audit-log entry timestamp as the proxy for
  // "stage entered at". Approximate but doesn't require a new field.
  const lastTs =
    args.mou.auditLog?.[args.mou.auditLog.length - 1]?.timestamp
    ?? args.mou.startDate
    ?? null
  if (!lastTs) return null
  const ts = new Date(lastTs).getTime()
  if (Number.isNaN(ts)) return null
  const days = (args.now.getTime() - ts) / (24 * 60 * 60 * 1000)
  if (args.now.getTime() - ts <= STALL_THRESHOLD_MS) return null
  if (stage === 'closed') return null
  return {
    mouId: args.mou.id,
    schoolName: args.mou.schoolName,
    stage,
    daysAtStage: Math.floor(days),
    href: `/mous/${args.mou.id}`,
  }
}

export default async function LeadershipAccountabilityPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fleadership%2Faccountability')
  // Leadership + Admin only; other roles 404.
  if (!canPerform(user, 'stage-responsibility:configure')) {
    notFound()
  }

  const matrix = getResponsibilityMatrix()
  const overrideCount = userOverrideCount(matrix)
  const totalConfigured = STAGE_ORDER.length

  // Last configuration change across the matrix.
  let lastChange: { stage: LifecycleStage; updatedAt: string; updatedBy: string } | null = null
  for (const s of STAGE_ORDER) {
    const row = matrix[s]
    if (!lastChange || row.updatedAt > lastChange.updatedAt) {
      lastChange = { stage: s, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
    }
  }
  const lastChangeByName =
    lastChange
      ? allUsers.find((u) => u.id === lastChange!.updatedBy)?.name ?? lastChange.updatedBy
      : null

  const now = new Date()
  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of allPayments) {
    const list = paymentsByMou.get(p.mouId) ?? []
    list.push(p)
    paymentsByMou.set(p.mouId, list)
  }
  const dispatchesByMou = new Map<string, KitDispatch[]>()
  for (const d of allKitDispatches) {
    const list = dispatchesByMou.get(d.mouId) ?? []
    list.push(d)
    dispatchesByMou.set(d.mouId, list)
  }

  const stageCounts = bucketByStage({
    mous: allMous,
    payments: allPayments,
    dispatches: allKitDispatches,
    now,
  })

  const stalled: StalledMou[] = []
  const stalledByStage: Record<LifecycleStage, number> = {
    pipeline: 0,
    'mou-uploaded': 0,
    active: 0,
    'payment-pending': 0,
    'installment-1-received': 0,
    'pi-generated': 0,
    'dispatch-requested': 0,
    'shipment-in-progress': 0,
    delivered: 0,
    closed: 0,
  }
  for (const m of allMous) {
    if (m.cohortStatus === 'archived') continue
    const stall = computeStallsForMou({
      mou: m,
      payments: paymentsByMou.get(m.id) ?? [],
      dispatches: dispatchesByMou.get(m.id) ?? [],
      now,
    })
    if (!stall) continue
    stalled.push(stall)
    stalledByStage[stall.stage] += 1
  }
  stalled.sort((a, b) => b.daysAtStage - a.daysAtStage)
  const topStalled = stalled.slice(0, 10)

  const usersById = new Map(allUsers.map((u) => [u.id, u]))

  return (
    <>
      <TopNav currentPath="/dashboard/leadership" />
      <main id="main-content">
        <PageHeader
          title="Stage accountability"
          subtitle="Who owns each lifecycle stage, and where work is stalling."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Leadership', href: '/dashboard/leadership' },
            { label: 'Accountability' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <section
            data-testid="accountability-summary"
            className="rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <UserCog aria-hidden className="size-5 shrink-0 text-brand-navy" />
              <div className="flex-1">
                <h2 className="font-heading text-base font-semibold text-brand-navy">
                  Configuration summary
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  <strong>{totalConfigured}</strong> stages configured.{' '}
                  <strong>{overrideCount}</strong> have a specific user assigned;
                  the remaining <strong>{totalConfigured - overrideCount}</strong>{' '}
                  default to whole-department ownership.
                </p>
                {lastChange ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Last configuration change: {lastChange.updatedAt.slice(0, 10)} by{' '}
                    {lastChangeByName} on stage {STAGE_LABEL[lastChange.stage]}.
                  </p>
                ) : null}
                <Link
                  href="/admin/stage-responsibility"
                  data-testid="accountability-configure-link"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Configure stage responsibility <ArrowRight aria-hidden className="size-3" />
                </Link>
              </div>
            </div>
          </section>

          <section
            data-testid="accountability-stage-table"
            aria-labelledby="stage-table-heading"
            className="rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <h2
              id="stage-table-heading"
              className="mb-3 font-heading text-base font-semibold text-brand-navy"
            >
              Stage-by-stage view
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Escalation</th>
                    <th className="px-3 py-2 font-medium text-right">MOUs at stage</th>
                    <th className="px-3 py-2 font-medium text-right">Stalled (&gt;7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_ORDER.map((stage) => {
                    const row = matrix[stage]
                    const ownerLabel = row.responsibleUserId
                      ? usersById.get(row.responsibleUserId)?.name ?? row.responsibleUserId
                      : row.responsibleDepartment
                    return (
                      <tr
                        key={stage}
                        data-testid={`accountability-stage-${stage}`}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-brand-navy">
                            {STAGE_LABEL[stage]}
                          </div>
                          {row.notes ? (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {row.notes}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">
                          {ownerLabel}
                          {row.responsibleUserId ? (
                            <span className="ml-1 rounded-sm bg-brand-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-navy">
                              user
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">
                          {row.escalationDepartment}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-brand-navy">
                          {stageCounts[stage]}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {stalledByStage[stage] > 0 ? (
                            <span className="font-mono text-xs text-amber-700">
                              {stalledByStage[stage]}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-slate-400">
                              0
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section
            data-testid="accountability-stalled"
            aria-labelledby="stalled-heading"
            className="rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <h2
              id="stalled-heading"
              className="mb-3 font-heading text-base font-semibold text-brand-navy"
            >
              Top stalled MOUs ({topStalled.length})
            </h2>
            {topStalled.length === 0 ? (
              <div data-testid="accountability-stalled-empty">
                <EmptyState
                  icon={<ClipboardList aria-hidden className="size-6 text-signal-ok" />}
                  title="Nothing is stalled past 7 days"
                  description="Healthy. Every stage's MOUs are moving within the 7-day window."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {topStalled.map((s) => (
                  <li
                    key={s.mouId}
                    data-testid={`stalled-row-${s.mouId}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <Link
                      href={s.href}
                      className="min-w-0 flex-1 truncate text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      <span className="font-medium">{s.schoolName}</span>
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {s.mouId}
                      </span>
                    </Link>
                    <StatusChip
                      tone="attention"
                      label={`${s.daysAtStage}d at ${STAGE_LABEL[s.stage]}`}
                      withDot={false}
                    />
                    <AlertCircle aria-hidden className="size-4 shrink-0 text-amber-600" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
