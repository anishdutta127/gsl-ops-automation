'use client'

/*
 * W4-D.2 DispatchRequestForm (Sales-side).
 *
 * Client Component. Manages line-item array (flat / per-grade
 * discriminated union), MOU select, installment select, request
 * reason. Submits JSON to /api/dispatch-requests/create.
 *
 * Validation surfaces 8 rules from createRequest.ts (V1-V8). Hard
 * errors block; warnings render as a yellow banner but don't block.
 * Server response carries warnings on success too (the user sees
 * "Submitted with warnings: ..." rather than a blocking error).
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus } from 'lucide-react'

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'
interface MouOption {
  id: string
  schoolName: string
  programme: string
  programmeSubType: string | null
  totalInstallments: number
  hasIntake: boolean
  intakeGrades: string | null
  intakeRecipientName: string | null
  intakeRecipientEmail: string | null
}

interface FlatLineItem {
  kind: 'flat'
  skuName: string
  quantity: string  // string in form state; coerced on submit
}

interface PerGradeLineItem {
  kind: 'per-grade'
  skuName: string
  gradeAllocations: { grade: string; quantity: string }[]
}

type FormLineItem = FlatLineItem | PerGradeLineItem

const WARNING_LABELS: Record<string, string> = {
  'intake-not-completed': 'V3 Intake form not completed for this MOU',
  'kit-type-programme-mismatch': "V4 Line item SKU doesn't match the MOU's programme",
  'student-count-variance-high': 'V5 Total quantity differs more than 10% from intake/MOU baseline',
  'grade-out-of-intake-range': 'V6 Per-grade allocation falls outside the intake grade range',
  'duplicate-pending-request': 'V8 A pending dispatch request already exists for this MOU + installment',
  'stock-availability-warning': 'V9 One or more SKUs may be short of stock once pending requests are converted. Confirm with Ops at conversion.',
}

const ERROR_LABELS: Record<string, string> = {
  permission: 'You do not have permission to submit dispatch requests.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'Selected MOU not found.',
  'school-not-found': 'School record missing for this MOU.',
  'mou-not-active-cohort': 'V1 MOU is not in the active cohort. Submit blocked.',
  'mou-no-sales-owner': 'V2 MOU has no sales owner assigned. Submit blocked.',
  'invalid-line-items': 'Add at least one line item.',
  'invalid-installment-seq': 'Installment number must be a positive integer.',
  'missing-reason': 'Provide a request reason.',
  'server-error': 'Server returned an error. Try again or contact Ops.',
}

interface SubmitState {
  kind: 'idle' | 'submitting'
}

interface SubmitResult {
  status: 'success' | 'error'
  message: string
  warnings: string[]
  requestId?: string
}

export interface DispatchRequestFormProps {
  mouOptions: MouOption[]
  defaultMouId: string | null
}

export function DispatchRequestForm({ mouOptions, defaultMouId }: DispatchRequestFormProps) {
  const router = useRouter()
  const [mouId, setMouId] = useState<string>(defaultMouId ?? '')
  const [installmentSeq, setInstallmentSeq] = useState<string>('1')
  const [requestReason, setRequestReason] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { kind: 'flat', skuName: '', quantity: '' },
  ])
  const [state, setState] = useState<SubmitState>({ kind: 'idle' })
  const [result, setResult] = useState<SubmitResult | null>(null)

  const selectedMou = useMemo(
    () => mouOptions.find((m) => m.id === mouId) ?? null,
    [mouId, mouOptions],
  )

  const installmentOptions = useMemo(() => {
    const n = Math.max(1, selectedMou?.totalInstallments ?? 4)
    return Array.from({ length: n }, (_, i) => i + 1)
  }, [selectedMou])

  function updateItem(idx: number, next: FormLineItem) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? next : it)))
  }

  function removeItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function addFlatItem() {
    setLineItems((prev) => [...prev, { kind: 'flat', skuName: '', quantity: '' }])
  }

  function addPerGradeItem() {
    setLineItems((prev) => [
      ...prev,
      { kind: 'per-grade', skuName: '', gradeAllocations: [{ grade: '', quantity: '' }] },
    ])
  }

  function flipItemKind(idx: number) {
    setLineItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        if (it.kind === 'flat') {
          return {
            kind: 'per-grade',
            skuName: it.skuName,
            gradeAllocations: [{ grade: '', quantity: it.quantity }],
          }
        }
        const totalQ = it.gradeAllocations.reduce((s, a) => s + (Number(a.quantity) || 0), 0)
        return { kind: 'flat', skuName: it.skuName, quantity: String(totalQ || '') }
      }),
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)

    // Coerce form items to the lib's DispatchLineItem shape; drop empties.
    const coerced: Array<
      | { kind: 'flat'; skuName: string; quantity: number }
      | { kind: 'per-grade'; skuName: string; gradeAllocations: { grade: number; quantity: number }[] }
    > = []
    for (const it of lineItems) {
      const sku = it.skuName.trim()
      if (sku === '') continue
      if (it.kind === 'flat') {
        const qty = Number(it.quantity)
        if (!Number.isFinite(qty) || qty <= 0) continue
        coerced.push({ kind: 'flat', skuName: sku, quantity: qty })
      } else {
        const allocs: { grade: number; quantity: number }[] = []
        for (const a of it.gradeAllocations) {
          const g = Number(a.grade)
          const q = Number(a.quantity)
          if (Number.isInteger(g) && g > 0 && Number.isFinite(q) && q > 0) {
            allocs.push({ grade: g, quantity: q })
          }
        }
        if (allocs.length === 0) continue
        coerced.push({ kind: 'per-grade', skuName: sku, gradeAllocations: allocs })
      }
    }

    setState({ kind: 'submitting' })
    try {
      const res = await fetch('/api/dispatch-requests/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mouId,
          installmentSeq: Number(installmentSeq),
          requestReason,
          lineItems: coerced,
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      })
      const data = await res.json() as
        | { ok: true; requestId: string; warnings: string[] }
        | { ok: false; reason: string }
      if (!res.ok || data.ok === false) {
        const reason = (data as { ok: false; reason: string }).reason ?? 'server-error'
        setResult({
          status: 'error',
          message: ERROR_LABELS[reason] ?? `Failed: ${reason}`,
          warnings: [],
        })
        setState({ kind: 'idle' })
        return
      }
      setResult({
        status: 'success',
        message: `Submitted as ${data.requestId}.`,
        warnings: data.warnings,
        requestId: data.requestId,
      })
      setState({ kind: 'idle' })
      router.refresh()
    } catch (err) {
      setResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
        warnings: [],
      })
      setState({ kind: 'idle' })
    }
  }

  const isSubmitting = state.kind === 'submitting'
  const lineItemCount = lineItems.filter((it) => it.skuName.trim() !== '').length

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border bg-card p-4 sm:p-6">
      <div>
        <label htmlFor="mou-select" className={FIELD_LABEL_CLASS}>
          MOU (active cohort only)
        </label>
        <select
          id="mou-select"
          name="mouId"
          required
          value={mouId}
          onChange={(e) => setMouId(e.target.value)}
          className={FIELD_INPUT_CLASS}
        >
          <option value="">Select an MOU...</option>
          {mouOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} - {m.schoolName} ({m.programme}{m.programmeSubType ? '/' + m.programmeSubType : ''})
            </option>
          ))}
        </select>
      </div>

      {selectedMou ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-brand-navy">{selectedMou.schoolName}</p>
          <p className="text-muted-foreground">
            Programme: {selectedMou.programme}
            {selectedMou.programmeSubType ? ` / ${selectedMou.programmeSubType}` : ''}
          </p>
          {selectedMou.hasIntake ? (
            <p className="text-muted-foreground">
              Intake grades: {selectedMou.intakeGrades ?? 'not specified'}
              {selectedMou.intakeRecipientName ? ` · POC ${selectedMou.intakeRecipientName}` : ''}
            </p>
          ) : (
            <p className="text-signal-attention">Intake form not yet completed for this MOU.</p>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="installment-select" className={FIELD_LABEL_CLASS}>
            Installment number
          </label>
          <select
            id="installment-select"
            name="installmentSeq"
            required
            value={installmentSeq}
            onChange={(e) => setInstallmentSeq(e.target.value)}
            className={FIELD_INPUT_CLASS}
          >
            {installmentOptions.map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="request-reason" className={FIELD_LABEL_CLASS}>
            Request reason
          </label>
          <input
            id="request-reason"
            type="text"
            required
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="Pilot kickoff / post-payment / etc."
            className={FIELD_INPUT_CLASS}
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium text-brand-navy">
          Line items ({lineItemCount} non-empty)
        </legend>
        {lineItems.map((it, idx) => (
          <div key={idx} className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className={FIELD_LABEL_CLASS}>SKU name</label>
                <input
                  type="text"
                  value={it.skuName}
                  onChange={(e) => updateItem(idx, { ...it, skuName: e.target.value })}
                  placeholder={it.kind === 'flat' ? 'TWs Pampered Plant' : 'Cretile Grade-band kit'}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div className="w-32">
                <label className={FIELD_LABEL_CLASS}>Kind</label>
                <button
                  type="button"
                  onClick={() => flipItemKind(idx)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  {it.kind}
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                aria-label={`Remove line item ${idx + 1}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-signal-alert hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {it.kind === 'flat' ? (
              <div className="mt-2 w-40">
                <label className={FIELD_LABEL_CLASS}>Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { ...it, quantity: e.target.value })}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">Per-grade allocations</p>
                {it.gradeAllocations.map((a, ai) => (
                  <div key={ai} className="flex flex-wrap items-end gap-2">
                    <div className="w-24">
                      <label className={FIELD_LABEL_CLASS}>Grade</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={a.grade}
                        onChange={(e) => {
                          const next = [...it.gradeAllocations]
                          next[ai] = { ...next[ai]!, grade: e.target.value }
                          updateItem(idx, { ...it, gradeAllocations: next })
                        }}
                        className={FIELD_INPUT_CLASS}
                      />
                    </div>
                    <div className="w-32">
                      <label className={FIELD_LABEL_CLASS}>Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={a.quantity}
                        onChange={(e) => {
                          const next = [...it.gradeAllocations]
                          next[ai] = { ...next[ai]!, quantity: e.target.value }
                          updateItem(idx, { ...it, gradeAllocations: next })
                        }}
                        className={FIELD_INPUT_CLASS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = it.gradeAllocations.filter((_, i) => i !== ai)
                        updateItem(idx, {
                          ...it,
                          gradeAllocations: next.length === 0 ? [{ grade: '', quantity: '' }] : next,
                        })
                      }}
                      aria-label={`Remove allocation ${ai + 1}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateItem(idx, {
                      ...it,
                      gradeAllocations: [...it.gradeAllocations, { grade: '', quantity: '' }],
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <Plus size={14} /> Add grade allocation
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={addFlatItem}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <Plus size={14} /> Add flat line
          </button>
          <button
            type="button"
            onClick={addPerGradeItem}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <Plus size={14} /> Add per-grade line
          </button>
        </div>
      </fieldset>

      <div>
        <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
          Notes (optional)
        </label>
        <textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={FIELD_INPUT_CLASS}
        />
      </div>

      {result ? (
        <div
          role={result.status === 'error' ? 'alert' : 'status'}
          className={
            result.status === 'error'
              ? 'rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert'
              : 'rounded-md border border-signal-ok bg-signal-ok/10 px-3 py-2 text-sm text-signal-ok'
          }
        >
          {result.message}
          {result.warnings.length > 0 ? (
            <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
              {result.warnings.map((w) => (
                <li key={w}>{WARNING_LABELS[w] ?? w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 border-t border-border pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit dispatch request'}
        </button>
      </div>
    </form>
  )
}
