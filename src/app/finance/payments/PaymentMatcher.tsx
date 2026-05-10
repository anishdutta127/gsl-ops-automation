'use client'

/*
 * PaymentMatcher (Gate 2 Step 6).
 *
 * Mirrors gsl-mou-system's ReconcileForm semantics. Operator enters
 * amount + date + bank reference + tolerance; the migrated
 * `mouSystem/reconcile.ts findCandidates` returns ranked PI candidates.
 * Click a candidate -> Confirm match -> JSON POST to
 * /api/finance/payments/confirm-match. Or click "Park as unmatched" to
 * queue the entry for later reconciliation.
 *
 * Field order, copy, and validation messages match gsl-mou-system's
 * ReconcileForm + PaymentLogForm verbatim per the muscle-memory
 * promise.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import type { MOU, Payment, PaymentMode } from '@/lib/types'
import type {
  MOU as MouSystemMOU,
  Payment as MouSystemPayment,
} from '@/lib/mouSystem/types'
import {
  findCandidates,
  type CandidateResult,
  type CandidateVariant,
} from '@/lib/mouSystem/reconcile'
import { formatRs } from '@/lib/format'

interface Props {
  payments: Payment[]
  mous: MOU[]
  prefill?: {
    amount: string
    date: string
    reference: string
    narration: string
  }
}

const MODES: PaymentMode[] = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const VARIANT_LABEL: Record<CandidateVariant, string> = {
  full: 'full',
  after_tds_2: 'after 2% TDS',
  after_tds_10: 'after 10% TDS',
  rounded_10: 'cheque rounded',
  rounded_100: 'cheque rounded',
  after_tds_2_rounded_10: 'after 2% TDS, cheque rounded',
  after_tds_2_rounded_100: 'after 2% TDS, cheque rounded',
  after_tds_10_rounded_10: 'after 10% TDS, cheque rounded',
  after_tds_10_rounded_100: 'after 10% TDS, cheque rounded',
  combined: 'combined PI sum',
}

export function PaymentMatcher({ payments, mous, prefill }: Props) {
  const router = useRouter()
  const [amountRaw, setAmountRaw] = useState(prefill?.amount ?? '')
  const [receivedDate, setReceivedDate] = useState(prefill?.date ?? todayIso())
  const [bankReference, setBankReference] = useState(prefill?.reference ?? '')
  const [narration, setNarration] = useState(prefill?.narration ?? '')
  const [tolerance, setTolerance] = useState(1)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Bank Transfer')

  const amount = useMemo(() => {
    const n = parseFloat(amountRaw.replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [amountRaw])

  const candidates: CandidateResult[] = useMemo(() => {
    if (!amount) return []
    // The two type universes (Ops vs mouSystem) diverge on
    // AuditAction enum membership: Ops carries more lifecycle
    // actions. findCandidates does not read auditLog so the cast at
    // the call boundary is safe.
    return findCandidates(
      {
        receivedAmount: amount,
        receivedDate,
        bankReference: bankReference || narration || undefined,
        tolerance,
      },
      payments as unknown as MouSystemPayment[],
      mous as unknown as MouSystemMOU[],
      5,
    )
  }, [amount, receivedDate, bankReference, narration, tolerance, payments, mous])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function confirm(candidate: CandidateResult) {
    if (candidate.kind !== 'single') {
      setError(
        'Combined-PI matches are advisory only. Confirm each instalment separately by entering its own bank entry.',
      )
      return
    }
    if (!amount) {
      setError('Enter the bank amount before confirming.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/payments/confirm-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          paymentId: candidate.payment.id,
          receivedDate,
          receivedAmount: amount,
          paymentMode,
          bankReference: bankReference.trim() || null,
          narration: narration.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setToast('Saved. Will reflect everywhere within ~5 minutes.')
      setAmountRaw('')
      setBankReference('')
      setNarration('')
      router.refresh()
      setTimeout(() => setToast(null), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function park() {
    if (!amount) {
      setError('Enter an amount before parking as unmatched.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/payments/park-unmatched', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: receivedDate,
          amount,
          mode: paymentMode,
          reference: bankReference.trim() || null,
          narration: narration.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setToast('Parked. Will reflect under unmatched within ~5 minutes.')
      setAmountRaw('')
      setBankReference('')
      setNarration('')
      router.refresh()
      setTimeout(() => setToast(null), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form
        className="space-y-4 rounded-md border border-border bg-card p-5"
        onSubmit={(e) => e.preventDefault()}
      >
        {toast ? (
          <div
            role="status"
            className="rounded-md border border-signal-ok/40 bg-signal-ok/10 px-3 py-2 text-sm text-signal-ok"
          >
            {toast}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-signal-alert/40 bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
          >
            {error}
          </div>
        ) : null}

        <Field label="Amount received" hint="What hit the bank, in rupees">
          <div className="flex items-center rounded-md border border-input bg-card focus-within:border-brand-navy focus-within:ring-2 focus-within:ring-brand-navy/20">
            <span className="border-r border-input px-3 py-2 text-sm font-medium text-muted-foreground">
              Rs
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="4,12,262.50"
              className="w-full rounded-r-md bg-transparent px-3 py-2 text-base font-semibold text-brand-navy tabular-nums focus:outline-none"
              aria-label="Amount received in rupees"
              autoFocus
            />
          </div>
        </Field>

        <Field label="Date received">
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
            aria-label="Date received"
          />
        </Field>

        <Field label="Payment mode">
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
            aria-label="Payment mode"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Bank reference (UTR, cheque no.)"
          hint="Paste exactly what the bank statement shows."
        >
          <input
            type="text"
            value={bankReference}
            onChange={(e) => setBankReference(e.target.value)}
            placeholder="HDFCXYZ123456"
            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-brand-navy placeholder:text-muted-foreground focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
            aria-label="Bank reference"
          />
        </Field>

        <Field
          label="Bank narration"
          hint="School-name fragments and PI numbers boost the match."
        >
          <input
            type="text"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="NEFT-HDFC0000123-ACME SCHOOL TRUST"
            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-brand-navy placeholder:text-muted-foreground focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
            aria-label="Bank narration"
          />
        </Field>

        <Field label={`Tolerance: Rs ${tolerance}`} hint="How close the maths needs to be">
          <input
            type="range"
            min={1}
            max={1000}
            step={1}
            value={tolerance}
            onChange={(e) => setTolerance(parseInt(e.target.value, 10))}
            className="w-full accent-violet-500"
            aria-label="Match tolerance in rupees"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>Rs 1 (strict)</span>
            <span>Rs 1,000 (loose)</span>
          </div>
        </Field>

        <div className="rounded-md bg-violet-50 p-3 text-xs text-violet-900">
          We check four expected-amount variants per PI: full, after 2% TDS (Sec 194C), after 10% TDS (Sec 194J), and cheque-rounded. We also try sums of two PIs from the same school.
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => void park()}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-brand-navy hover:bg-muted disabled:opacity-50"
          >
            Park as unmatched
          </button>
        </div>
      </form>

      <section aria-label="Candidate matches">
        {!amount ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card p-6 text-center">
            <Search aria-hidden size={32} className="text-muted-foreground" />
            <p className="font-heading text-sm font-semibold text-brand-navy">
              Enter an amount to start matching
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Type the rupee amount that hit the bank. Results appear as you type. Add the date and the bank narration for tighter ranking.
            </p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card p-6 text-center">
            <Search aria-hidden size={32} className="text-muted-foreground" />
            <p className="font-heading text-sm font-semibold text-brand-navy">
              No candidates within tolerance
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Nothing matches Rs {amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} within Rs {tolerance}. Try widening the tolerance, double-check the date, or paste the bank narration to help us narrow it down.
            </p>
            <button
              type="button"
              onClick={() => void park()}
              disabled={busy}
              className="mt-2 inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-muted disabled:opacity-50"
            >
              Park as unmatched
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                Top {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">ranked by confidence</span>
            </div>
            <ul className="space-y-3">
              {candidates.map((c, i) => (
                <li key={candidateKey(c, i)}>
                  <CandidateCard
                    candidate={c}
                    rank={i + 1}
                    busy={busy}
                    onConfirm={() => void confirm(c)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function CandidateCard({
  candidate,
  rank,
  busy,
  onConfirm,
}: {
  candidate: CandidateResult
  rank: number
  busy: boolean
  onConfirm: () => void
}) {
  const isCombined = candidate.kind === 'combined'
  const confidencePct = Math.round(candidate.confidence * 100)
  return (
    <article
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`payment-candidate-${rank}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            #{rank}
          </span>
          {isCombined ? (
            <>
              <span className="font-mono text-sm font-semibold text-brand-navy">
                {candidate.primary.piNumber ?? candidate.primary.id}
              </span>
              <span className="text-xs text-muted-foreground">+</span>
              <span className="font-mono text-sm font-semibold text-brand-navy">
                {candidate.secondary.piNumber ?? candidate.secondary.id}
              </span>
            </>
          ) : (
            <span className="font-mono text-sm font-semibold text-brand-navy">
              {candidate.payment.piNumber ?? candidate.payment.id}
            </span>
          )}
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-sm text-brand-navy">
            {isCombined
              ? candidate.mou?.schoolName ?? '(unknown school)'
              : candidate.mou?.schoolName ?? candidate.payment.schoolName}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Expected {formatRs(candidate.expectedAmount)}
          {' · '}
          diff Rs {candidate.diff.toLocaleString('en-IN')}
          {' · '}
          {Number.isFinite(candidate.daysApart)
            ? `${candidate.daysApart} day${candidate.daysApart === 1 ? '' : 's'} from due`
            : 'no due date'}
          {' · '}
          variant: {VARIANT_LABEL[candidate.variant]}
        </p>
        <p className="mt-1 text-xs italic text-muted-foreground">
          {candidate.rationale}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Confidence
          </p>
          <p className="font-heading text-lg font-bold text-brand-navy">
            {confidencePct}%
          </p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || isCombined}
          className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {isCombined ? 'Advisory' : 'Confirm match'}
        </button>
      </div>
    </article>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-brand-navy">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function candidateKey(c: CandidateResult, i: number): string {
  if (c.kind === 'single') return `${c.payment.id}-${c.variant}-${i}`
  return `${c.primary.id}+${c.secondary.id}-${i}`
}
