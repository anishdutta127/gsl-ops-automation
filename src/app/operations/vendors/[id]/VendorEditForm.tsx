'use client'

/*
 * Vendor edit form. Inline; persists via POST /api/operations/vendors/[id]/edit
 * with an honest toast on save: "Saved. Will reflect everywhere within
 * ~5 minutes."
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Vendor } from '@/lib/types'

export function VendorEditForm({ vendor }: { vendor: Vendor }) {
  const router = useRouter()
  const [form, setForm] = useState<Vendor>(vendor)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function set<K extends keyof Vendor>(key: K, value: Vendor[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Vendor name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vendors/${vendor.id}/edit`, {
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

  return (
    <div className="rounded-md border border-border bg-card p-5">
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
        <TextField
          label="Vendor name"
          value={form.name}
          onChange={(v) => set('name', v)}
          required
        />
        <TextField
          label="Legal entity"
          value={form.legalEntity ?? ''}
          onChange={(v) => set('legalEntity', v.trim() || null)}
        />
        <TextField
          label="Category"
          value={form.category ?? ''}
          onChange={(v) => set('category', v.trim() || null)}
        />
        <TextField
          label="Primary contact"
          value={form.primaryContact ?? ''}
          onChange={(v) => set('primaryContact', v.trim() || null)}
        />
        <TextField
          label="Primary email"
          value={form.primaryEmail ?? ''}
          onChange={(v) => set('primaryEmail', v.trim() || null)}
          type="email"
        />
        <TextField
          label="Primary phone"
          value={form.primaryPhone ?? ''}
          onChange={(v) => set('primaryPhone', v.trim() || null)}
        />
        <TextField
          label="GSTIN"
          value={form.gstNumber ?? ''}
          onChange={(v) => set('gstNumber', v.trim() || null)}
        />
        <TextField
          label="PAN"
          value={form.pan ?? ''}
          onChange={(v) => set('pan', v.trim() || null)}
        />
        <TextField
          label="Bank account"
          value={form.bankAccount ?? ''}
          onChange={(v) => set('bankAccount', v.trim() || null)}
        />
        <TextField
          label="IFSC"
          value={form.ifsc ?? ''}
          onChange={(v) => set('ifsc', v.trim() || null)}
        />
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="block text-xs text-muted-foreground">Address</span>
          <textarea
            value={form.address ?? ''}
            onChange={(e) => set('address', e.target.value.trim() || null)}
            rows={2}
            className="mt-1 min-h-16 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="block text-xs text-muted-foreground">Notes</span>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            className="mt-1 min-h-20 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set('active', e.target.checked)}
          />
          Active vendor
        </label>
      </div>
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
    </div>
  )
}

function TextField({
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
