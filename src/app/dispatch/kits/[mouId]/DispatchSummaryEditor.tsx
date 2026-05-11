'use client'

/*
 * DispatchSummaryEditor (Gate 3 Step 5).
 *
 * Sales-editable school details + read-only kit-requirement table.
 * Save dual-writes the School Master per joint spec section 5.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle } from 'lucide-react'
import type { DispatchSummary, KitAllocation } from '@/lib/types'

interface Props {
  mouId: string
  allocations: KitAllocation[]
  dispatchSummary: DispatchSummary | null
  editable: boolean
  fallback: {
    schoolName: string
    shippingAddress: string
    contactPerson: string
    contactNumber: string
  }
}

export function DispatchSummaryEditor({
  mouId,
  allocations,
  dispatchSummary,
  editable,
  fallback,
}: Props) {
  const router = useRouter()
  const [schoolName, setSchoolName] = useState(
    dispatchSummary?.schoolName ?? fallback.schoolName,
  )
  const [shippingAddress, setShippingAddress] = useState(
    dispatchSummary?.shippingAddress ?? fallback.shippingAddress,
  )
  const [contactPerson, setContactPerson] = useState(
    dispatchSummary?.contactPerson ?? fallback.contactPerson,
  )
  const [contactNumber, setContactNumber] = useState(
    dispatchSummary?.contactNumber ?? fallback.contactNumber,
  )
  const [salesRemarks, setSalesRemarks] = useState(
    dispatchSummary?.salesRemarks ?? '',
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function save(): Promise<void> {
    setSaveState('saving')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/summary/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schoolName: schoolName.trim(),
          shippingAddress: shippingAddress.trim(),
          contactPerson: contactPerson.trim(),
          contactNumber: contactNumber.trim(),
          salesRemarks: salesRemarks.trim() === '' ? null : salesRemarks.trim(),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setSaveState('error')
      setErrorMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const inputClass =
    'mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy'

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-brand-navy">School name</label>
          <input
            type="text"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="summary-school-name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Shipping address (with pincode)</label>
          <input
            type="text"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="summary-shipping-address"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Contact person</label>
          <input
            type="text"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="summary-contact-person"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Contact number</label>
          <input
            type="text"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="summary-contact-number"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-navy">
          Additional remarks (e.g. Kits are returnable after course completion)
        </label>
        <textarea
          value={salesRemarks}
          onChange={(e) => setSalesRemarks(e.target.value)}
          disabled={!editable}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          data-testid="summary-remarks"
        />
      </div>

      <div className="overflow-x-auto">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">
          Kits planning (read-only after approval)
        </h3>
        <table className="mt-2 min-w-full text-sm" data-testid="summary-kits-table">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2 pr-3 font-medium">Grade</th>
              <th className="py-2 pr-3 font-medium">Students</th>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.grade} className="border-b border-border/60">
                <td className="py-1.5 pr-3 font-medium text-slate-700">Grade {a.grade}</td>
                <td className="py-1.5 pr-3">{a.students}</td>
                <td className="py-1.5 pr-3">{a.productName}</td>
                <td className="py-1.5 pr-3">{a.kitType ?? '-'}</td>
                <td className="py-1.5 pr-3">{a.kitsQty}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3">{allocations.reduce((s, a) => s + a.students, 0)}</td>
              <td />
              <td />
              <td className="py-2 pr-3">{allocations.reduce((s, a) => s + a.kitsQty, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === 'saving'}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
            data-testid="summary-save"
          >
            <Save aria-hidden className="size-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save summary'}
          </button>
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle aria-hidden className="size-3" />
              Summary saved. School master updated within ~5 minutes.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
