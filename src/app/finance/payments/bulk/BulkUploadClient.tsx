'use client'

/*
 * BulkUploadClient (Gate 5A.6 Step 3).
 *
 * Two phases: upload (file picker + drag-drop) and review (table with
 * per-row School / MOU / Installment dropdowns + include checkbox +
 * validation errors). Both in one client component; the file payload
 * lives in memory and submits only after every included row has zero
 * validation errors.
 *
 * Limits: 5 MB file size, 500 rows hard-cap (warn at 400).
 * Dedupe: bank_ref appearing in payment_logs.json is flagged.
 */

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, FileText, Upload, X } from 'lucide-react'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { formatRs } from '@/lib/format'
import {
  matchSchool,
  parseBulkCsv,
  type ParsedRow,
  type MatchConfidence,
} from '@/lib/finance/bulkPaymentParser'

interface SchoolLite {
  id: string
  name: string
  city: string
  state: string
}

interface MouLite {
  id: string
  schoolId: string
  schoolName: string
  programme: string
  programmeSubType: string | null
  academicYear: string
}

interface InstallmentLite {
  id: string
  mouId: string
  instalmentLabel: string
  expectedAmount: number
  schoolId: string | null
}

interface Props {
  schools: SchoolLite[]
  mous: MouLite[]
  installments: InstallmentLite[]
  existingBankRefs: string[]
  disabled?: boolean
}

interface ReviewRow extends ParsedRow {
  schoolId: string
  matchConfidence: MatchConfidence
  mouId: string
  paymentId: string
  include: boolean
  duplicate: boolean
}

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ROW_HARD_CAP = 500
const ROW_WARN = 400

