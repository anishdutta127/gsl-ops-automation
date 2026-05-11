'use client'

/*
 * AccountsExecutionForm (Gate 3 Step 6).
 *
 * Accounts (Finance) entry surface. Auto-fills from allocations; the
 * only Finance-editable column is qtyActualDispatched. Partial dispatch
 * allowed (qtyActualDispatched can be 0 up to qtyRequested).
 *
 * Delivery Challan upload + Email Warehouse button. Email is intent-
 * only at Step 6 (Gate 4 wires SMTP).
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle, Mail, Download, Upload } from 'lucide-react'
import type { AccountsDispatchEntry, DispatchSummary, KitAllocation } from '@/lib/types'

interface Props {
  mouId: string
  allocations: KitAllocation[]
  dispatchSummary: DispatchSummary
  editable: boolean
}

interface RowState {
  grade: number
  studentsRequested: number
  productRequested: string
  qtyRequested: number
  qtyActualDispatched: number
}

function buildRows(
  allocations: KitAllocation[],
  existing: AccountsDispatchEntry[] | null,
): RowState[] {
  const existingByGrade = new Map<number, AccountsDispatchEntry>()
  for (const e of existing ?? []) existingByGrade.set(e.grade, e)
  return allocations.map((a) => {
    const ex = existingByGrade.get(a.grade)
    return {
      grade: a.grade,
      studentsRequested: a.students,
      productRequested: a.productName,
      qtyRequested: a.kitsQty,
      qtyActualDispatched: ex?.qtyActualDispatched ?? 0,
    }
  })
}

export function AccountsExecutionForm({
  mouId,
  allocations,
  dispatchSummary,
  editable,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<RowState[]>(() =>
    buildRows(allocations, dispatchSummary.accountsEntries ?? []),
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [emailState, setEmailState] = useState<'idle' | 'logging' | 'logged'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const challanInputRef = useRef<HTMLInputElement>(null)

  function update(idx: number, qty: number): void {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, qtyActualDispatched: qty } : r)))
  }

  async function save(): Promise<void> {
    setSaveState('saving')
    setErrorMessage(null)
    try {
      for (const r of rows) {
        if (r.qtyActualDispatched < 0 || r.qtyActualDispatched > r.qtyRequested) {
          throw new Error(
            `Grade ${r.grade}: qty must be between 0 and ${r.qtyRequested}.`,
          )
        }
      }
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/accounts-execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountsEntries: rows.map((r) => ({
            grade: r.grade,
            studentsRequested: r.studentsRequested,
            productRequested: r.productRequested,
            qtyRequested: r.qtyRequested,
            qtyActualDispatched: r.qtyActualDispatched,
          })),
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

  async function uploadChallan(): Promise<void> {
    const file = challanInputRef.current?.files?.[0]
    if (!file) return
    setSaveState('saving')
    setErrorMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/challan/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setSaveState('error')
      setErrorMessage(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  async function emailWarehouse(): Promise<void> {
    setEmailState('logging')
    try {
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/warehouse-email`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Email log failed')
      setEmailState('logged')
      setTimeout(() => setEmailState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setEmailState('idle')
      setErrorMessage(e instanceof Error ? e.message : 'Email log failed')
    }
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="accounts-table">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2 pr-3 font-medium">Grade</th>
              <th className="py-2 pr-3 font-medium">Students</th>
              <th className="py-2 pr-3 font-medium">Product requested</th>
              <th className="py-2 pr-3 font-medium">Qty requested</th>
              <th className="py-2 pr-3 font-medium">Actual dispatched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.grade} className="border-b border-border/60">
                <td className="py-1.5 pr-3 font-medium text-slate-700">Grade {r.grade}</td>
                <td className="py-1.5 pr-3">{r.studentsRequested}</td>
                <td className="py-1.5 pr-3">{r.productRequested}</td>
                <td className="py-1.5 pr-3">{r.qtyRequested}</td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    min={0}
                    max={r.qtyRequested}
                    value={r.qtyActualDispatched}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      update(idx, Number.isFinite(n) && n >= 0 ? n : 0)
                    }}
                    disabled={!editable}
                    className="w-24 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    aria-label={`Grade ${r.grade} actual dispatched`}
                    data-testid={`actual-${r.grade}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dispatchSummary.salesRemarks && (
        <p className="text-xs text-slate-600">
          Sales remarks: {dispatchSummary.salesRemarks}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">
          Delivery challan (Tally)
        </h3>
        {dispatchSummary.deliveryChallanPath ? (
          <div className="flex items-center gap-2">
            <a
              href={dispatchSummary.deliveryChallanPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
              data-testid="challan-download"
            >
              <Download aria-hidden className="size-4" />
              Download challan
            </a>
            {editable && (
              <>
                <input
                  ref={challanInputRef}
                  type="file"
                  accept="application/pdf"
                  className="text-xs"
                  data-testid="challan-replace-input"
                />
                <button
                  type="button"
                  onClick={() => void uploadChallan()}
                  className="min-h-11 rounded-md bg-brand-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy/90"
                  data-testid="challan-replace"
                >
                  Replace
                </button>
              </>
            )}
          </div>
        ) : (
          editable && (
            <div className="flex items-center gap-2">
              <input
                ref={challanInputRef}
                type="file"
                accept="application/pdf"
                className="text-xs"
                data-testid="challan-input"
              />
              <button
                type="button"
                onClick={() => void uploadChallan()}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy/90"
                data-testid="challan-upload"
              >
                <Upload aria-hidden className="size-4" />
                Upload challan
              </button>
            </div>
          )
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === 'saving'}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
            data-testid="accounts-save"
          >
            <Save aria-hidden className="size-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save accounts entry'}
          </button>
          <button
            type="button"
            onClick={() => void emailWarehouse()}
            disabled={emailState !== 'idle'}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 disabled:opacity-60"
            data-testid="email-warehouse"
          >
            <Mail aria-hidden className="size-4" />
            {emailState === 'logging' ? 'Logging...' : emailState === 'logged' ? 'Logged' : 'Email warehouse'}
          </button>
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle aria-hidden className="size-3" />
              Dispatch saved. Status will update within ~5 minutes; warehouse notified at next cron drain.
            </span>
          )}
          {dispatchSummary.warehouseEmailLoggedAt && (
            <span className="text-xs text-slate-500">
              Last warehouse-email intent: {dispatchSummary.warehouseEmailLoggedAt.slice(0, 16).replace('T', ' ')}
            </span>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
