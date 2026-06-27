/*
 * /operations/vex/pi/[id] (Gate 2 Step 7 Surface 3).
 *
 * VEX PI detail. Renders PI metadata, line items with dispatched/
 * pending split per SKU, financial summary, and the dispatch
 * tracker. Action affordances split by role:
 *   - canEditFinanceData: PI status transitions + payment receipts
 *   - canRaiseDispatch (Ops + Admin): create dispatch, advance status
 *   - Leadership / others: read-only
 *
 * Dispatch progression preserves the gate from
 * src/lib/mouSystem/vexDispatchGate.ts verbatim (rupee-for-rupee
 * unlock against payments received, qty-bound per SKU). Gate
 * failures surface as friendly error toasts.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import {
  canEditFinanceData,
  canRaiseDispatch,
} from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { formatDate, formatRs } from '@/lib/format'
import { company } from '@/lib/mouSystem/company'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'
import type { PaymentLog } from '@/lib/types'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { vexDispatchRepo, paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { VexPiActions } from './VexPiActions'
import { VexPiStatusBar } from './VexPiStatusBar'
import { VexPaymentsList } from './VexPaymentsList'
import { DispatchRowActions } from './DispatchRowActions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VexPiDetailPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/operations/vex/pi/${id}`)}`)
  const [allPis, allDispatches, allLogs] = await Promise.all([
    vexPiRepo.findAll() as unknown as Promise<VexPi[]>,
    vexDispatchRepo.findAll() as unknown as Promise<VexDispatch[]>,
    paymentLogRepo.findAll() as unknown as Promise<PaymentLog[]>,
  ])
  const pi = allPis.find((p) => p.id === id)
  if (!pi) notFound()

  // Recorded payments: the live (non-voided) logs referenced by this PI.
  const piPayments = (pi.paymentLogIds ?? [])
    .map((logId) => allLogs.find((l) => l.id === logId))
    .filter((l): l is PaymentLog => !!l && !l.voidedAt)
  const dispatches = allDispatches
    .filter((d) => d.piId === pi.id)
    .slice()
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))

  // Compute per-SKU dispatched qty + cumulative dispatched value.
  const dispatchedQtyByPart = new Map<string, number>()
  let alreadyDispatchedValue = 0
  for (const d of dispatches) {
    for (const it of d.items) {
      dispatchedQtyByPart.set(
        it.partNumber,
        (dispatchedQtyByPart.get(it.partNumber) ?? 0) + it.qty,
      )
      const li = pi.lineItems.find((l) => l.partNumber === it.partNumber)
      if (li) alreadyDispatchedValue += li.unitPrice * it.qty
    }
  }

  const canFinance = canEditFinanceData(user)
  const canDispatch = canRaiseDispatch(user)
  const open = Math.max(0, pi.total - pi.paymentReceivedAmount)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={pi.schoolName}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX', href: '/operations/vex' },
            { label: pi.piNumber },
          ]}
          subtitle={`${pi.piNumber} / ${pi.entityKey} / ${pi.status} / Issued ${formatDate(pi.issueDate)}`}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <div>
            <Link
              href="/operations/vex"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to VEX orders
            </Link>
          </div>

          <section
            aria-label="PI summary"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <Stat label="Total" value={formatRs(pi.total)} />
            <Stat label="Received" value={formatRs(pi.paymentReceivedAmount)} />
            <Stat label="Open balance" value={formatRs(open)} accent={open > 0} />
            <Stat label="Status" value={pi.status} />
          </section>

          <section aria-label="Billing block">
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Billing and shipping
            </h2>
            <div className="mt-2 grid gap-3 rounded-md border border-border bg-card p-4 text-sm lg:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Bill to
                </p>
                <p className="mt-1 font-medium text-foreground">{pi.billingName}</p>
                <p className="mt-0.5 text-muted-foreground">{pi.billingAddress}</p>
                {pi.schoolGstNumber ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    GSTIN {pi.schoolGstNumber}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ship to
                </p>
                <p className="mt-1 font-medium text-foreground">{pi.schoolName}</p>
                <p className="mt-0.5 text-muted-foreground">{pi.shippingAddress}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact: {pi.contactPerson} ({pi.contactNo})
                </p>
              </div>
            </div>
          </section>

          <section aria-label="Line items">
            <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Line items
            </h2>
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sr</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Part no</th>
                    <th className="px-3 py-2 font-medium tabular-nums text-right">Qty</th>
                    <th className="px-3 py-2 font-medium tabular-nums text-right">Unit price</th>
                    <th className="px-3 py-2 font-medium tabular-nums text-right">Total</th>
                    <th className="px-3 py-2 font-medium tabular-nums text-right">Dispatched</th>
                    <th className="px-3 py-2 font-medium tabular-nums text-right">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pi.lineItems.map((li, i) => {
                    const sent = dispatchedQtyByPart.get(li.partNumber) ?? 0
                    const pending = li.quantity - sent
                    return (
                      <tr key={li.partNumber + i}>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 text-foreground">{li.productName}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">{li.partNumber}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatRs(li.unitPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatRs(li.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{sent}</td>
                        <td
                          className={
                            'px-3 py-2 text-right tabular-nums ' +
                            (pending > 0 ? 'text-amber-700' : 'text-emerald-700')
                          }
                        >
                          {pending}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-muted text-xs">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">Subtotal</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatRs(pi.subtotal)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">Freight charges</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRs(pi.freightCharges)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">Taxable value</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRs(pi.taxableValue)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">
                      GST {(pi.gstPct * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRs(pi.gstAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-3 py-2 text-right font-semibold">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatRs(pi.total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {canFinance ? (
            <section aria-label="PI status">
              <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
                PI status
              </h2>
              <VexPiStatusBar pi={pi} />
            </section>
          ) : null}

          {canFinance || canDispatch ? (
            <section aria-label="Actions">
              <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
                Actions
              </h2>
              <VexPiActions
                pi={pi}
                alreadyDispatchedValue={alreadyDispatchedValue}
                dispatchedQtyByPart={Object.fromEntries(dispatchedQtyByPart)}
                canFinance={canFinance}
                canDispatch={canDispatch}
              />
            </section>
          ) : null}

          {canFinance ? (
            <section aria-label="Recorded payments">
              <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
                Recorded payments
              </h2>
              <VexPaymentsList piId={pi.id} payments={piPayments} canFinance={canFinance} />
            </section>
          ) : null}

          <section aria-label="Dispatches">
            <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Dispatches
            </h2>
            {dispatches.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No dispatches raised yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Dispatch</th>
                      <th className="px-3 py-2 font-medium">Mode</th>
                      <th className="px-3 py-2 font-medium tabular-nums text-right">Freight</th>
                      <th className="px-3 py-2 font-medium">Items</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Warehouse + doc</th>
                      <th className="px-3 py-2 font-medium">Tax invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {dispatches.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {d.id}
                          <span className="block text-[11px] text-muted-foreground">
                            {formatDate(d.requestedAt.slice(0, 10))}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{d.mode}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatRs(d.freight)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {d.items.map((i) => `${i.partNumber}: ${i.qty}`).join(' / ')}
                        </td>
                        <td className="px-3 py-2 text-xs">{d.status}</td>
                        <td className="px-3 py-2 text-xs align-top">
                          <DispatchRowActions
                            pi={pi}
                            dispatch={d}
                            warehouseEmail={company.warehouseEmail}
                            canDispatch={canDispatch}
                            canFinance={canFinance}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {d.taxInvoicePath ? (
                            <a
                              href={d.taxInvoicePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-brand-navy hover:underline"
                            >
                              {d.taxInvoiceNumber ?? 'PDF'}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">awaiting upload</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {pi.auditLog.length > 0 ? (
            <section aria-label="Audit log">
              <h2 className="mb-2 font-heading text-base font-semibold text-brand-navy">
                Audit log
              </h2>
              <ul className="rounded-md border border-border bg-card text-sm">
                {pi.auditLog
                  .slice()
                  .reverse()
                  .map((entry, idx) => (
                    <li
                      key={`${entry.timestamp}-${idx}`}
                      className="border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.timestamp.slice(0, 19).replace('T', ' ')}
                      </span>{' '}
                      <span className="font-medium">{entry.user}</span>{' '}
                      <span className="text-muted-foreground">{entry.action}</span>
                      {entry.notes ? (
                        <span className="text-muted-foreground"> / {entry.notes}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className={
        'rounded-md border p-4 ' +
        (accent ? 'border-amber-200 bg-amber-50' : 'border-border bg-card')
      }
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-heading text-xl font-semibold text-brand-navy tabular-nums">
        {value}
      </div>
    </div>
  )
}
