/*
 * /mous/[mouId]/student-count (Phase 5, 2026-05-19).
 *
 * Form to record a real-world student-count change. Pure server
 * component: the form is plain HTML POST to
 * /api/mou/[id]/student-count which calls applyCountChange and
 * enqueues the resulting writes.
 *
 * The page renders a live preview of the recalc result the moment
 * the operator types a new count, computed entirely server-side via
 * the ?preview= query param so no client JS is needed. Operators
 * tweak the count, hit "Preview", and once they like the
 * projection, hit "Save" on the same form.
 *
 * Permission gate: canEditMOU || canEditFinanceData.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import type { MOU, Payment, StudentCountEvent, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import usersJson from '@/data/users.json'
import eventsJson from '@/data/student_count_events.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { formatRs, formatDate } from '@/lib/format'
import { getCurrentStudentCountFor } from '@/lib/mou/applyCountChange'
import { recalcInstallments } from '@/lib/mou/studentCountRecalc'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allUsers = usersJson as unknown as User[]
const allEvents = eventsJson as unknown as StudentCountEvent[]

const ERROR_COPY: Record<string, string> = {
  permission: 'You do not have permission to update the student count for this MOU.',
  'unknown-user': 'Your session user could not be resolved. Sign out and back in, then retry.',
  'mou-not-found': 'That MOU could not be found.',
  'invalid-count': 'Student count must be a positive whole number.',
  'no-change': 'The new count matches the current count. Nothing to update.',
  'invalid-reason': 'Reason cannot be blank.',
  'reason-too-short': 'Add at least 10 characters of context for the reason field.',
  'invalid-date': 'Effective date must be a valid date.',
  'reconciliation-failure': 'The recalc could not reconcile to current count x price-per-student. Review the schedule.',
}

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function StudentCountChangePage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? null : null
  const previewCountRaw = typeof sp.preview === 'string' ? sp.preview : null

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fmous%2F${encodeURIComponent(mouId)}%2Fstudent-count`)
  if (!canEditMOU(user) && !canEditFinanceData(user)) {
    redirect(`/mous/${mouId}?notice=student-count-forbidden`)
  }

  const mou = allMous.find((m) => m.id === mouId)
  if (!mou) notFound()

  const ownEvents = allEvents.filter((e) => e.mouId === mou.id)
  const currentCount = getCurrentStudentCountFor(mou, allEvents)
  const ownPayments = allPayments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  // Live preview: when ?preview=<count> is set, compute the recalc
  // server-side and render the projection. This avoids the round
  // trip + client-side recalc + bundling the engine.
  let preview: ReturnType<typeof recalcInstallments> | null = null
  let previewCount: number | null = null
  if (previewCountRaw !== null) {
    const n = Number(previewCountRaw)
    if (Number.isFinite(n) && n > 0 && n !== currentCount && ownPayments.length > 0) {
      previewCount = Math.round(n)
      // Backfill percentShare for the preview only (does not persist).
      const withShares = ownPayments.map((p) => ({
        ...p,
        percentShare:
          typeof p.percentShare === 'number' && p.percentShare > 0
            ? p.percentShare
            : mou.contractValue > 0
              ? (p.expectedAmount / mou.contractValue) * 100
              : 0,
      }))
      preview = recalcInstallments({
        pricePerStudent: mou.spWithTax,
        currentCount: previewCount,
        installments: withShares,
      })
    }
  }

  // Sort events newest first for the history pane.
  const historyNewestFirst = [...ownEvents].sort((a, b) =>
    a.recordedAt < b.recordedAt ? 1 : -1,
  )
  const usersById = new Map(allUsers.map((u) => [u.id, u.name]))

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Update student count"
          subtitle={`${mou.schoolName} - ${mou.id}`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Update student count' },
          ]}
        />
        <div className="mx-auto grid max-w-screen-xl gap-4 px-4 py-6 md:grid-cols-3">
          <section className="md:col-span-2 rounded-lg border border-border bg-card p-5" data-testid="student-count-form-section">
            {errorMessage ? (
              <div
                role="alert"
                data-testid="student-count-error"
                data-error={errorKey}
                className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              >
                <AlertCircle aria-hidden className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <form
              method="POST"
              action={`/api/mou/${encodeURIComponent(mou.id)}/student-count`}
              className="space-y-4"
              data-testid="student-count-form"
            >
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Current count
                </div>
                <div className="mt-1 text-lg font-semibold text-brand-navy" data-testid="student-count-current">
                  {currentCount.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Price per student (incl GST): {formatRs(mou.spWithTax)}.{' '}
                  Contract value (signing): {formatRs(mou.contractValue)}.
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New count
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </span>
                <input
                  type="number"
                  name="newCount"
                  min="1"
                  step="1"
                  required
                  defaultValue={previewCount ?? ''}
                  className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid="student-count-new"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Effective date
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </span>
                <input
                  type="date"
                  name="effectiveDate"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid="student-count-effective-date"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reason (min 10 chars)
                  <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
                </span>
                <textarea
                  name="reason"
                  rows={3}
                  required
                  minLength={10}
                  placeholder="E.g. '1st instalment intake: count finalised at 450 after roll-call.'"
                  className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid="student-count-reason"
                />
              </label>

              {ownPayments.length > 0 ? (
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tied to which instalment? (optional)
                  </span>
                  <select
                    name="relatedInstallmentId"
                    defaultValue=""
                    className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    data-testid="student-count-related-installment"
                  >
                    <option value="">(none)</option>
                    {ownPayments.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.instalmentLabel}
                        {p.dueDateIso ? ` · due ${formatDate(p.dueDateIso)}` : ''}
                        {' · '}
                        {p.status}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes (optional)
                </span>
                <textarea
                  name="notes"
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid="student-count-notes"
                />
              </label>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="submit"
                  className={opsButtonClass({ variant: 'primary', size: 'md' })}
                  data-testid="student-count-submit"
                >
                  Save count change
                </button>
                <Link
                  href={`/mous/${mou.id}/student-count?preview=${encodeURIComponent(String(previewCount ?? ''))}`}
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                >
                  Refresh preview
                </Link>
                <Link
                  href={`/mous/${mou.id}`}
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                >
                  Cancel
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                To preview the impact before saving, append{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">?preview=&lt;new count&gt;</code>{' '}
                to the URL.
              </p>
            </form>
          </section>

          <aside className="space-y-4">
            {preview ? (
              <section
                className="rounded-lg border border-brand-navy/20 bg-amber-50 p-4"
                data-testid="student-count-preview"
              >
                <h3 className="font-heading text-sm font-semibold text-brand-navy">
                  Preview at {previewCount?.toLocaleString('en-IN')} students
                </h3>
                <p className="mt-1 text-xs text-amber-900">
                  Cumulative carry from locked instalments:{' '}
                  <span className="font-mono font-semibold">
                    {preview.cumulativeDelta > 0 ? '+' : ''}{formatRs(preview.cumulativeDelta)}
                  </span>
                </p>
                <p className="text-xs text-amber-900">
                  Total committed: <span className="font-mono">{formatRs(preview.totalCommitted)}</span>
                  {preview.reconciled ? null : (
                    <span className="ml-1 rounded bg-amber-300 px-1 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                      gap
                    </span>
                  )}
                </p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {preview.rows.map((r) => {
                    const original = ownPayments.find((p) => p.id === r.paymentId)
                    return (
                      <li
                        key={r.paymentId}
                        data-testid={`student-count-preview-row-${r.paymentId}`}
                        className="flex flex-wrap items-baseline gap-1 rounded border border-amber-200 bg-white/70 p-2"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {original?.instalmentLabel ?? r.paymentId}
                        </span>
                        <span className="rounded px-1 text-[10px] uppercase tracking-wider">
                          {r.isLocked
                            ? 'locked'
                            : r.adjustmentFromLockedInstallments !== 0
                              ? 'adjusting'
                              : 'pending'}
                        </span>
                        <span className="ml-auto font-semibold text-brand-navy">
                          {formatRs(r.netDue)}
                        </span>
                        {r.adjustmentFromLockedInstallments !== 0 ? (
                          <span className="block w-full text-[10px] text-amber-900">
                            nominal {formatRs(r.nominalAmount)} {r.adjustmentFromLockedInstallments < 0 ? 'less excess credit' : 'plus shortfall catchup'}{' '}
                            {formatRs(Math.abs(r.adjustmentFromLockedInstallments))}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : (
              <section
                className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground"
                data-testid="student-count-preview-empty"
              >
                Tip: visit{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">?preview=450</code>{' '}
                to project the recalc impact before saving.
              </section>
            )}

            <section
              className="rounded-lg border border-border bg-card p-4"
              data-testid="student-count-history"
            >
              <h3 className="font-heading text-sm font-semibold text-brand-navy">
                Count history
              </h3>
              {historyNewestFirst.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No prior changes. The MOU&apos;s signing count is {mou.studentsMou.toLocaleString('en-IN')}.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border text-xs">
                  {historyNewestFirst.map((e) => (
                    <li key={e.id} className="py-1.5" data-testid={`student-count-history-${e.id}`}>
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {e.id}
                        </span>
                        <span className="text-foreground">
                          {e.previousCount.toLocaleString('en-IN')} {'→'} {e.newCount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(e.effectiveDate)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {usersById.get(e.recordedBy) ?? e.recordedBy} · {e.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>
    </>
  )
}
