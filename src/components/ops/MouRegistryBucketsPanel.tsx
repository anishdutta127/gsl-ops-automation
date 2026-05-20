/*
 * Shared 4-column PI x Payment registry panel.
 *
 * Phase 6C built this inline on /mous; Phase 6C.1 lifts it into a
 * standalone component so /mous/archive (and any future registry
 * surface) renders the panel identically: same headers, same
 * derivation, same mobile stacking, same footer reconciliation.
 *
 * Inputs:
 *   - rows: pre-filtered MOUs (year + cohort + dimension filters
 *     already applied by the caller)
 *   - activeYear: the FY pill active on the page; instalments are
 *     scoped to this year via getYearSpecificInstalments
 *   - allPayments: full payments slice; the panel filters internally
 *     to the rows + year
 *   - rowHref / actionColumn: optional per-row link / trailing
 *     action cell so the archive page can attach its Reactivate form
 *     without forking the panel itself
 *
 * Output: desktop table on md+, vertically-stacked cards on mobile,
 * a footer that totals the four buckets and asserts reconciliation
 * against the expected contract total within Rs 1.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { MOU, Payment } from '@/lib/types'
import { formatRs } from '@/lib/format'
import { getYearSpecificInstalments } from '@/lib/mou/yearMembership'
import {
  deriveMouBucketAmounts,
  sumRegistryBuckets,
  type RegistryBucketTotals,
} from '@/lib/mou/mouRegistryBuckets'
import { StatusChip } from '@/components/ops/StatusChip'
import { mouStatusTone } from '@/lib/ui/mouStatusTone'

export interface MouRegistryBucketsPanelProps {
  rows: MOU[]
  activeYear: string
  allPayments: Payment[]
  /** When supplied, the row navigates to this href on desktop chevron + on mobile card tap. */
  rowHref?: (m: MOU) => string
  /** Optional trailing action column for the desktop table (e.g. archive Reactivate button). */
  actionColumn?: {
    header: string
    render: (m: MOU) => ReactNode
  }
  /** Optional trailing action UI for the mobile card. */
  mobileAction?: (m: MOU) => ReactNode
  /** Optional copy override for the empty state. */
  empty?: ReactNode
  /** Used in the footer copy ("Totals across N visible MOU(s)..."). */
  footerScopeLabel?: string
}

