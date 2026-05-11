'use client'

/*
 * Agreement edit form. Renders read-only if canEdit is false. Mirrors
 * gsl-mou-system AgreementsView edit form fields verbatim, plus a
 * vendorId picker that links to the Ops vendor master (gsl-mou-system
 * has no separate Vendor entity).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Agreement, AgreementCustody, AgreementType, Vendor } from '@/lib/types'

interface Props {
  agreement: Agreement
  vendors: Vendor[]
  canEdit: boolean
}

export function AgreementEditForm({ agreement, vendors, canEdit }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Agreement>(agreement)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function set<K extends keyof Agreement>(key: K, value: Agreement[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.partyName.trim()) return setError('Party name required.')
    if (!form.natureOfAgreement.trim())
      return setError('Nature of agreement required.')
    if (!form.startDate) return setError('Start date required.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/agreements/${agreement.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Save failed (${res.status})`)
      }
      setToast('Saved. Will reflect everywhere within ~5 minutes.')
      router.refresh()
      setTimeout(() => setToast(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const fieldDisabled = !canEdit

  return (
    <div className="rounded-md border border-border bg-card p-5">
      {!canEdit ? (
        <p className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          Read-only. Finance can edit this record.
        </p>
      ) : null}
      {toast ? (
        <div className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="block text-xs text-muted-foreground">Type</span>
          <select
            value={form.type}
            disabled={fieldDisabled}
            onChange={(e) => set('type', e.target.value as AgreementType)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          >
            <option value="Vendor">Vendor</option>
            <option value="NDA">NDA</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs text-muted-foreground">Party name</span>
          <input
            type="text"
            value={form.partyName}
            disabled={fieldDisabled}
            onChange={(e) => set('partyName', e.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
          />
        </label>
        <label className="block sm:col-span-3">
          <span className="block text-xs text-muted-foreground">
            Linked vendor (optional)
          </span>
          <select
            value={form.vendorId ?? ''}
            disabled={fieldDisabled}
            onChange={(e) => set('vendorId', e.target.value || null)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          >
            <option value="">/ unlinked /</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.category ? ` (${v.category})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className="block text-xs text-muted-foreground">
            Nature of agreement
          </span>
          <input
            type="text"
            value={form.natureOfAgreement}
            disabled={fieldDisabled}
            onChange={(e) => set('natureOfAgreement', e.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
          />
        </label>
        <TextField
          label="Product (optional)"
          value={form.product ?? ''}
          onChange={(v) => set('product', v.trim() || null)}
          disabled={fieldDisabled}
        />
        <TextField
          label="Department (optional)"
          value={form.department ?? ''}
          onChange={(v) => set('department', v.trim() || null)}
          disabled={fieldDisabled}
        />
        <TextField
          label="Vendor location"
          value={form.vendorLocation ?? ''}
          onChange={(v) => set('vendorLocation', v.trim() || null)}
          disabled={fieldDisabled}
        />
        <label className="block sm:col-span-3">
          <span className="block text-xs text-muted-foreground">
            Key terms (optional)
          </span>
          <textarea
            value={form.keyTerms ?? ''}
            disabled={fieldDisabled}
            onChange={(e) => set('keyTerms', e.target.value.trim() || null)}
            placeholder="e.g. Exclusive supply for K-12 STEAM, 5 years, Rs 50L annual minimum"
            rows={2}
            className="mt-1 min-h-16 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted-foreground">Start date</span>
          <input
            type="date"
            value={form.startDate}
            disabled={fieldDisabled}
            onChange={(e) => set('startDate', e.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted-foreground">
            End date (leave blank for indefinite)
          </span>
          <input
            type="date"
            value={form.endDate ?? ''}
            disabled={fieldDisabled}
            onChange={(e) => set('endDate', e.target.value || null)}
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          />
        </label>
        <TextField
          label="Tenure (freetext)"
          value={form.tenure ?? ''}
          onChange={(v) => set('tenure', v.trim() || null)}
          disabled={fieldDisabled}
        />
        <TextField
          label="Notice period"
          value={form.noticePeriod ?? ''}
          onChange={(v) => set('noticePeriod', v.trim() || null)}
          disabled={fieldDisabled}
        />
        <label className="block">
          <span className="block text-xs text-muted-foreground">Custody</span>
          <select
            value={form.physicalCustody ?? ''}
            disabled={fieldDisabled}
            onChange={(e) =>
              set('physicalCustody', (e.target.value || null) as AgreementCustody | null)
            }
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          >
            <option value="">/</option>
            <option value="Physical">Physical</option>
            <option value="Digital">Digital</option>
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className="block text-xs text-muted-foreground">
            Document link
          </span>
          <input
            type="url"
            value={form.documentUrl ?? ''}
            disabled={fieldDisabled}
            onChange={(e) => set('documentUrl', e.target.value.trim() || null)}
            placeholder="https://..."
            className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
          />
        </label>
      </div>
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
      />
    </label>
  )
}
