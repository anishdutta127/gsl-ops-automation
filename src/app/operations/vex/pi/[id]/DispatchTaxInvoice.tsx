'use client'

/*
 * Tax invoice control for a VEX dispatch (Finance only).
 *
 * Records the Tally tax invoice as a number + a link to the PDF (kept in
 * Drive/SharePoint, the paste-a-URL pattern the rest of the app uses for
 * document references, e.g. the delivery acknowledgement). Saving it advances
 * the dispatch to Invoiced. Restores the capability that lived on
 * gsl-mou-system; before this the PI page only showed "awaiting upload" with no
 * way to record the invoice.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'

interface Props {
  pi: VexPi
  dispatch: VexDispatch
  canFinance: boolean
}

export function DispatchTaxInvoice({ pi, dispatch, canFinance }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [number, setNumber] = useState(dispatch.taxInvoiceNumber ?? '')
  const [url, setUrl] = useState(dispatch.taxInvoicePath ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasInvoice = Boolean(dispatch.taxInvoicePath)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/operations/vex/pi/${pi.id}/dispatch/${dispatch.id}/tax-invoice`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            taxInvoiceNumber: number.trim(),
            taxInvoiceUrl: url.trim(),
          }),
        },
      )
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Save failed (${res.status})`)
      }
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  // Read-only view for non-Finance users.
  if (!canFinance) {
    return hasInvoice ? (
      <a
        href={dispatch.taxInvoicePath ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-brand-navy hover:underline"
      >
        {dispatch.taxInvoiceNumber ?? 'PDF'}
      </a>
    ) : (
      <span className="text-muted-foreground">awaiting upload</span>
    )
  }

  if (hasInvoice && !editing) {
    return (
      <div className="flex flex-col gap-1">
        <a
          href={dispatch.taxInvoicePath ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-navy hover:underline"
        >
          {dispatch.taxInvoiceNumber ?? 'PDF'}
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start text-[11px] text-muted-foreground hover:text-brand-navy hover:underline"
        >
          Replace
        </button>
      </div>
    )
  }

  return (
    <div className="flex max-w-[14rem] flex-col gap-1.5">
      {error ? <span className="text-[11px] text-red-700">{error}</span> : null}
      <input
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Invoice number"
        aria-label={`Tax invoice number for dispatch ${dispatch.id}`}
        className="min-h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-xs"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://drive... link to PDF"
        aria-label={`Tax invoice link for dispatch ${dispatch.id}`}
        className="min-h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-xs"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !number.trim() || !url.trim()}
          className="inline-flex min-h-8 items-center rounded-md bg-brand-navy px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save invoice'}
        </button>
        {hasInvoice ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setNumber(dispatch.taxInvoiceNumber ?? '')
              setUrl(dispatch.taxInvoicePath ?? '')
              setError(null)
            }}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  )
}
