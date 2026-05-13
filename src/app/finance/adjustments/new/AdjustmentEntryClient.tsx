/*
 * Manual adjustment entry client form (Gate 5A.6 Step 5).
 *
 * MOU + Installment autocomplete-style dropdowns; the Installment list
 * is filtered to the selected MOU. Amount is a free signed number
 * (positive = additional charge, negative = credit to school).
 */

'use client'

import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { formatRs } from '@/lib/format'

interface MouOption {
  id: string
  schoolName: string
  programme: string
  contractValue: number
  schoolId: string
}

interface InstallmentOption {
  id: string
  mouId: string
  label: string
  expectedAmount: number
  status: string
  isLocked: boolean
  seq: number
}

interface AdjustmentTypeOption {
  key: string
  label: string
}

export interface AdjustmentEntryClientProps {
  mouOptions: MouOption[]
  installmentOptionsByMou: Record<string, InstallmentOption[]>
  adjustmentTypes: AdjustmentTypeOption[]
  preselectMouId: string | null
}

const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'
const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AdjustmentEntryClient({
  mouOptions,
  installmentOptionsByMou,
  adjustmentTypes,
  preselectMouId,
}: AdjustmentEntryClientProps) {
  const [mouId, setMouId] = useState<string>(preselectMouId ?? '')
  const [installmentId, setInstallmentId] = useState<string>('')
  const [adjustmentType, setAdjustmentType] = useState<string>(adjustmentTypes[0]!.key)
  const [amount, setAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [effectiveDate, setEffectiveDate] = useState<string>(today())
  const [notes, setNotes] = useState<string>('')
  const [mouSearch, setMouSearch] = useState<string>('')

  const filteredMous = useMemo(() => {
    const term = mouSearch.trim().toLowerCase()
    if (term === '') return mouOptions.slice(0, 100)
    return mouOptions.filter(
      (m) =>
        m.schoolName.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term),
    ).slice(0, 100)
  }, [mouOptions, mouSearch])

  const installmentsForMou = useMemo<InstallmentOption[]>(
    () => (mouId !== '' ? installmentOptionsByMou[mouId] ?? [] : []),
    [installmentOptionsByMou, mouId],
  )

  const selectedInstallment = installmentsForMou.find((i) => i.id === installmentId) ?? null
  const amountNum = Number(amount)
  const previewAfter = selectedInstallment !== null && Number.isFinite(amountNum)
    ? selectedInstallment.expectedAmount + amountNum
    : null

  const isReady =
    mouId !== '' &&
    installmentId !== '' &&
    Number.isFinite(amountNum) &&
    amountNum !== 0 &&
    reason.trim().length >= 10

  return (
    <form
      method="POST"
      action="/api/finance/adjustments/create"
      className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
      data-testid="adjustment-entry-form"
    >
      <div>
        <label htmlFor="mouSearch" className={FIELD_LABEL_CLASS}>
          MOU (search by school name or id)
        </label>
        <input
          id="mouSearch"
          type="search"
          value={mouSearch}
          onChange={(e) => setMouSearch(e.target.value)}
          placeholder="Type to filter"
          className={FIELD_INPUT_CLASS + ' mb-2'}
          data-testid="mou-search-input"
        />
        <label htmlFor="mouId" className="sr-only">
          MOU
        </label>
        <select
          id="mouId"
          name="mouId"
          required
          value={mouId}
          onChange={(e) => {
            setMouId(e.target.value)
            setInstallmentId('')
          }}
          className={FIELD_INPUT_CLASS}
          data-testid="mou-select"
        >
          <option value="">– Select MOU –</option>
          {filteredMous.map((m) => (
            <option key={m.id} value={m.id}>
              {m.schoolName} ({m.id}) – {m.programme} – {formatRs(m.contractValue)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="installmentId" className={FIELD_LABEL_CLASS}>
          Affected instalment
        </label>
        <select
          id="installmentId"
          name="installmentId"
          required
          value={installmentId}
          onChange={(e) => setInstallmentId(e.target.value)}
          disabled={mouId === ''}
          className={FIELD_INPUT_CLASS}
          data-testid="installment-select"
        >
          <option value="">– Select instalment –</option>
          {installmentsForMou.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
              {i.isLocked ? ' (locked)' : ''}
            </option>
          ))}
        </select>
        {selectedInstallment?.isLocked ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-signal-attention">
            <Lock aria-hidden className="size-3" />
            Locked. The adjustment will attach to the next unlocked instalment.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="adjustmentType" className={FIELD_LABEL_CLASS}>
            Adjustment type
          </label>
          <select
            id="adjustmentType"
            name="adjustmentType"
            required
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value)}
            className={FIELD_INPUT_CLASS}
            data-testid="adjustment-type-select"
          >
            {adjustmentTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amount" className={FIELD_LABEL_CLASS}>
            Amount delta (Rs; negative = credit to school)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g., -12500 or 15000"
            className={FIELD_INPUT_CLASS}
            data-testid="amount-input"
          />
          {previewAfter !== null && selectedInstallment !== null ? (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="amount-preview">
              {formatRs(selectedInstallment.expectedAmount)} → {formatRs(previewAfter)}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="reason" className={FIELD_LABEL_CLASS}>
          Reason (required, minimum 10 characters)
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Student count dropped from 500 to 450 after PI-1; refund the Rs 12,500 excess to next PI."
          className={FIELD_INPUT_CLASS}
          data-testid="reason-input"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="effectiveDate" className={FIELD_LABEL_CLASS}>
            Effective date
          </label>
          <input
            id="effectiveDate"
            name="effectiveDate"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className={FIELD_INPUT_CLASS}
            data-testid="effective-date-input"
          />
        </div>
        <div>
          <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
            Notes (optional)
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={FIELD_INPUT_CLASS}
            data-testid="notes-input"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button
          type="submit"
          disabled={!isReady}
          className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="adjustment-submit"
        >
          Create adjustment
        </button>
      </div>
    </form>
  )
}
