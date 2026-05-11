'use client'

/*
 * Per-dispatch row actions. Three affordances:
 *   - Email warehouse (Ops): opens mailto pre-filled and stamps the
 *     dispatch as Request Raised to Warehouse + records warehouse-
 *     email-sent-at audit metadata.
 *   - Advance status (Ops + Finance): Requested -> Request Raised to
 *     Warehouse -> Invoiced -> Shipped. Finance can flip to Invoiced
 *     after tax invoice is generated; Ops can mark Shipped.
 *   - Supporting doc upload: Phase 1 surfaces the existing path read-
 *     only. Upload UI lives on gsl-mou-system today; Ops adds it in
 *     Phase 1.1 (deferred).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, FileText } from 'lucide-react'
import type { VexDispatch, VexDispatchStatusV3, VexPi } from '@/lib/mouSystem/types'

const STATUS_ORDER: VexDispatchStatusV3[] = [
  'Requested',
  'Request Raised to Warehouse',
  'Invoiced',
  'Shipped',
]

interface Props {
  pi: VexPi
  dispatch: VexDispatch
  warehouseEmail: string | null
  canDispatch: boolean
  canFinance: boolean
}

export function DispatchRowActions({
  pi,
  dispatch,
  warehouseEmail,
  canDispatch,
  canFinance,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function emailWarehouse() {
    if (!warehouseEmail) {
      setError(
        'Configure warehouse email in config/company.json before raising warehouse requests.',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/operations/vex/pi/${pi.id}/dispatch/${dispatch.id}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'Request Raised to Warehouse',
            warehouseEmailSent: true,
          }),
        },
      )
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Mark failed (${res.status})`)
      }
      const subject = `Dispatch request: ${pi.piNumber} / ${pi.schoolName}`
      const body = [
        `Dispatch ID: ${dispatch.id}`,
        `PI Number: ${pi.piNumber}`,
        `School: ${pi.schoolName}`,
        `Mode: ${dispatch.mode}`,
        `Items: ${dispatch.items.map((i) => `${i.partNumber} x ${i.qty}`).join(', ')}`,
        `Freight: Rs ${dispatch.freight.toLocaleString('en-IN')}`,
        '',
        'Raised via the GSL Ops platform.',
      ].join('\n')
      const href = `mailto:${encodeURIComponent(warehouseEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.location.href = href
      setToast('Status updated. Will reflect everywhere within ~5 minutes.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed')
    } finally {
      setBusy(false)
    }
  }

  async function flipStatus(next: VexDispatchStatusV3) {
    if (next === dispatch.status) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/operations/vex/pi/${pi.id}/dispatch/${dispatch.id}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      )
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Transition failed (${res.status})`)
      }
      setToast('Status updated. Will reflect everywhere within ~5 minutes.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed')
    } finally {
      setBusy(false)
    }
  }

  const stamped =
    dispatch.status === 'Request Raised to Warehouse' ||
    dispatch.status === 'Invoiced' ||
    dispatch.status === 'Shipped'

  const currentIdx = STATUS_ORDER.indexOf(dispatch.status)
  const nextStatus = STATUS_ORDER[currentIdx + 1] ?? null
  // Finance flips Invoiced; Ops can do Request Raised and Shipped.
  const showFinanceFlip = canFinance && nextStatus === 'Invoiced'
  const showOpsFlip =
    canDispatch && nextStatus !== null && nextStatus !== 'Invoiced'

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {error ? <span className="text-red-700">{error}</span> : null}
      {toast ? <span className="text-emerald-700">{toast}</span> : null}
      <div className="flex flex-wrap items-center gap-2">
        {canDispatch ? (
          <button
            type="button"
            disabled={busy || stamped}
            onClick={emailWarehouse}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground hover:bg-muted disabled:opacity-50"
            title={
              stamped
                ? 'Already raised to warehouse'
                : 'Mark request raised and open email'
            }
          >
            <Mail aria-hidden className="size-3" />
            {stamped ? 'Raised' : 'Email warehouse'}
          </button>
        ) : null}
        {showOpsFlip || showFinanceFlip ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => flipStatus(nextStatus!)}
            className="inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2 py-1 text-foreground hover:bg-muted disabled:opacity-50"
          >
            Mark {nextStatus}
          </button>
        ) : null}
        {dispatch.supportingDocPath ? (
          <a
            href={dispatch.supportingDocPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center gap-1 text-brand-navy hover:underline"
          >
            <FileText aria-hidden className="size-3" /> Doc
          </a>
        ) : null}
      </div>
      {dispatch.warehouseEmailSentAt ? (
        <span className="text-[11px] text-muted-foreground">
          Raised to warehouse{' '}
          {new Date(dispatch.warehouseEmailSentAt).toLocaleString('en-IN')}
          {dispatch.warehouseEmailSentBy
            ? ` by ${dispatch.warehouseEmailSentBy}`
            : ''}
        </span>
      ) : null}
    </div>
  )
}
