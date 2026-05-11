'use client'

/*
 * VEX PI actions block. Two side-by-side cards:
 *   - Log payment (Finance): records a payment receipt against this PI
 *   - Raise dispatch (Ops): creates a new VexDispatch row, gated by the
 *     migrated vexDispatchGate.ts logic (preserved verbatim).
 *
 * Mirrors gsl-mou-system/src/app/vex/pi/[id]/VexPiActions.tsx field
 * order + button copy. Gate errors surface as friendly toasts, not
 * silent swallows.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRs } from '@/lib/format'
import type {
  PaymentMode,
  VexDispatchMode,
  VexPi,
} from '@/lib/mouSystem/types'
import { checkVexDispatchGate } from '@/lib/mouSystem/vexDispatchGate'

const PAYMENT_MODES: PaymentMode[] = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Other',
]

interface Props {
  pi: VexPi
  alreadyDispatchedValue: number
  dispatchedQtyByPart: Record<string, number>
  canFinance: boolean
  canDispatch: boolean
}

export function VexPiActions({
  pi,
  alreadyDispatchedValue,
  dispatchedQtyByPart,
  canFinance,
  canDispatch,
}: Props) {
  const router = useRouter()
  const open = Math.max(0, pi.total - pi.paymentReceivedAmount)
  const canPay = open > 0
  const dispatchableValue = Math.max(
    0,
    pi.paymentReceivedAmount - alreadyDispatchedValue,
  )
  const dispatchUnlocked =
    pi.paymentReceivedAmount > 0 && dispatchableValue > 0

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canFinance ? (
        <PaymentBlock
          pi={pi}
          canPay={canPay}
          onDone={() => router.refresh()}
        />
      ) : null}
      {canDispatch ? (
        <DispatchBlock
          pi={pi}
          dispatchUnlocked={dispatchUnlocked}
          dispatchableValue={dispatchableValue}
          alreadyDispatchedValue={alreadyDispatchedValue}
          dispatchedQtyByPart={dispatchedQtyByPart}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  )
}

function PaymentBlock({
  pi,
  canPay,
  onDone,
}: {
  pi: VexPi
  canPay: boolean
  onDone: () => void
}) {
  const [bank, setBank] = useState('')
  const [tds, setTds] = useState('')
  const [mode, setMode] = useState<PaymentMode>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const total = useMemo(
    () => (parseFloat(bank) || 0) + (parseFloat(tds) || 0),
    [bank, tds],
  )

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vex/pi/${pi.id}/payment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          bankAmount: parseFloat(bank) || 0,
          tdsAmount: parseFloat(tds) || 0,
          mode,
          reference: reference.trim() || null,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Submit failed (${res.status})`)
      }
      setToast('Saved. Will reflect everywhere within ~5 minutes.')
      setBank('')
      setTds('')
      setReference('')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <h3 className="mb-3 font-heading text-sm font-semibold text-brand-navy">
        Log payment
      </h3>
      {!canPay ? (
        <p className="text-xs text-emerald-700">Fully paid. No further payment needed.</p>
      ) : (
        <>
          {toast ? (
            <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
              {toast}
            </div>
          ) : null}
          {error ? (
            <div className="mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800">
              {error}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Bank received (Rs)"
              value={bank}
              onChange={setBank}
              type="number"
            />
            <Field
              label="TDS deducted (Rs)"
              value={tds}
              onChange={setTds}
              type="number"
            />
            <label className="block">
              <span className="block text-xs text-muted-foreground">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
                aria-label="Payment mode"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Reference" value={reference} onChange={setReference} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Row total: <span className="tabular-nums text-foreground">{formatRs(total)}</span>
            {' / '}
            Open: <span className="tabular-nums text-foreground">{formatRs(Math.max(0, pi.total - pi.paymentReceivedAmount))}</span>
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={busy || total <= 0}
            className="mt-3 inline-flex min-h-10 items-center rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Log payment'}
          </button>
        </>
      )}
    </div>
  )
}

function DispatchBlock({
  pi,
  dispatchUnlocked,
  dispatchableValue,
  alreadyDispatchedValue,
  dispatchedQtyByPart,
  onDone,
}: {
  pi: VexPi
  dispatchUnlocked: boolean
  dispatchableValue: number
  alreadyDispatchedValue: number
  dispatchedQtyByPart: Record<string, number>
  onDone: () => void
}) {
  const [items, setItems] = useState<Record<string, string>>({})
  const [freight, setFreight] = useState(String(pi.freightCharges))
  const [mode, setMode] = useState<VexDispatchMode>('Surface')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const proposedValue = useMemo(() => {
    let s = 0
    for (const li of pi.lineItems) {
      const qty = parseFloat(items[li.partNumber] ?? '0') || 0
      if (qty > 0) s += qty * li.unitPrice
    }
    return s
  }, [items, pi.lineItems])

  async function submit() {
    setError(null)
    // Run the same gate the server runs so the user sees the friendly
    // error before the round-trip. The server is the authority; this
    // is a UX shortcut to catch obvious mistakes immediately.
    const proposedItems = pi.lineItems
      .map((li) => {
        const qty = parseFloat(items[li.partNumber] ?? '0') || 0
        const sent = dispatchedQtyByPart[li.partNumber] ?? 0
        return {
          partNumber: li.partNumber,
          qty,
          unitPriceRs: li.unitPrice,
          pendingQty: li.quantity - sent,
        }
      })
      .filter((p) => p.qty > 0)
    if (proposedItems.length === 0) {
      setError('Enter a dispatch quantity for at least one product.')
      return
    }
    const gateError = checkVexDispatchGate({
      paymentReceivedRs: pi.paymentReceivedAmount,
      alreadyDispatchedValueRs: alreadyDispatchedValue,
      proposedItems,
    })
    if (gateError) {
      setError(gateError)
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/operations/vex/pi/${pi.id}/dispatch/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: proposedItems.map((p) => ({ partNumber: p.partNumber, qty: p.qty })),
          freight: parseFloat(freight) || 0,
          mode,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Submit failed (${res.status})`)
      }
      setToast('Dispatch raised. Warehouse will be notified.')
      setItems({})
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <h3 className="mb-3 font-heading text-sm font-semibold text-brand-navy">
        Raise dispatch
      </h3>
      {!dispatchUnlocked ? (
        <p className="text-xs text-muted-foreground">
          {pi.paymentReceivedAmount === 0
            ? 'No payment received. Cannot dispatch.'
            : 'Already dispatched up to the value of payment received. Log additional payment to unlock more.'}
          {' '}Current status: {pi.status}.
        </p>
      ) : (
        <>
          <div className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            Received{' '}
            <span className="tabular-nums text-foreground">
              {formatRs(pi.paymentReceivedAmount)}
            </span>{' '}
            / Dispatched to date{' '}
            <span className="tabular-nums text-foreground">
              {formatRs(alreadyDispatchedValue)}
            </span>{' '}
            / Available for dispatch{' '}
            <span className="tabular-nums font-semibold text-foreground">
              {formatRs(dispatchableValue)}
            </span>
            {proposedValue > 0 ? (
              <>
                {' '}/ Proposed{' '}
                <span
                  className={
                    'tabular-nums font-semibold ' +
                    (proposedValue > dispatchableValue + 0.01
                      ? 'text-red-700'
                      : 'text-emerald-700')
                  }
                >
                  {formatRs(proposedValue)}
                </span>
              </>
            ) : null}
          </div>
          {toast ? (
            <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
              {toast}
            </div>
          ) : null}
          {error ? (
            <div className="mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800">
              {error}
            </div>
          ) : null}
          <div className="space-y-2 text-xs">
            {pi.lineItems.map((li) => {
              const sent = dispatchedQtyByPart[li.partNumber] ?? 0
              const pending = li.quantity - sent
              return (
                <label
                  key={li.partNumber}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-foreground">
                    {li.productName}{' '}
                    <span className="text-muted-foreground">({li.partNumber})</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      pending {pending}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={pending}
                    value={items[li.partNumber] ?? ''}
                    onChange={(e) =>
                      setItems((s) => ({ ...s, [li.partNumber]: e.target.value }))
                    }
                    aria-label={`Dispatch quantity for ${li.partNumber}`}
                    className="min-h-9 w-20 rounded-md border border-input bg-card px-2 py-1 text-right tabular-nums"
                  />
                </label>
              )
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Freight cost (Rs)"
              value={freight}
              onChange={setFreight}
              type="number"
            />
            <label className="block">
              <span className="block text-xs text-muted-foreground">
                Mode of dispatch
              </span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as VexDispatchMode)}
                className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1"
                aria-label="Mode of dispatch"
              >
                <option value="Surface">Surface</option>
                <option value="Air">Air</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 items-center rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:opacity-50"
          >
            {busy ? 'Submitting...' : 'Request dispatch'}
          </button>
        </>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground">{label}</span>
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
