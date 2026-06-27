'use client'

/*
 * Edit a VEX PI (Pass 2): header fields + freight + GST % + line items, with
 * live re-derived totals. POSTs JSON to /api/operations/vex/pi/[id]/edit and
 * navigates back to the PI on success. The server re-derives + re-validates;
 * this is the editing surface + a live preview.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRs } from '@/lib/format'
import type { VexPi } from '@/lib/mouSystem/types'

const round2 = (n: number) => Math.round(n * 100) / 100

const REASON_COPY: Record<string, string> = {
  voided: 'This PI is voided and cannot be edited.',
  'no-line-items': 'Add at least one line item.',
  'invalid-line-item': 'Check the line items: name, part number, qty and price are required.',
  'invalid-gst': 'GST % must be between 0 and 100.',
  'qty-below-dispatched': 'A quantity is below what has already been dispatched for that SKU.',
  permission: 'You do not have permission to edit this PI.',
}

interface Row {
  partNumber: string
  productName: string
  quantity: string
  unitPrice: string
}

interface Props {
  pi: VexPi
  dispatchedByPart: Record<string, number>
}

export function VexPiEditForm({ pi, dispatchedByPart }: Props) {
  const router = useRouter()
  const [schoolName, setSchoolName] = useState(pi.schoolName)
  const [shippingAddress, setShippingAddress] = useState(pi.shippingAddress)
  const [billingName, setBillingName] = useState(pi.billingName)
  const [billingAddress, setBillingAddress] = useState(pi.billingAddress)
  const [gst, setGst] = useState(pi.schoolGstNumber ?? '')
  const [contactPerson, setContactPerson] = useState(pi.contactPerson)
  const [contactNo, setContactNo] = useState(pi.contactNo)
  const [freight, setFreight] = useState(String(pi.freightCharges))
  const [gstPctInput, setGstPctInput] = useState(String(round2(pi.gstPct * 100)))
  const [rows, setRows] = useState<Row[]>(
    pi.lineItems.map((li) => ({
      partNumber: li.partNumber,
      productName: li.productName,
      quantity: String(li.quantity),
      unitPrice: String(li.unitPrice),
    })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => {
    const subtotal = round2(rows.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0), 0))
    const taxable = round2(subtotal + (parseFloat(freight) || 0))
    const gstAmount = round2(taxable * ((parseFloat(gstPctInput) || 0) / 100))
    return { subtotal, taxable, gstAmount, total: round2(taxable + gstAmount) }
  }, [rows, freight, gstPctInput])

  function setRow(i: number, patch: Partial<Row>) {
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vex/pi/${pi.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schoolName,
          shippingAddress,
          billingName,
          billingAddress,
          schoolGstNumber: gst.trim() || null,
          contactPerson,
          contactNo,
          freightCharges: parseFloat(freight) || 0,
          gstPct: (parseFloat(gstPctInput) || 0) / 100,
          lineItems: rows.map((r) => ({
            partNumber: r.partNumber.trim(),
            productName: r.productName.trim(),
            quantity: parseFloat(r.quantity) || 0,
            unitPrice: parseFloat(r.unitPrice) || 0,
          })),
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
        throw new Error((REASON_COPY[b.error ?? ''] ?? b.error ?? `Failed (${res.status})`) + (b.detail ? ` (${b.detail})` : ''))
      }
      router.push(`/operations/vex/pi/${pi.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Ship-to / school name" value={schoolName} onChange={setSchoolName} />
        <Field label="GSTIN" value={gst} onChange={setGst} />
        <Field label="Shipping address" value={shippingAddress} onChange={setShippingAddress} />
        <Field label="Billing name" value={billingName} onChange={setBillingName} />
        <Field label="Billing address" value={billingAddress} onChange={setBillingAddress} />
        <Field label="Contact person" value={contactPerson} onChange={setContactPerson} />
        <Field label="Contact no" value={contactNo} onChange={setContactNo} />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 font-heading text-sm font-semibold text-brand-navy">Line items</h2>
        <div className="space-y-2">
          {rows.map((r, i) => {
            const sent = dispatchedByPart[r.partNumber.trim()] ?? 0
            return (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-3">
                  <span className="block text-[11px] text-muted-foreground">Part no</span>
                  <input value={r.partNumber} onChange={(e) => setRow(i, { partNumber: e.target.value })} aria-label={`Part number ${i + 1}`} className="mt-1 min-h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-sm" />
                </div>
                <div className="col-span-4">
                  <span className="block text-[11px] text-muted-foreground">Product</span>
                  <input value={r.productName} onChange={(e) => setRow(i, { productName: e.target.value })} aria-label={`Product name ${i + 1}`} className="mt-1 min-h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-sm" />
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] text-muted-foreground">Qty{sent > 0 ? ` (>=${sent})` : ''}</span>
                  <input type="number" min={sent} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} aria-label={`Quantity ${i + 1}`} className="mt-1 min-h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-right text-sm tabular-nums" />
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] text-muted-foreground">Unit price</span>
                  <input type="number" min={0} value={r.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} aria-label={`Unit price ${i + 1}`} className="mt-1 min-h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-right text-sm tabular-nums" />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => setRows((s) => s.filter((_, idx) => idx !== i))} disabled={sent > 0} aria-label={`Remove line ${i + 1}`} title={sent > 0 ? 'Already dispatched; cannot remove' : 'Remove'} className="min-h-9 w-full rounded-md border border-input px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">
                    x
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={() => setRows((s) => [...s, { partNumber: '', productName: '', quantity: '0', unitPrice: '0' }])} className="mt-3 inline-flex min-h-9 items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
          Add line item
        </button>
      </section>

      <section className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Freight charges (Rs)" value={freight} onChange={setFreight} type="number" />
        <Field label="GST %" value={gstPctInput} onChange={setGstPctInput} type="number" />
        <div className="sm:col-span-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Derived label="Subtotal" value={totals.subtotal} />
          <Derived label="Taxable" value={totals.taxable} />
          <Derived label="GST" value={totals.gstAmount} />
          <Derived label="Total" value={totals.total} strong />
        </div>
      </section>

      <button type="button" onClick={submit} disabled={busy} className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? 'Saving...' : 'Save PI'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
    </label>
  )
}

function Derived({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={'tabular-nums ' + (strong ? 'font-heading text-base font-semibold text-brand-navy' : 'text-foreground')}>{formatRs(value)}</div>
    </div>
  )
}
