/*
 * Schedule editor client form (Gate 5A.6 Step 1).
 *
 * Two modes:
 *   - Unlocked: rows freely editable, add/remove buttons enabled.
 *   - Locked: row count fixed; override reason required; rows show
 *     a lock chip for PI-issued instalments.
 */

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Lock } from 'lucide-react'
import type { PaymentStatus } from '@/lib/types'
import { formatRs } from '@/lib/format'

interface EditableRow {
  paymentId: string | null
  pctDue: number
  dueDateIso: string | null
  notes: string | null
  piNumber: string | null
  piSentDate: string | null
  status: PaymentStatus | null
  expectedAmount: number
  receivedAmount: number | null
}

export interface ScheduleEditorFormProps {
  mouId: string
  contractValue: number
  installments: EditableRow[]
  isLocked: boolean
  canSaveNoPi: boolean
  canOverride: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const FIELD_LABEL_CLASS = 'block text-xs font-medium text-brand-navy mb-0.5'
const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

export function ScheduleEditorForm({
  mouId,
  contractValue,
  installments,
  isLocked,
  canSaveNoPi,
  canOverride,
}: ScheduleEditorFormProps) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    installments.length > 0
      ? installments
      : [
          {
            paymentId: null,
            pctDue: 100,
            dueDateIso: null,
            notes: null,
            piNumber: null,
            piSentDate: null,
            status: null,
            expectedAmount: contractValue,
            receivedAmount: null,
          },
        ],
  )
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const pctTotal = useMemo(() => round2(rows.reduce((s, r) => s + (r.pctDue || 0), 0)), [rows])
  const pctOk = pctTotal >= 99.5 && pctTotal <= 100.5

  const addRow = () => {
    setRows((rs) => [
      ...rs,
      {
        paymentId: null,
        pctDue: 0,
        dueDateIso: null,
        notes: null,
        piNumber: null,
        piSentDate: null,
        status: null,
        expectedAmount: 0,
        receivedAmount: null,
      },
    ])
  }

  const removeRow = (idx: number) => {
    setRows((rs) => rs.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, patch: Partial<EditableRow>) => {
    setRows((rs) =>
      rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    )
  }

  const canSubmitNoPi = !isLocked && canSaveNoPi && pctOk && rows.length > 0
  const canSubmitOverride =
    isLocked && canOverride && pctOk && rows.length === installments.length && overrideReason.trim().length >= 10

  return (
    <form
      method="POST"
      action={`/api/mou/${mouId}/schedule/save`}
      className="space-y-4"
      data-testid="schedule-editor-form"
    >
      <input
        type="hidden"
        name="mode"
        value={isLocked ? 'override' : 'no-pi'}
      />
      <input type="hidden" name="rows" value={JSON.stringify(rows.map((r) => ({
        paymentId: r.paymentId,
        pctDue: r.pctDue,
        dueDateIso: r.dueDateIso,
        notes: r.notes,
      })))} />
      {isLocked ? (
        <input type="hidden" name="reason" value={overrideReason} />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">% Due</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">Due date</th>
              <th className="px-3 py-2.5 font-medium">Notes</th>
              <th className="px-3 py-2.5 font-medium">State</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => {
              const amount = round2((contractValue * (row.pctDue || 0)) / 100)
              const rowLocked =
                row.piNumber !== null || row.piSentDate !== null
              return (
                <tr key={`${row.paymentId ?? 'new'}-${idx}`} className="align-top">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <label htmlFor={`pct-${idx}`} className="sr-only">
                      Percentage for instalment {idx + 1}
                    </label>
                    <input
                      id={`pct-${idx}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={row.pctDue}
                      onChange={(e) =>
                        updateRow(idx, { pctDue: Number(e.target.value) })
                      }
                      className={FIELD_INPUT_CLASS + ' w-20 tabular-nums'}
                      data-testid={`pct-input-${idx}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatRs(amount)}
                  </td>
                  <td className="px-3 py-2">
                    <label htmlFor={`due-${idx}`} className="sr-only">
                      Due date for instalment {idx + 1}
                    </label>
                    <input
                      id={`due-${idx}`}
                      type="date"
                      value={row.dueDateIso ?? ''}
                      onChange={(e) =>
                        updateRow(idx, {
                          dueDateIso: e.target.value === '' ? null : e.target.value,
                        })
                      }
                      className={FIELD_INPUT_CLASS}
                      data-testid={`due-input-${idx}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label htmlFor={`notes-${idx}`} className="sr-only">
                      Notes for instalment {idx + 1}
                    </label>
                    <input
                      id={`notes-${idx}`}
                      type="text"
                      value={row.notes ?? ''}
                      onChange={(e) =>
                        updateRow(idx, {
                          notes: e.target.value === '' ? null : e.target.value,
                        })
                      }
                      placeholder="Optional"
                      className={FIELD_INPUT_CLASS}
                      data-testid={`notes-input-${idx}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {rowLocked ? (
                      <span className="inline-flex items-center gap-1 text-signal-attention">
                        <Lock aria-hidden className="size-3" />
                        {row.piNumber ?? 'PI sent'}
                      </span>
                    ) : (
                      row.status ?? 'New'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!isLocked ? (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length <= 1}
                        title="Remove instalment"
                        aria-label={`Remove instalment ${idx + 1}`}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-card p-1.5 text-foreground hover:border-signal-alert hover:text-signal-alert disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        data-testid={`remove-row-${idx}`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-muted/40">
              <td className="px-3 py-2 font-medium text-muted-foreground" colSpan={1}>
                Total
              </td>
              <td className="px-3 py-2">
                <span
                  className={
                    'inline-flex items-center gap-1 tabular-nums ' +
                    (pctOk ? 'text-foreground' : 'text-signal-alert')
                  }
                  data-testid="pct-total"
                >
                  {pctTotal}%
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRs(round2((contractValue * pctTotal) / 100))}
              </td>
              <td className="px-3 py-2" colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isLocked ? (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            data-testid="add-row-button"
          >
            <Plus aria-hidden className="size-4" /> Add instalment row
          </button>
        ) : null}

        {!pctOk ? (
          <span
            role="status"
            data-testid="pct-warning"
            className="text-xs text-signal-alert"
          >
            Total must equal 100% (current: {pctTotal}%).
          </span>
        ) : null}
      </div>

      {isLocked ? (
        <div className="rounded-lg border border-signal-attention bg-card p-4 space-y-3" data-testid="override-block">
          <div>
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Override locked schedule
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              At least one PI is already issued. Re-allocating percentages will
              preserve issued PI amounts and create adjustment entries against
              the next unlocked instalment. Add or remove rows is disabled in
              override mode.
            </p>
          </div>
          <div>
            <label htmlFor="overrideReason" className={FIELD_LABEL_CLASS}>
              Reason for override (required, min 10 characters)
            </label>
            <textarea
              id="overrideReason"
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g., School requested 30/30/40 split after PI-1 paid for May fee revision."
              className={FIELD_INPUT_CLASS}
              data-testid="override-reason-input"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {!showOverrideConfirm ? (
              <button
                type="button"
                onClick={() => setShowOverrideConfirm(true)}
                disabled={!canOverride || overrideReason.trim().length < 10 || !pctOk}
                className="inline-flex min-h-11 items-center rounded-md bg-signal-attention px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                data-testid="override-trigger-button"
              >
                Override and continue
              </button>
            ) : (
              <>
                <p
                  role="alert"
                  className="w-full rounded-md border border-signal-alert bg-card p-3 text-sm text-foreground"
                  data-testid="override-confirm-banner"
                >
                  Save will preserve issued PI amounts and create adjustment
                  entries for any re-priced locked rows. Continue?
                </p>
                <button
                  type="submit"
                  disabled={!canSubmitOverride}
                  className="inline-flex min-h-11 items-center rounded-md bg-signal-alert px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="override-submit-button"
                >
                  Save override
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverrideConfirm(false)}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="submit"
            disabled={!canSubmitNoPi}
            className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            data-testid="save-schedule-button"
          >
            Save schedule
          </button>
          <Link
            href={`/mous/${mouId}/installments`}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            Cancel
          </Link>
        </div>
      )}
    </form>
  )
}
