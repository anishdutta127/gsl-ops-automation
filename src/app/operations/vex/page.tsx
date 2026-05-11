/*
 * /operations/vex (Gate 2 Step 7 Surface 1).
 *
 * VEX module landing: funnel KPIs over the 141-record Tally-imported
 * order tracker, the 28-SKU master, the in-app VEX PI list, and the
 * dispatch tracker. Mirrors `gsl-mou-system/src/app/vex/page.tsx`
 * verbatim for KPI semantics + PI table shape, ported into Ops's
 * TopNav + Operations-orange chrome.
 *
 * KPI semantics preserved verbatim from Round 3 Step 10a/10c:
 *   - Total Pipeline  = sum of every VEX PI line-item value
 *   - Pending to dispatch = paid kits owed to schools
 *   - Sales invoice amount = rupee value of dispatches already
 *     tax-invoiced (status Invoiced or Shipped)
 *
 * Mobile 375px: KPI tiles stack 2-col; SKU + order + dispatch tables
 * scroll horizontally via overflow-x-auto.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { accentFor } from '@/lib/departmentAccents'
import { canEditFinanceData } from '@/lib/access'
import { vexFunnelCounts } from '@/lib/mouSystem/vex'
import type {
  VexDispatch,
  VexOrder,
  VexPi,
  VexProduct,
} from '@/lib/mouSystem/types'
import vexProductsJson from '@/data/vex_products.json'
import vexPisJson from '@/data/vex_pis.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'
import vexOrdersJson from '@/data/vex_orders.json'
import { VexProductsTable } from './VexProductsTable'
import { VexPiList } from './VexPiList'
import { VexOrdersTable } from './VexOrdersTable'
import { VexDispatchesTable } from './VexDispatchesTable'

const vexProducts = vexProductsJson as unknown as VexProduct[]
const vexPis = vexPisJson as unknown as VexPi[]
const vexDispatches = vexDispatchesJson as unknown as VexDispatch[]
const vexOrders = vexOrdersJson as unknown as VexOrder[]

export default async function OperationsVexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fvex')
  const accent = accentFor('ops')
  const canCreatePi = canEditFinanceData(user)

  // VEX PI rollups (Round 3 Step 10a/10c semantics).
  const totalReceived = vexPis.reduce(
    (s, p) => s + (p.paymentReceivedAmount ?? 0),
    0,
  )
  const dispatchedPis = new Set(vexDispatches.map((d) => d.piId)).size
  let pendingToDispatch = 0
  let totalPipeline = 0
  let salesInvoiceValue = 0
  for (const pi of vexPis) {
    const piValue = pi.lineItems.reduce(
      (s, li) => s + li.quantity * li.unitPrice,
      0,
    )
    totalPipeline += piValue
    const sent = new Map<string, number>()
    for (const d of vexDispatches.filter((d) => d.piId === pi.id)) {
      for (const it of d.items) {
        sent.set(it.partNumber, (sent.get(it.partNumber) ?? 0) + it.qty)
      }
    }
    let undispatchedValue = 0
    for (const li of pi.lineItems) {
      const dispatchedQty = sent.get(li.partNumber) ?? 0
      const remaining = li.quantity - dispatchedQty
      if (remaining > 0) undispatchedValue += remaining * li.unitPrice
    }
    if (undispatchedValue > 0 && pi.paymentReceivedAmount > 0) {
      pendingToDispatch += undispatchedValue
    }
    for (const d of vexDispatches.filter(
      (d) =>
        d.piId === pi.id && (d.status === 'Invoiced' || d.status === 'Shipped'),
    )) {
      for (const it of d.items) {
        const li = pi.lineItems.find((l) => l.partNumber === it.partNumber)
        if (li) salesInvoiceValue += li.unitPrice * it.qty
      }
    }
  }
  const taxInvoicedDispatchCount = vexDispatches.filter(
    (d) => d.status === 'Invoiced' || d.status === 'Shipped',
  ).length

  // 4-stage funnel over the 141 Tally-imported orders.
  const funnel = vexFunnelCounts(vexOrders)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="VEX orders"
          subtitle={`${vexPis.length} VEX PI${vexPis.length === 1 ? '' : 's'} in flight, ${vexOrders.length} legacy Tally orders on record.`}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX' },
          ]}
          actions={
            canCreatePi ? (
              <Link
                href="/operations/vex/pi/new"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                <Plus aria-hidden className="size-4" /> New VEX PI
              </Link>
            ) : null
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <section
            aria-label="VEX KPIs"
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5"
          >
            <KpiTile
              label="Total PIs"
              value={String(vexPis.length)}
              hint={`${dispatchedPis} with at least one dispatch`}
              tooltip="Count of VEX PIs raised."
            />
            <KpiTile
              label="Total pipeline"
              value={`Rs ${(totalPipeline / 1e5).toFixed(2)} L`}
              hint="sum of every VEX PI raised"
              tooltip="Total business pipeline. Sum of all VEX PI line-item values across every PI in flight, regardless of payment or dispatch state."
            />
            <KpiTile
              label="Received"
              value={`Rs ${(totalReceived / 1e5).toFixed(2)} L`}
              hint="cumulative payment landed"
              tooltip="Sum of payments logged against VEX PIs."
            />
            <KpiTile
              label="Pending to dispatch"
              value={`Rs ${(pendingToDispatch / 1e5).toFixed(2)} L`}
              hint="payment received, kits not dispatched"
              tone="amber"
              tooltip="Obligation. Value of undispatched qty on PIs where payment has been received."
            />
            <KpiTile
              label="Sales invoice amount"
              value={`Rs ${(salesInvoiceValue / 1e5).toFixed(2)} L`}
              hint={`${taxInvoicedDispatchCount} dispatches with tax invoice`}
              tone="sage"
              tooltip="Cumulative rupee value of dispatches that have been tax-invoiced (status Invoiced or Shipped)."
            />
          </section>

          <section
            aria-label="Tally order funnel"
            className={
              'rounded-md border border-border border-l-4 bg-card p-4 ' +
              accent.cardBorderClass
            }
          >
            <h2 className="font-heading text-sm font-semibold text-brand-navy">
              Legacy Tally order funnel ({vexOrders.length} records)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pre-Phase-3 VEX orders ingested from Tally. New orders flow through the New VEX PI form above.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FunnelCell label="Proforma Sent" value={funnel['Proforma Sent']} />
              <FunnelCell label="Payment Received" value={funnel['Payment Received']} />
              <FunnelCell label="Invoice Generated" value={funnel['Invoice Generated']} />
              <FunnelCell label="Dispatched" value={funnel.Dispatched} />
            </dl>
          </section>

          <section aria-label="VEX PIs">
            <SectionHeading
              title="VEX PIs"
              hint={`${vexPis.length} in flight. Grouped by billing entity.`}
              id="vex-pis"
            />
            <VexPiList pis={vexPis} />
          </section>

          <section aria-label="VEX SKU master">
            <SectionHeading
              title="SKU master"
              hint={`${vexProducts.length} VEX products. Read-only in Phase 1.`}
              id="vex-skus"
            />
            <VexProductsTable products={vexProducts} />
          </section>

          <section aria-label="VEX dispatches">
            <SectionHeading
              title="Dispatches"
              hint={`${vexDispatches.length} partial-dispatch records across all VEX PIs.`}
              id="vex-dispatches"
            />
            <VexDispatchesTable dispatches={vexDispatches} pis={vexPis} />
          </section>

          <section aria-label="Tally order tracker">
            <SectionHeading
              title="Tally order tracker"
              hint="141 legacy records, paginated 25 per page. Search by school or voucher."
              id="vex-orders"
            />
            <VexOrdersTable orders={vexOrders} />
          </section>
        </div>
      </main>
    </>
  )
}

function KpiTile({
  label,
  value,
  hint,
  tone,
  tooltip,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'amber' | 'sage'
  tooltip?: string
}) {
  const bg =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'sage'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-border bg-card'
  return (
    <div
      className={'rounded-md border p-4 ' + bg}
      title={tooltip}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold text-brand-navy tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function FunnelCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-background p-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-heading text-lg font-semibold text-brand-navy tabular-nums">
        {value}
      </dd>
    </div>
  )
}

function SectionHeading({
  title,
  hint,
  id,
}: {
  title: string
  hint?: string
  id?: string
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2
        id={id}
        className="font-heading text-base font-semibold text-brand-navy"
      >
        {title}
      </h2>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

