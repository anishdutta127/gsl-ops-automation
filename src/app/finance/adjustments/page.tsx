/*
 * /finance/adjustments (Gate 2 Step 6).
 *
 * Adjustment log + per-row reversal surface. NEW route (no
 * gsl-mou-system precedent; Pranav's deferred UI from the
 * mou-system R2 work). The Adjustment entity ships with the
 * migrated Phase 3 R2 schema in src/lib/types.ts.
 *
 * UI:
 *   - Filter by status (Active / Reversed / All); default Active.
 *   - Filter by trigger (actuals_update / installment_plan_change /
 *     manual / vex_overpayment / All); default All.
 *   - Per-row: id, MOU, school, trigger, applied-to instalment,
 *     amount delta, status. Click a row to expand a reversal form
 *     (canEditFinanceData gated).
 *
 * Honest toast: "Reversed. Will reflect everywhere within ~5 minutes."
 *
 * Permission gate: canAccessFinance (view).
 * Reversal gate:    canEditFinanceData (mutate).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import type { Adjustment, AdjustmentTrigger, MOU } from '@/lib/types'
import adjustmentsJson from '@/data/adjustments.json'
import mousJson from '@/data/mous.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance, canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { formatRs, formatDate } from '@/lib/format'

const allAdjustments = adjustmentsJson as unknown as Adjustment[]
const allMous = mousJson as unknown as MOU[]

type StatusFilter = 'all' | 'Active' | 'Reversed'
type TriggerFilter = 'all' | AdjustmentTrigger

const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'Active', label: 'Active only' },
  { key: 'Reversed', label: 'Reversed only' },
  { key: 'all', label: 'All' },
]

const TRIGGER_FILTERS: ReadonlyArray<{ key: TriggerFilter; label: string }> = [
  { key: 'all', label: 'All triggers' },
  { key: 'actuals_update', label: 'Actuals update' },
  { key: 'installment_plan_change', label: 'Instalment plan change' },
  { key: 'manual', label: 'Manual' },
  { key: 'vex_overpayment', label: 'VEX overpayment' },
]

const ERROR_COPY: Record<string, string> = {
  permission: 'You do not have permission to reverse adjustments. Finance + Admin only.',
  'unknown-user': 'Session expired. Sign in again.',
  'adjustment-not-found': 'Adjustment no longer exists. Refresh the list.',
  'already-reversed': 'Already reversed. No further action required.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickStatus(raw: string | undefined): StatusFilter {
  if (raw === 'Active' || raw === 'Reversed' || raw === 'all') return raw
  return 'Active'
}

function pickTrigger(raw: string | undefined): TriggerFilter {
  const found = TRIGGER_FILTERS.find((t) => t.key === raw)
  return found ? found.key : 'all'
}

const TRIGGER_LABEL: Record<AdjustmentTrigger, string> = {
  actuals_update: 'Actuals update',
  installment_plan_change: 'Instalment plan change',
  manual: 'Manual',
  vex_overpayment: 'VEX overpayment',
}

export default async function AdjustmentsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fadjustments')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const sp = await searchParams
  const statusFilter = pickStatus(typeof sp.status === 'string' ? sp.status : undefined)
  const triggerFilter = pickTrigger(typeof sp.trigger === 'string' ? sp.trigger : undefined)
  const canEdit = canEditFinanceData(user)

  const reversedId = typeof sp.reversed === 'string' ? sp.reversed : null
  const expandId = typeof sp.expand === 'string' ? sp.expand : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  const mouById = new Map(allMous.map((m) => [m.id, m]))

  const filtered = allAdjustments
    .filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter))
    .filter((a) => (triggerFilter === 'all' ? true : a.triggeredByEvent === triggerFilter))
    .slice()
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Adjustments"
          subtitle="Adjustment-as-line-item log. Reverse an active adjustment to roll it back. The next unpaid PI surfaces the cumulative delta as 'Balance due Previous Instalments / (Excess Received)'."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Adjustments' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          {reversedId ? (
            <p
              role="status"
              data-testid="adjustment-reversed-flash"
              className="flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-3 text-sm text-signal-ok"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>Reversed. Will reflect everywhere within ~5 minutes.</span>
            </p>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <form
            method="GET"
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
          >
            <div>
              <label htmlFor="filter-status" className="block text-xs font-medium text-brand-navy">
                Status
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={statusFilter}
                className="mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-trigger" className="block text-xs font-medium text-brand-navy">
                Trigger
              </label>
              <select
                id="filter-trigger"
                name="trigger"
                defaultValue={triggerFilter}
                className="mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {TRIGGER_FILTERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={opsButtonClass({ variant: 'primary', size: 'md' })}>
              Apply
            </button>
          </form>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-border bg-card">
              <EmptyState
                title="No adjustments match the current filters."
                description="Adjustments are created automatically when an actuals update changes the economics of a programme MOU after a PI was issued. Try switching to 'All' status."
              />
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((adj) => {
                const mou = mouById.get(adj.mouId) ?? null
                const expanded = expandId === adj.id
                const statusTone: StatusChipTone = adj.status === 'Active' ? 'attention' : 'neutral'
                const deltaPositive = adj.amountDelta > 0
                return (
                  <li key={adj.id}>
                    <article
                      data-testid={`adjustment-row-${adj.id}`}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold text-brand-navy">
                              {adj.id}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <Link
                              href={`/mous/${adj.mouId}`}
                              className="text-sm text-brand-navy hover:underline"
                            >
                              {mou?.schoolName ?? adj.mouId}
                            </Link>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="font-mono text-xs text-muted-foreground">{adj.mouId}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {TRIGGER_LABEL[adj.triggeredByEvent]} · triggered {formatDate(adj.triggeredAt)} by {adj.triggeredBy}
                            {adj.appliedToInstallmentId
                              ? ` · applied to ${adj.appliedToInstallmentId}`
                              : ' · floating (not yet applied)'}
                          </p>
                          <p className="mt-1 text-sm text-brand-navy">{adj.reason}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Amount delta
                            </p>
                            <p
                              className={
                                'font-heading text-lg font-bold tabular-nums ' +
                                (deltaPositive ? 'text-signal-alert' : 'text-signal-ok')
                              }
                            >
                              {deltaPositive ? '+' : ''}
                              {formatRs(adj.amountDelta)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {deltaPositive ? 'additional charge' : 'credit to school'}
                            </p>
                          </div>
                          <StatusChip tone={statusTone} label={adj.status} withDot={false} />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span>
                          Original instalment: <span className="font-mono">{adj.originalInstallmentId}</span>
                        </span>
                        <span>·</span>
                        <span>
                          Before: <span className="tabular-nums">{formatRs(adj.beforeAmount)}</span>
                        </span>
                        <span>·</span>
                        <span>
                          After: <span className="tabular-nums">{formatRs(adj.afterAmount)}</span>
                        </span>
                        <span className="ml-auto">
                          {adj.status === 'Active' && canEdit ? (
                            expanded ? (
                              <Link
                                href={`/finance/adjustments?status=${statusFilter}&trigger=${triggerFilter}`}
                                className="text-violet-700 hover:underline"
                              >
                                Cancel
                              </Link>
                            ) : (
                              <Link
                                href={`/finance/adjustments?status=${statusFilter}&trigger=${triggerFilter}&expand=${encodeURIComponent(adj.id)}`}
                                className="text-violet-700 hover:underline"
                                data-testid={`adjustment-expand-${adj.id}`}
                              >
                                Reverse this adjustment -&gt;
                              </Link>
                            )
                          ) : adj.status === 'Reversed' ? (
                            <span className="italic">Already reversed</span>
                          ) : !canEdit ? (
                            <span className="italic">View-only access</span>
                          ) : null}
                        </span>
                      </div>

                      {expanded && canEdit && adj.status === 'Active' ? (
                        <form
                          method="POST"
                          action={`/api/finance/adjustments/${encodeURIComponent(adj.id)}/reverse`}
                          className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3"
                          data-testid={`adjustment-reverse-form-${adj.id}`}
                        >
                          <label className="block text-xs font-medium text-brand-navy">
                            Reason for reversal (optional)
                            <textarea
                              name="reason"
                              rows={2}
                              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                              placeholder="e.g. Adjustment was created in error; the actuals update was rolled back."
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              className="inline-flex min-h-11 items-center rounded-md bg-signal-alert px-4 py-2 text-sm font-semibold text-white hover:bg-signal-alert/90"
                            >
                              Reverse
                            </button>
                            <Link
                              href={`/finance/adjustments?status=${statusFilter}&trigger=${triggerFilter}`}
                              className={opsButtonClass({ variant: 'outline', size: 'md' })}
                            >
                              Cancel
                            </Link>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
