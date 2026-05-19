'use client'

/*
 * PaymentLogForm. Client component: school/MOU/installment cascade
 * with simple substring autocomplete. Posts as a form to
 * /api/finance/payment/log; the API route does the branching between
 * auto-match (recordReceipt) and queue-a-PaymentLog.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatRs } from '@/lib/format'
import { opsButtonClass } from '@/components/ops/OpsButton'

const BANK_NAMES = [
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'State Bank of India',
  'Yes Bank',
  'IndusInd Bank',
  'IDFC First Bank',
  'Other',
] as const

const PAYMENT_MODES = [
  'Bank Transfer',
  'Cheque',
  'DD',
  'UPI',
  'Other',
] as const

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
  dueDateIso: string | null
  status: string
  schoolId: string | null
}

interface Props {
  schools: SchoolLite[]
  mous: MouLite[]
  installments: InstallmentLite[]
  prefill: {
    schoolId: string
    mouId: string
    paymentId: string
  }
  disabled?: boolean
}

const FIELD_INPUT_CLASS =
  'block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS =
  'block text-sm font-medium text-brand-navy mb-1'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PaymentLogForm({
  schools,
  mous,
  installments,
  prefill,
  disabled,
}: Props) {
  const [schoolId, setSchoolId] = useState(prefill.schoolId)
  const [schoolQuery, setSchoolQuery] = useState(() => {
    const found = schools.find((s) => s.id === prefill.schoolId)
    return found ? found.name : ''
  })
  const [mouId, setMouId] = useState(prefill.mouId)
  const [paymentId, setPaymentId] = useState(prefill.paymentId)
  const [bankName, setBankName] = useState<string>('HDFC Bank')
  const [bankNameOther, setBankNameOther] = useState('')

  const schoolMatches = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase()
    if (q === '') return [] as SchoolLite[]
    const exact = schools.find((s) => s.name.toLowerCase() === q)
    if (exact && exact.id === schoolId) return [] as SchoolLite[]
    return schools
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [schools, schoolQuery, schoolId])

  const mousForSchool = useMemo(() => {
    if (!schoolId) return [] as MouLite[]
    return mous.filter((m) => m.schoolId === schoolId)
  }, [mous, schoolId])

  const installmentsForMou = useMemo(() => {
    if (!mouId) return [] as InstallmentLite[]
    return installments.filter((i) => i.mouId === mouId)
  }, [installments, mouId])

  // Selecting a school clears stale MOU + installment picks.
  function pickSchool(s: SchoolLite) {
    setSchoolId(s.id)
    setSchoolQuery(s.name)
    setMouId('')
    setPaymentId('')
  }

  function changeMou(value: string) {
    setMouId(value)
    setPaymentId('')
  }

  return (
    <form
      action="/api/finance/payment/log"
      method="POST"
      className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
      data-testid="payment-log-form"
    >
      <fieldset disabled={disabled} className="space-y-4">
        <div>
          <label htmlFor="bankReference" className={FIELD_LABEL_CLASS}>
            Bank reference (UTR, cheque number)
          </label>
          <input
            id="bankReference"
            name="bankReference"
            type="text"
            required
            placeholder="e.g., UTR-HDFC0000123"
            className={FIELD_INPUT_CLASS}
          />
        </div>

        {/* Phase 4 (2026-05-19): bank + TDS split replaces the single
            "Amount received" input. The hidden receivedAmount field
            below is set on submit (via the inline script) so the
            existing API contract on /api/finance/payment/log keeps
            working; the API also reads bankAmount + tdsAmount and
            persists the split on the Payment row. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="bankAmount" className={FIELD_LABEL_CLASS}>
              Bank amount (Rs)
              <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
            </label>
            <input
              id="bankAmount"
              name="bankAmount"
              type="number"
              min="0"
              step="0.01"
              required
              className={FIELD_INPUT_CLASS}
              data-testid="payment-log-bank-amount"
              onChange={(e) => {
                const bank = parseFloat(e.target.value) || 0
                const tdsEl = document.getElementById('tdsAmount') as HTMLInputElement | null
                const tds = tdsEl ? parseFloat(tdsEl.value) || 0 : 0
                const totalEl = document.getElementById('receivedAmount') as HTMLInputElement | null
                if (totalEl) totalEl.value = String(bank + tds)
              }}
            />
          </div>
          <div>
            <label htmlFor="tdsAmount" className={FIELD_LABEL_CLASS}>
              TDS amount (Rs)
            </label>
            <input
              id="tdsAmount"
              name="tdsAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className={FIELD_INPUT_CLASS}
              data-testid="payment-log-tds-amount"
              onChange={(e) => {
                const tds = parseFloat(e.target.value) || 0
                const bankEl = document.getElementById('bankAmount') as HTMLInputElement | null
                const bank = bankEl ? parseFloat(bankEl.value) || 0 : 0
                const totalEl = document.getElementById('receivedAmount') as HTMLInputElement | null
                if (totalEl) totalEl.value = String(bank + tds)
              }}
            />
          </div>
          <div>
            <label htmlFor="receivedDate" className={FIELD_LABEL_CLASS}>
              Date received
            </label>
            <input
              id="receivedDate"
              name="receivedDate"
              type="date"
              required
              defaultValue={todayIso()}
              className={FIELD_INPUT_CLASS}
            />
          </div>
        </div>
        <input id="receivedAmount" name="receivedAmount" type="hidden" defaultValue="0" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bankName" className={FIELD_LABEL_CLASS}>
              Bank
            </label>
            <select
              id="bankName"
              name="bankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={FIELD_INPUT_CLASS}
            >
              {BANK_NAMES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paymentMode" className={FIELD_LABEL_CLASS}>
              Payment mode
            </label>
            <select
              id="paymentMode"
              name="paymentMode"
              defaultValue="Bank Transfer"
              className={FIELD_INPUT_CLASS}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {bankName === 'Other' ? (
          <div>
            <label htmlFor="bankNameOther" className={FIELD_LABEL_CLASS}>
              Bank name (other)
            </label>
            <input
              id="bankNameOther"
              name="bankNameOther"
              type="text"
              value={bankNameOther}
              onChange={(e) => setBankNameOther(e.target.value)}
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="schoolQuery" className={FIELD_LABEL_CLASS}>
            School
            <span aria-hidden className="ml-0.5 text-signal-alert">*</span>
          </label>
          <input
            id="schoolQuery"
            type="text"
            value={schoolQuery}
            onChange={(e) => {
              setSchoolQuery(e.target.value)
              setSchoolId('')
              setMouId('')
              setPaymentId('')
            }}
            placeholder="Type to search active schools..."
            autoComplete="off"
            className={FIELD_INPUT_CLASS}
            aria-describedby="schoolHint"
            data-testid="payment-log-school-input"
          />
          <input type="hidden" name="schoolId" value={schoolId} />
          <p id="schoolHint" className="mt-1 text-xs text-muted-foreground">
            Pick a match from the list. Required.
          </p>
          {schoolMatches.length > 0 ? (
            <ul
              role="listbox"
              className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card text-sm"
              data-testid="payment-log-school-matches"
            >
              {schoolMatches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pickSchool(s)}
                    className="block w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <span className="block text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.city}, {s.state}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <label htmlFor="mouId" className={FIELD_LABEL_CLASS}>
            MOU (optional)
          </label>
          <select
            id="mouId"
            name="mouId"
            value={mouId}
            onChange={(e) => changeMou(e.target.value)}
            disabled={!schoolId}
            className={FIELD_INPUT_CLASS}
            data-testid="payment-log-mou-select"
          >
            <option value="">{schoolId ? 'Pick an MOU (or leave blank to park)' : 'Pick a school first'}</option>
            {mousForSchool.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.programme}
                {m.programmeSubType ? ' / ' + m.programmeSubType : ''} · {m.academicYear}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="paymentId" className={FIELD_LABEL_CLASS}>
            Instalment (optional)
          </label>
          <select
            id="paymentId"
            name="paymentId"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            disabled={!mouId}
            className={FIELD_INPUT_CLASS}
            data-testid="payment-log-installment-select"
          >
            <option value="">{mouId ? 'Pick an open instalment (or leave blank to park)' : 'Pick an MOU first'}</option>
            {installmentsForMou.map((i) => (
              <option key={i.id} value={i.id}>
                {i.instalmentLabel} · expected {formatRs(i.expectedAmount)} · {i.status}
              </option>
            ))}
          </select>
          {paymentId !== '' ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Matching the exact expected amount auto-records the receipt. A different amount parks for review.
            </p>
          ) : null}
        </div>

        {/* TDS field consolidated into the Bank + TDS pair above. */}

        <div>
          <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className={FIELD_INPUT_CLASS}
            placeholder="Anything Finance needs to know about this entry."
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="submit"
            className={opsButtonClass({ variant: 'action', size: 'md' })}
            data-testid="payment-log-submit"
          >
            Log payment
          </button>
          <Link
            href="/finance/payments"
            className={opsButtonClass({ variant: 'outline', size: 'md' })}
          >
            Cancel
          </Link>
        </div>
      </fieldset>
    </form>
  )
}
