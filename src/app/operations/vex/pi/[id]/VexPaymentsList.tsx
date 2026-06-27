'use client'

/*
 * Recorded VEX payments, with in-app correction (Pass 1 finance corrections).
 *
 * Lists each payment receipt logged against this PI. Finance can EDIT a
 * receipt (amount/date/mode/reference) or VOID it (soft-delete + reverse the
 * VexPi balance). Both POST to /api/operations/vex/pi/[id]/payment/[logId] and
 * refresh. This replaces the over-count recovery scripts with a button.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatRs } from '@/lib/format'
import type { PaymentLog, PaymentMode } from '@/lib/types'

const PAYMENT_MODES: PaymentMode[] = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

const REASON_COPY: Record<string, string> = {
  permission: 'You do not have permission to correct VEX payments.',
  'not-on-pi': 'That receipt is not recorded against this PI.',
  'already-voided': 'That receipt is already voided.',
  'invalid-amount': 'Enter a valid amount greater than zero.',
  'invalid-date': 'Enter a valid date.',
  'missing-reason': 'A reason of at least 10 characters is required to void.',
  'log-not-found': 'That receipt no longer exists.',
}

interface Props {
  piId: string
  payments: PaymentLog[]
  canFinance: boolean
}

export function VexPaymentsList({ piId, payments, canFinance }: Props) {
  if (payments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No payments recorded yet.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium tabular-nums text-right">Amount</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 font-medium">Reference</th>
            {canFinance ? <th className="px-3 py-2 font-medium text-right">Correct</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {payments.map((p) => (
            <PaymentRow key={p.id} piId={piId} payment={p} canFinance={canFinance} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PaymentRow({
  piId,
  payment,
  canFinance,
}: {
  piId: string
  payment: PaymentLog
  canFinance: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState<'none' | 'edit' | 'void'>('none')
  const [amount, setAmount] = useState(String(payment.amount))
  const [date, setDate] = useState(payment.date)
  const [mode, setMode] = useState<PaymentMode>(payment.mode)
  const [reference, setReference] = useState(payment.reference ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vex/pi/${piId}/payment/${payment.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        const key = b.error ?? ''
        throw new Error(REASON_COPY[key] ?? b.message ?? `Failed (${res.status})`)
      }
      setOpen('none')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr>
        <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatDate(payment.date)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{formatRs(payment.amount)}</td>
        <td className="px-3 py-2 text-xs">{payment.mode}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{payment.reference ?? '-'}</td>
        {canFinance ? (
          <td className="px-3 py-2 text-right">
            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(open === 'edit' ? 'none' : 'edit')}
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setOpen(open === 'void' ? 'none' : 'void')}
                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Void
              </button>
            </div>
          </td>
        ) : null}
      </tr>
      {canFinance && open !== 'none' ? (
        <tr>
          <td colSpan={5} className="bg-muted/40 px-3 py-3">
            {error ? (
              <div className="mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800" role="alert">
                {error}
              </div>
            ) : null}
            {open === 'edit' ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Amount (Rs)</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Amount"
                    className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Date"
                    className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Mode</span>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as PaymentMode)}
                    aria-label="Mode"
                    className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Reference</span>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    aria-label="Reference"
                    className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </label>
                <div className="sm:col-span-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      post({
                        action: 'edit',
                        amount: parseFloat(amount) || 0,
                        date,
                        mode,
                        reference: reference.trim() || null,
                      })
                    }
                    className="inline-flex min-h-10 items-center rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Voiding reverses {formatRs(payment.amount)} from this PI&apos;s received total and
                  recomputes its status. The receipt is kept for audit, not deleted.
                </p>
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Reason (min 10 characters)</span>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-label="Void reason"
                    className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || reason.trim().length < 10}
                  onClick={() => post({ action: 'void', reason: reason.trim() })}
                  className="inline-flex min-h-10 items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Voiding...' : 'Void this payment'}
                </button>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  )
}
