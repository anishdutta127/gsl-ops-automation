'use client'

/*
 * VEX PI form (Ops port of gsl-mou-system/src/app/vex/pi/new/VexPiForm.tsx).
 *
 * Field order, copy, button positions preserved verbatim. POSTs to the
 * Ops route /api/operations/vex/pi/create which writes through the
 * GitHub queue + advances pi_counter_map.json via the migrated
 * piCounterAtomic.issuePiNumberAtomic helper.
 *
 * Honest toast on success: "Saved. Will reflect everywhere within ~5
 * minutes." Different copy from gsl-mou-system (which says "in app in
 * ~1 minute") because the Ops sync drain runs on a 5-minute cron, not
 * the mou-system 1-minute runner.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { formatRs } from '@/lib/format'
import type { VexProduct } from '@/lib/mouSystem/types'

interface RowState {
  partNumber: string
  quantity: string
  unitPrice: string
}

const GST_PCT = 0.18

interface Props {
  products: VexProduct[]
  defaultEntityKey: 'MH' | 'UP'
  userName: string
}

export function VexPiForm({ products, defaultEntityKey, userName }: Props) {
  const router = useRouter()
  const [entityKey, setEntityKey] = useState<'MH' | 'UP'>(defaultEntityKey)
  const [schoolName, setSchoolName] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [schoolGstNumber, setSchoolGstNumber] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactNo, setContactNo] = useState('')
  const [freight, setFreight] = useState('0')
  const [rows, setRows] = useState<RowState[]>([
    { partNumber: '', quantity: '1', unitPrice: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function addRow() {
    setRows((r) => [...r, { partNumber: '', quantity: '1', unitPrice: '' }])
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }
  function updateRow(i: number, patch: Partial<RowState>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  const totals = useMemo(() => {
    const subtotal = rows.reduce((s, r) => {
      const q = parseFloat(r.quantity) || 0
      const u = parseFloat(r.unitPrice) || 0
      return s + q * u
    }, 0)
    const f = parseFloat(freight) || 0
    const taxable = subtotal + f
    const gst = taxable * GST_PCT
    return { subtotal, freight: f, taxable, gst, total: taxable + gst }
  }, [rows, freight])

  async function submit() {
    if (!schoolName.trim() || !shippingAddress.trim() || !billingName.trim() || !billingAddress.trim()) {
      setError('Fill every school billing field.')
      return
    }
    if (!contactPerson.trim() || !contactNo.trim()) {
      setError('Contact person and number required.')
      return
    }
    if (rows.length === 0) {
      setError('Add at least one product.')
      return
    }
    const parsed = rows.map((r) => ({
      partNumber: r.partNumber.trim(),
      quantity: parseFloat(r.quantity) || 0,
      unitPrice: parseFloat(r.unitPrice) || 0,
    }))
    for (const r of parsed) {
      if (!r.partNumber) {
        setError('Pick a product on every row.')
        return
      }
      if (r.quantity <= 0) {
        setError(`Quantity must be positive for ${r.partNumber}.`)
        return
      }
      if (r.unitPrice <= 0) {
        setError(`Unit price must be positive for ${r.partNumber}.`)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/operations/vex/pi/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityKey,
          schoolName: schoolName.trim(),
          shippingAddress: shippingAddress.trim(),
          billingName: billingName.trim(),
          billingAddress: billingAddress.trim(),
          schoolGstNumber: schoolGstNumber.trim() || null,
          contactPerson: contactPerson.trim(),
          contactNo: contactNo.trim(),
          lineItems: parsed,
          freightCharges: parseFloat(freight) || 0,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(b.message ?? b.error ?? `Submit failed (${res.status})`)
      }
      const json = (await res.json()) as { pi: { id: string; piNumber: string } }
      setToast(`Saved. Will reflect everywhere within ~5 minutes. PI ${json.pi.piNumber}.`)
      setTimeout(() => router.push(`/operations/vex/pi/${json.pi.id}`), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {toast ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <fieldset className="rounded-md border border-border bg-card p-5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          GST entity
        </legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {(['MH', 'UP'] as const).map((k) => (
            <label
              key={k}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="entityKey"
                checked={entityKey === k}
                onChange={() => setEntityKey(k)}
                aria-label={`Bill from ${k}`}
              />
              {k === 'MH'
                ? 'Maharashtra / MTPL/MH/2627/...'
                : 'Uttar Pradesh / MTPL/UP/2627/...'}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-border bg-card p-5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          School and billing
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School name (Ship To)" value={schoolName} onChange={setSchoolName} required />
          <Field label="Shipping address" value={shippingAddress} onChange={setShippingAddress} required />
          <Field label="Billing name" value={billingName} onChange={setBillingName} required />
          <Field label="Billing address" value={billingAddress} onChange={setBillingAddress} required />
          <Field label="School GST no (optional)" value={schoolGstNumber} onChange={setSchoolGstNumber} />
          <Field label="Contact person" value={contactPerson} onChange={setContactPerson} required />
          <Field label="Contact no" value={contactNo} onChange={setContactNo} required />
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-border bg-card p-5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Products
        </legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 text-left font-medium">Sr</th>
                <th className="px-1 py-1 text-left font-medium">Product (Part no)</th>
                <th className="px-1 py-1 text-right font-medium">Qty</th>
                <th className="px-1 py-1 text-right font-medium">Unit price (Rs)</th>
                <th className="px-1 py-1 text-right font-medium">Total (Rs)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const q = parseFloat(row.quantity) || 0
                const u = parseFloat(row.unitPrice) || 0
                const total = q * u
                return (
                  <tr key={i}>
                    <td className="px-1 py-1 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-1 py-1">
                      <select
                        value={row.partNumber}
                        onChange={(e) => updateRow(i, { partNumber: e.target.value })}
                        aria-label={`Product on row ${i + 1}`}
                        className="min-h-9 w-full rounded-md border border-input bg-card px-2 py-1"
                      >
                        <option value="">Pick a product</option>
                        {products.map((p) => (
                          <option key={p.partNumber} value={p.partNumber}>
                            {p.name} ({p.partNumber})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => updateRow(i, { quantity: e.target.value })}
                        aria-label={`Quantity on row ${i + 1}`}
                        className="min-h-9 w-20 rounded-md border border-input bg-card px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                        aria-label={`Unit price on row ${i + 1}`}
                        className="min-h-9 w-32 rounded-md border border-input bg-card px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums text-foreground">
                      {formatRs(total)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {rows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove row ${i + 1}`}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted"
        >
          <Plus aria-hidden className="size-3" /> Add row
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-border bg-card p-5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Totals
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Freight charges (Rs)"
            value={freight}
            onChange={setFreight}
            type="number"
          />
          <div className="text-sm tabular-nums">
            <p>
              Subtotal:{' '}
              <span className="font-semibold">{formatRs(totals.subtotal)}</span>
            </p>
            <p>
              Taxable value:{' '}
              <span className="font-semibold">{formatRs(totals.taxable)}</span>
            </p>
            <p>
              Add 18% GST:{' '}
              <span className="font-semibold">{formatRs(totals.gst)}</span>
            </p>
            <p className="mt-1 text-base">
              Total PI value:{' '}
              <span className="font-heading font-semibold text-brand-navy">
                {formatRs(totals.total)}
              </span>
            </p>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Generate PI'}
        </button>
        <span className="text-xs text-muted-foreground">
          Signed in as {userName}
        </span>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
      />
    </label>
  )
}