export function MouRegistryBucketsPanel({
  rows,
  activeYear,
  allPayments,
  rowHref,
  actionColumn,
  mobileAction,
  empty,
  footerScopeLabel,
}: MouRegistryBucketsPanelProps) {
  const visibleBuckets = rows.map((m) => ({
    buckets: deriveMouBucketAmounts(
      getYearSpecificInstalments(m, activeYear, allPayments),
    ),
  }))
  const totals = sumRegistryBuckets(visibleBuckets)

  if (rows.length === 0) {
    return <>{empty}</>
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  MOU id
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  School
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Programme
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  FY {activeYear} contract
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PI not raised, payment received
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PI raised, payment received
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PI raised, payment not received
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PI not raised, payment not received
                </th>
                {actionColumn ? (
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {actionColumn.header}
                  </th>
                ) : null}
                {rowHref ? <th className="w-8 px-3 py-2"><span className="sr-only">Open</span></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((m) => {
                const ys = getYearSpecificInstalments(m, activeYear, allPayments)
                const b = deriveMouBucketAmounts(ys)
                const expected = ys.reduce((s, p) => s + p.expectedAmount, 0)
                const href = rowHref ? rowHref(m) : null
                const linkOrSpan = (child: ReactNode, label?: string) =>
                  href ? (
                    <Link
                      href={href}
                      className="block min-h-11 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      aria-label={label}
                    >
                      {child}
                    </Link>
                  ) : (
                    <span className="block min-h-11">{child}</span>
                  )
                return (
                  <tr
                    key={m.id}
                    className="hover:bg-muted/40 focus-within:bg-muted/40"
                  >
                    <td className="px-3 py-3 text-sm text-foreground">
                      {linkOrSpan(<span className="font-mono text-xs">{m.id}</span>)}
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground">
                      {linkOrSpan(m.schoolName)}
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground">
                      {linkOrSpan(
                        <span>
                          {m.programme}
                          {m.programmeSubType ? (
                            <span className="text-muted-foreground"> / {m.programmeSubType}</span>
                          ) : null}
                        </span>,
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground">
                      {linkOrSpan(
                        <StatusChip
                          tone={mouStatusTone(m.status)}
                          label={m.status}
                          withDot={false}
                        />,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-foreground">
                      {linkOrSpan(
                        <span
                          className="tabular-nums"
                          data-testid={`year-contract-${m.id}`}
                        >
                          {expected > 0 ? formatRs(expected) : <span className="text-muted-foreground">{'-'}</span>}
                          {m.contractValue > expected ? (
                            <span className="ml-1 block text-[11px] text-muted-foreground">
                              lifetime {formatRs(m.contractValue)}
                            </span>
                          ) : null}
                        </span>,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-foreground">
                      {linkOrSpan(
                        <span
                          className="tabular-nums text-amber-700"
                          data-testid={`bucket-pi-no-pay-yes-${m.id}`}
                        >
                          {b.piNoPayYes > 0 ? formatRs(b.piNoPayYes) : '-'}
                        </span>,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-foreground">
                      {linkOrSpan(
                        <span
                          className="tabular-nums text-emerald-700"
                          data-testid={`bucket-pi-yes-pay-yes-${m.id}`}
                        >
                          {b.piYesPayYes > 0 ? formatRs(b.piYesPayYes) : '-'}
                        </span>,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-foreground">
                      {linkOrSpan(
                        <span
                          className="tabular-nums text-brand-navy"
                          data-testid={`bucket-pi-yes-pay-no-${m.id}`}
                        >
                          {b.piYesPayNo > 0 ? formatRs(b.piYesPayNo) : '-'}
                        </span>,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-foreground">
                      {linkOrSpan(
                        <span
                          className="tabular-nums text-muted-foreground"
                          data-testid={`bucket-pi-no-pay-no-${m.id}`}
                        >
                          {b.piNoPayNo > 0 ? formatRs(b.piNoPayNo) : '-'}
                        </span>,
                      )}
                    </td>
                    {actionColumn ? (
                      <td className="px-3 py-3 text-right text-sm text-foreground">
                        {actionColumn.render(m)}
                      </td>
                    ) : null}
                    {href ? (
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        <Link
                          href={href}
                          aria-label={`Open ${m.id}`}
                          className="inline-flex min-h-11 items-center focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <RegistryFooterTotals
          totals={totals}
          activeYear={activeYear}
          scopeLabel={footerScopeLabel}
        />
      </div>

      {/* Mobile: card stack per MOU */}
      <div className="md:hidden">
        <ul className="space-y-3" data-testid="mous-mobile-cards">
          {rows.map((m) => {
            const ys = getYearSpecificInstalments(m, activeYear, allPayments)
            const b = deriveMouBucketAmounts(ys)
            const href = rowHref ? rowHref(m) : null
            const card = (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-brand-navy">
                    {m.schoolName}
                  </span>
                  <StatusChip
                    tone={mouStatusTone(m.status)}
                    label={m.status}
                    withDot={false}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.id} {'·'} {m.programme}
                  {m.programmeSubType ? ` / ${m.programmeSubType}` : ''}
                </p>
                <dl className="mt-3 grid grid-cols-1 gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-amber-700">PI not raised, payment received</dt>
                    <dd className="font-mono tabular-nums text-amber-700">
                      {b.piNoPayYes > 0 ? formatRs(b.piNoPayYes) : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-emerald-700">PI raised, payment received</dt>
                    <dd className="font-mono tabular-nums text-emerald-700">
                      {b.piYesPayYes > 0 ? formatRs(b.piYesPayYes) : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-navy">PI raised, payment not received</dt>
                    <dd className="font-mono tabular-nums text-brand-navy">
                      {b.piYesPayNo > 0 ? formatRs(b.piYesPayNo) : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">PI not raised, payment not received</dt>
                    <dd className="font-mono tabular-nums text-muted-foreground">
                      {b.piNoPayNo > 0 ? formatRs(b.piNoPayNo) : '-'}
                    </dd>
                  </div>
                </dl>
              </>
            )
            return (
              <li
                key={m.id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`mou-mobile-card-${m.id}`}
              >
                {href ? (
                  <Link
                    href={href}
                    className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
                {mobileAction ? (
                  <div className="mt-3 border-t border-border pt-2">
                    {mobileAction(m)}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="mt-4">
          <RegistryFooterTotals
            totals={totals}
            activeYear={activeYear}
            stacked
            scopeLabel={footerScopeLabel}
          />
        </div>
      </div>
    </>
  )
}

function RegistryFooterTotals({
  totals,
  activeYear,
  stacked,
  scopeLabel,
}: {
  totals: RegistryBucketTotals
  activeYear: string
  stacked?: boolean
  scopeLabel?: string
}) {
  const sum =
    totals.piNoPayYes +
    totals.piYesPayYes +
    totals.piYesPayNo +
    totals.piNoPayNo
  const reconciles = Math.abs(sum - totals.expectedTotal) <= 1
  const scope = scopeLabel ?? `${totals.rowCount} visible MOU(s) for FY ${activeYear}`
  if (stacked) {
    return (
      <div
        className="rounded-md border border-border bg-muted/30 p-3 text-sm"
        data-testid="registry-footer-totals-mobile"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Totals across {scope}
        </p>
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between">
            <dt className="text-amber-700">PI not raised, payment received</dt>
            <dd className="font-mono tabular-nums text-amber-700">{formatRs(totals.piNoPayYes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-emerald-700">PI raised, payment received</dt>
            <dd className="font-mono tabular-nums text-emerald-700">{formatRs(totals.piYesPayYes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-navy">PI raised, payment not received</dt>
            <dd className="font-mono tabular-nums text-brand-navy">{formatRs(totals.piYesPayNo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">PI not raised, payment not received</dt>
            <dd className="font-mono tabular-nums text-muted-foreground">{formatRs(totals.piNoPayNo)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1">
            <dt className="font-semibold">Expected total (sum)</dt>
            <dd
              className="font-mono tabular-nums font-semibold"
              data-testid="registry-footer-expected-mobile"
            >
              {formatRs(totals.expectedTotal)} ({reconciles ? 'reconciles' : 'mismatch'})
            </dd>
          </div>
        </dl>
      </div>
    )
  }
  return (
    <div
      className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30"
      data-testid="registry-footer-totals"
    >
      <table className="min-w-full text-sm">
        <tbody>
          <tr>
            <td
              className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              colSpan={4}
            >
              Totals across {scope}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-amber-700"
              data-testid="registry-footer-pi-no-pay-yes"
            >
              {formatRs(totals.piNoPayYes)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700"
              data-testid="registry-footer-pi-yes-pay-yes"
            >
              {formatRs(totals.piYesPayYes)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-brand-navy"
              data-testid="registry-footer-pi-yes-pay-no"
            >
              {formatRs(totals.piYesPayNo)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground"
              data-testid="registry-footer-pi-no-pay-no"
            >
              {formatRs(totals.piNoPayNo)}
            </td>
            <td className="px-3 py-2" />
          </tr>
          <tr>
            <td
              className="border-t border-border px-3 py-2 text-left text-xs text-muted-foreground"
              colSpan={4}
            >
              Expected total (sum of four columns){' '}
              <span data-testid="registry-footer-reconciles">
                {reconciles ? '· reconciles' : '· mismatch'}
              </span>
            </td>
            <td
              className="border-t border-border px-3 py-2 text-right font-mono tabular-nums font-semibold"
              colSpan={4}
              data-testid="registry-footer-expected"
            >
              {formatRs(totals.expectedTotal)}
            </td>
            <td className="border-t border-border px-3 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