export function BulkUploadClient({
  schools,
  mous,
  installments,
  existingBankRefs,
  disabled,
}: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const existingRefSet = useMemo(
    () => new Set(existingBankRefs.map((r) => r.toUpperCase())),
    [existingBankRefs],
  )

  function handleFile(file: File) {
    setSubmitError(null)
    if (file.size > MAX_FILE_BYTES) {
      setParseErrors([`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; limit is 5 MB.`])
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseBulkCsv(text)
      if (parsed.headerErrors.length > 0) {
        setParseErrors(parsed.headerErrors)
        setRows([])
        setFileName(file.name)
        return
      }
      if (parsed.rows.length > ROW_HARD_CAP) {
        setParseErrors([
          `File has ${parsed.rows.length} rows; hard cap is ${ROW_HARD_CAP}. Trim before retrying.`,
        ])
        setRows([])
        setFileName(file.name)
        return
      }
      const reviewRows: ReviewRow[] = parsed.rows.map((r) => {
        const match = matchSchool(r.schoolHint, schools)
        const schoolId = match && match.confidence !== 'none' ? match.schoolId : ''
        return {
          ...r,
          schoolId,
          matchConfidence: match ? match.confidence : 'none',
          mouId: '',
          paymentId: '',
          include: true,
          duplicate:
            r.bankRef !== '' && existingRefSet.has(r.bankRef.toUpperCase()),
        }
      })
      setParseErrors([])
      setRows(reviewRows)
      setFileName(file.name)
    }
    reader.onerror = () => {
      setParseErrors(['Could not read the file. Try saving as CSV again.'])
    }
    reader.readAsText(file)
  }

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) => {
      const next = prev.slice()
      const current = next[idx]
      if (!current) return prev
      const merged: ReviewRow = { ...current, ...patch }
      // Selecting a school clears stale MOU / installment.
      if (patch.schoolId !== undefined && patch.schoolId !== current.schoolId) {
        merged.mouId = ''
        merged.paymentId = ''
      }
      if (patch.mouId !== undefined && patch.mouId !== current.mouId) {
        merged.paymentId = ''
      }
      next[idx] = merged
      return next
    })
  }

  const includedRows = rows.filter((r) => r.include)
  const blockingRows = includedRows.filter(
    (r) => r.errors.length > 0 || !r.schoolId || r.duplicate,
  )
  const canSubmit =
    !disabled
    && rows.length > 0
    && includedRows.length > 0
    && blockingRows.length === 0
    && !busy

  async function submit() {
    setSubmitError(null)
    setBusy(true)
    try {
      const payload = includedRows.map((r) => ({
        bankRef: r.bankRef,
        amount: r.amount,
        dateIso: r.dateIso,
        bankName: r.bankName,
        schoolId: r.schoolId,
        mouId: r.mouId || null,
        paymentId: r.paymentId || null,
        notes: r.notes,
      }))
      const res = await fetch('/api/finance/payment/bulk-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(body.message ?? body.error ?? `Import failed (${res.status})`)
      }
      const body = (await res.json()) as {
        imported: number
        matched: number
        parked: number
        skipped: number
      }
      const url =
        `/finance/payments?imported=${body.imported}` +
        `&matched=${body.matched}` +
        `&parked=${body.parked}` +
        `&skipped=${body.skipped}`
      router.push(url)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Import failed')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Upload"
        className="rounded-md border border-border bg-card p-4"
      >
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-sm font-semibold text-brand-navy">
            1. Upload CSV
          </h2>
          <Link
            href="/finance/payments/bulk/template"
            className="text-xs font-semibold text-brand-navy hover:underline"
          >
            Download template
          </Link>
        </header>
        <p className="mb-3 text-xs text-muted-foreground">
          Required columns: bank_ref, amount, date, bank_name, school_hint, notes. Amount accepts &lsquo;12,000&rsquo; / &lsquo;12000.50&rsquo; / &lsquo;Rs 12,000&rsquo;. Date accepts DD/MM/YYYY or YYYY-MM-DD. Max 5 MB, 500 rows.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id="bulk-file"
            type="file"
            accept=".csv,text/csv"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="block min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            data-testid="bulk-file-input"
            aria-label="Choose CSV file"
          />
          {fileName ? (
            <span className="text-xs text-muted-foreground">
              <FileText aria-hidden className="mr-1 inline size-3.5" />
              {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {parseErrors.length > 0 ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
          >
            {parseErrors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        ) : null}
        {rows.length >= ROW_WARN && rows.length <= ROW_HARD_CAP ? (
          <p
            role="status"
            className="mt-3 rounded-md border border-signal-attention bg-card p-2 text-xs text-foreground"
          >
            Heads-up: {rows.length} rows in this batch. The hard cap is {ROW_HARD_CAP}.
          </p>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section aria-label="Review" className="rounded-md border border-border bg-card p-4">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-heading text-sm font-semibold text-brand-navy">
              2. Review and confirm ({includedRows.length} included, {blockingRows.length} blocking)
            </h2>
            <span className="text-xs text-muted-foreground">
              Green tick = exact school match. Amber alert = fuzzy match (review). Red x = no match (pick manually).
            </span>
          </header>
          {submitError ? (
            <div
              role="alert"
              className="mb-3 rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {submitError}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium" aria-label="Include">In</th>
                  <th className="px-2 py-2 font-medium">Row</th>
                  <th className="px-2 py-2 font-medium">Bank ref</th>
                  <th className="px-2 py-2 font-medium text-right">Amount</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">School</th>
                  <th className="px-2 py-2 font-medium">MOU</th>
                  <th className="px-2 py-2 font-medium">Instalment</th>
                  <th className="px-2 py-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r, idx) => {
                  const mousForSchool = r.schoolId
                    ? mous.filter((m) => m.schoolId === r.schoolId)
                    : []
                  const installmentsForMou = r.mouId
                    ? installments.filter((i) => i.mouId === r.mouId)
                    : []
                  const issues: string[] = []
                  for (const e of r.errors) issues.push(e)
                  if (!r.schoolId) issues.push('Pick a school')
                  if (r.duplicate) issues.push('Bank ref already logged; would skip')
                  return (
                    <tr key={r.rowIndex}>
                      <td className="px-2 py-2">
                        <label className="sr-only" htmlFor={`row-include-${idx}`}>
                          Include row {r.rowIndex + 1}
                        </label>
                        <input
                          id={`row-include-${idx}`}
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(idx, { include: e.target.checked })}
                          className="size-4 rounded border-input"
                        />
                      </td>
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">{r.rowIndex + 1}</td>
                      <td className="px-2 py-2 font-mono text-xs">{r.bankRef || <span className="text-signal-alert">missing</span>}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.amount !== null ? formatRs(r.amount) : <span className="text-signal-alert">{r.amountRaw}</span>}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.dateIso ?? <span className="text-signal-alert">{r.dateRaw}</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceIcon confidence={r.matchConfidence} />
                          <select
                            value={r.schoolId}
                            onChange={(e) => updateRow(idx, { schoolId: e.target.value })}
                            className="min-h-9 max-w-[200px] rounded-md border border-input bg-card px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-brand-navy"
                            aria-label={`School for row ${r.rowIndex + 1}`}
                          >
                            <option value="">{r.schoolHint || 'Pick school'}</option>
                            {schools.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {r.schoolHint ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            hint: {r.schoolHint}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={r.mouId}
                          onChange={(e) => updateRow(idx, { mouId: e.target.value })}
                          disabled={!r.schoolId}
                          className="min-h-9 max-w-[180px] rounded-md border border-input bg-card px-1.5 py-1 text-xs"
                          aria-label={`MOU for row ${r.rowIndex + 1}`}
                        >
                          <option value="">{r.schoolId ? '(auto-match)' : 'pick school first'}</option>
                          {mousForSchool.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={r.paymentId}
                          onChange={(e) => updateRow(idx, { paymentId: e.target.value })}
                          disabled={!r.mouId}
                          className="min-h-9 max-w-[180px] rounded-md border border-input bg-card px-1.5 py-1 text-xs"
                          aria-label={`Installment for row ${r.rowIndex + 1}`}
                        >
                          <option value="">{r.mouId ? '(auto-match)' : 'pick MOU first'}</option>
                          {installmentsForMou.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.instalmentLabel} · {formatRs(i.expectedAmount)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-xs text-signal-alert">
                        {issues.length > 0 ? (
                          <ul className="space-y-0.5">
                            {issues.map((iss, j) => (
                              <li key={j}>{iss}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-signal-ok">ok</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className={opsButtonClass({ variant: 'action', size: 'md' })}
              data-testid="bulk-submit"
            >
              <Upload aria-hidden className="size-4" />
              {busy ? 'Importing...' : `Import ${includedRows.length} payment${includedRows.length === 1 ? '' : 's'}`}
            </button>
            <Link
              href="/finance/payments"
              className={opsButtonClass({ variant: 'outline', size: 'md' })}
            >
              Cancel
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ConfidenceIcon({ confidence }: { confidence: MatchConfidence }) {
  if (confidence === 'exact') {
    return (
      <span aria-label="Exact school match" title="Exact match" className="text-signal-ok">
        <Check aria-hidden className="size-4" />
      </span>
    )
  }
  if (confidence === 'high') {
    return (
      <span aria-label="Fuzzy school match: please review" title="Fuzzy match" className="text-signal-attention">
        <AlertCircle aria-hidden className="size-4" />
      </span>
    )
  }
  return (
    <span aria-label="No school match" title="No match" className="text-signal-alert">
      <X aria-hidden className="size-4" />
    </span>
  )
}
