'use client'

/*
 * LogBatchForm. Client component: per-row bank + TDS inputs over a
 * fixed list of outstanding instalments for one school. POSTs to
 * /api/finance/payment/log-batch and surfaces the per-row outcomes.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatRs, formatDate } from '@/lib/format'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { suggestMatches } from '@/lib/payment/matchSuggestion'
import type { PaymentLog } from '@/lib/types'

export interface SchoolLite {
  id: string
  name: string
  city: string
  state: string
}

export interface BatchInstallmentLite {
  paymentId: string
  mouId: string
  mouLabel: string
  instalmentLabel: string
  instalmentSeq: number
  dueDateIso: string | null
  dueDateDisplay: string
  expectedAmount: number
  receivedAmount: number
  balanceDue: number
  status: string
}

export interface UnmatchedLogLite {
  id: string
  date: string
  amount: number
  reference: string | null
  narration: string | null
}

interface Props {
  school: SchoolLite
  installments: BatchInstallmentLite[]
  totalsForHeader: { totalExpected: number; totalBalance: number }
  mousCount: number
  defaultReceivedDate: string
  userName: string
  unmatchedLogs: UnmatchedLogLite[]
}

const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'DD', 'UPI', 'Other'] as const

interface RowState {
  paymentId: string
  bankInput: string
  tdsInput: string
}

interface Outcome {
  ok: boolean
  paymentId: string
  receivedAmount?: number
  bankAmount?: number
  tdsAmount?: number
  reason?: string
}

export function LogBatchForm({
  school,
  installments,
  totalsForHeader,
  mousCount,
  defaultReceivedDate,
  unmatchedLogs,
}: Props) {
  const router = useRouter()
  const [receivedDate, setReceivedDate] = useState(defaultReceivedDate)
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>('Bank Transfer')
  const [bankReference, setBankReference] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<RowState[]>(() =>
    installments.map((p) => ({ paymentId: p.paymentId, bankInput: '', tdsInput: '' })),
  )
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Outcome[] | null>(null)

  const totals = useMemo(() => {
    let bank = 0
    let tds = 0
    let filled = 0
    for (const r of rows) {
      const b = parseFloat(r.bankInput) || 0
      const t = parseFloat(r.tdsInput) || 0
      if (b + t > 0) filled += 1
      bank += b
      tds += t
    }
    return { bank, tds, total: bank + tds, filled }
  }, [rows])

  // Phase 4 Step 5: bank-statement match suggestion. Recompute on every
  // bank-amount change so the banner reflects the live total. Mapped
  // back into the PaymentLog shape suggestMatches expects.
  const suggestions = useMemo(() => {
    if (totals.bank <= 0) return []
    const candidates: PaymentLog[] = unmatchedLogs.map((p) => ({
      id: p.id,
      date: p.date,
      amount: p.amount,
      mode: 'Bank Transfer',
      reference: p.reference,
      narration: p.narration,
      salesPersonId: null,
      matchedInstallmentIds: [],
      unmatched: true,
      loggedBy: '',
      loggedAt: p.date,
      notes: null,
    }))
    return suggestMatches({
      totalBankAmount: totals.bank,
      bankReference: bankReference.trim() || null,
      receivedDate,
      candidates,
    })
  }, [totals.bank, unmatchedLogs, bankReference, receivedDate])

  function updateRow(paymentId: string, patch: Partial<RowState>) {
    setRows((r) => r.map((row) => (row.paymentId === paymentId ? { ...row, ...patch } : row)))
  }

  function validate(): string | null {
    if (totals.filled === 0) {
      return 'Fill bank or TDS for at least one instalment.'
    }
    if (!bankReference.trim()) {
      return 'Bank reference is required. Add a UTR / cheque number / receipt number.'
    }
    // Per-row warnings (non-blocking): TDS-only rows and overpayments.
    return null
  }

  function rowWarning(row: BatchInstallmentLite, state: RowState): string | null {
    const bank = parseFloat(state.bankInput) || 0
    const tds = parseFloat(state.tdsInput) || 0
    const total = bank + tds
    if (total === 0) return null
    if (bank === 0 && tds > 0) return 'TDS only with no bank (likely wrong)'
    if (total > row.balanceDue + 1) {
      return `Overpayment: Rs ${(total - row.balanceDue).toLocaleString('en-IN')} above balance`
    }
    return null
  }

  async function submit() {
    setError(null)
    setResults(null)
    const blockingMessage = validate()
    if (blockingMessage) {
      setError(blockingMessage)
      return
    }
    setBusy(true)
    try {
      const payloadRows = rows
        .map((r) => ({
          paymentId: r.paymentId,
          bankAmount: parseFloat(r.bankInput) || 0,
          tdsAmount: parseFloat(r.tdsInput) || 0,
        }))
        .filter((r) => r.bankAmount + r.tdsAmount > 0)
      const res = await fetch('/api/finance/payment/log-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          receivedDate,
          paymentMode,
          bankReference: bankReference.trim() || null,
          notes: notes.trim() || null,
          rows: payloadRows,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(b.message ?? b.error ?? `Submit failed (${res.status})`)
      }
      const json = (await res.json()) as {
        okCount: number
        failCount: number
        outcomes: Outcome[]
      }
      setResults(json.outcomes)
      if (json.failCount === 0) {
        setWarning(
          `${json.okCount} payment${json.okCount === 1 ? '' : 's'} logged for ${school.name}. Will reflect everywhere within ~5 minutes.`,
        )
        setTimeout(() => {
          router.push(`/finance/payments?logged-batch=${encodeURIComponent(school.id)}`)
        }, 1200)
      } else {
        setError(`${json.failCount} of ${json.outcomes.length} rows failed. See per-row status below.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-lg border border-border bg-card p-5"
      data-testid="log-batch-form"
    >
      <header className="mb-4 flex flex-wrap items-baseline gap-2 border-b border-border pb-3">
        <h2 className="font-heading text-lg font-semibold text-brand-navy">
          {school.name}
        </h2>
        <span className="text-xs text-muted-foreground">
          {school.city}, {school.state} {'·'} {mousCount} active MOU{mousCount === 1 ? '' : 's'}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Total expected: {formatRs(totalsForHeader.totalExpected)} {'·'} outstanding: {formatRs(totalsForHeader.totalBalance)}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment date
          </span>
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            required
            className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            data-testid="batch-received-date"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment mode
          </span>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as (typeof PAYMENT_MODES)[number])}
            className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            data-testid="batch-payment-mode"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bank reference (UTR / cheque #)
          </span>
          <input
            type="text"
            value={bankReference}
            onChange={(e) => setBankReference(e.target.value)}
            placeholder="UTR-2026-05-19-...."
            className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            data-testid="batch-bank-reference"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          data-testid="batch-notes"
        />
      </label>

      <div className="mt-5 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Instalment</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium text-right">Expected</th>
              <th className="px-3 py-2 font-medium text-right">Already paid</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
              <th className="px-3 py-2 font-medium text-right">Bank now</th>
              <th className="px-3 py-2 font-medium text-right">TDS now</th>
              <th className="px-3 py-2 font-medium text-right">Row total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {installments.map((p) => {
              const row = rows.find((r) => r.paymentId === p.paymentId)!
              const bank = parseFloat(row.bankInput) || 0
              const tds = parseFloat(row.tdsInput) || 0
              const total = bank + tds
              const w = rowWarning(p, row)
              const outcome = results?.find((o) => o.paymentId === p.paymentId)
              return (
                <tr key={p.paymentId} className="align-top">
                  <td className="px-3 py-2">
                    <span className="font-medium">{p.instalmentLabel}</span>
                    <span className="ml-1 block font-mono text-[11px] text-muted-foreground">
                      {p.mouLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {p.dueDateDisplay}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRs(p.expectedAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {p.receivedAmount > 0 ? formatRs(p.receivedAmount) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatRs(p.balanceDue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.bankInput}
                      onChange={(e) => updateRow(p.paymentId, { bankInput: e.target.value })}
                      className="w-28 rounded-md border border-input bg-card px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      data-testid={`batch-bank-${p.paymentId}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.tdsInput}
                      onChange={(e) => updateRow(p.paymentId, { tdsInput: e.target.value })}
                      className="w-24 rounded-md border border-input bg-card px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      data-testid={`batch-tds-${p.paymentId}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid={`batch-row-total-${p.paymentId}`}>
                    {total > 0 ? formatRs(total) : '-'}
                    {w ? (
                      <span className="ml-1 block text-[10px] text-amber-700" data-testid={`batch-row-warning-${p.paymentId}`}>
                        {w}
                      </span>
                    ) : null}
                    {outcome ? (
                      <span
                        data-testid={`batch-row-outcome-${p.paymentId}`}
                        data-ok={outcome.ok ? 'true' : 'false'}
                        className={`ml-1 block text-[10px] ${outcome.ok ? 'text-emerald-700' : 'text-red-700'}`}
                      >
                        {outcome.ok ? 'Logged' : `Failed: ${outcome.reason}`}
                      </span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {installments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No outstanding instalments for this school.
                </td>
              </tr>
            ) : null}
          </tbody>
          {installments.length > 0 ? (
            <tfoot className="border-t border-border bg-muted text-[12px] font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  Totals ({totals.filled} row{totals.filled === 1 ? '' : 's'} filled)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatRs(totalsForHeader.totalBalance)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="batch-total-bank">
                  {formatRs(totals.bank)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="batch-total-tds">
                  {formatRs(totals.tds)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" data-testid="batch-total-credit">
                  {formatRs(totals.total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {suggestions.length > 0 ? (
        <div
          role="status"
          data-testid="batch-match-suggestion"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Possibly the same money as {suggestions.length === 1 ? 'an' : suggestions.length}{' '}
            unmatched bank entr{suggestions.length === 1 ? 'y' : 'ies'} we already have:
          </p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {suggestions.map((s) => (
              <li key={s.paymentLog.id} data-testid={`batch-match-suggestion-${s.paymentLog.id}`}>
                <span className="font-mono">{s.paymentLog.id}</span>
                {' · '}
                {formatRs(s.paymentLog.amount)}
                {' on '}
                {formatDate(s.paymentLog.date)}
                {s.paymentLog.reference ? ` · ref ${s.paymentLog.reference}` : ''}
                {' · '}
                <span className="text-amber-700">{s.reason}</span>
                {' · '}
                <Link
                  href={`/finance/payments/unmatched?highlight=${encodeURIComponent(s.paymentLog.id)}`}
                  className="underline-offset-2 hover:underline"
                  data-testid={`batch-match-suggestion-link-${s.paymentLog.id}`}
                >
                  View unmatched {'→'}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-amber-800">
            Saving the batch does NOT automatically link to these entries; mark them matched manually
            from /finance/payments/unmatched if they refer to the same transfer.
          </p>
        </div>
      ) : null}

      {warning ? (
        <div
          className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          data-testid="batch-success-toast"
        >
          {warning}
        </div>
      ) : null}
      {error ? (
        <div
          className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          data-testid="batch-error"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={busy || installments.length === 0}
          onClick={() => void submit()}
          className={opsButtonClass({ variant: 'primary', size: 'md' })}
          data-testid="batch-submit"
        >
          {busy ? 'Saving…' : `Save payments (${totals.filled} row${totals.filled === 1 ? '' : 's'})`}
        </button>
        <Link
          href="/finance/payments"
          className={opsButtonClass({ variant: 'outline', size: 'md' })}
        >
          Cancel
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          Total to credit: <span className="font-semibold text-brand-navy">{formatRs(totals.total)}</span>{' '}
          (Bank {formatRs(totals.bank)} + TDS {formatRs(totals.tds)})
        </span>
      </div>
    </section>
  )
}
