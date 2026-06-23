'use client'

/*
 * Add MOU form (client) - MOU form upgrade gate.
 *
 * Mandatory: school name, school address (when not linking an existing
 * school), programme, academic year, MOU start + end dates, student
 * count, sale price per student, at least one complete instalment row.
 * Optional: link to an existing canonical school, sales channel, sign
 * date, signed PDF.
 *
 * Validation runs per-field inline on submit (mirrored server-side in
 * /api/mou/create-from-upload; the server is the boundary). Submission
 * goes via fetch with Accept: application/json so the API's real error
 * message is surfaced verbatim instead of the retired generic
 * "Failed to save the MOU. Retry." line.
 */

import { useMemo, useState } from 'react'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { SALES_CHANNELS } from '@/lib/mouSystem/templates'
import { formatRs } from '@/lib/format'
import { instalmentSharePct, scheduleAddsUp } from '@/lib/mou/instalmentPercent'

const PROGRAMMES = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics'] as const

const FIELD = 'block text-sm font-medium text-brand-navy'
const INPUT =
  'mt-1 min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy'

interface SchoolOption {
  id: string
  name: string
  city: string
}

interface InstalmentRow {
  dueDateIso: string
  amountRs: string
}

type FieldErrors = Partial<Record<string, string>>

function Req() {
  return (
    <span className="text-signal-alert" aria-hidden>
      {' '}*
    </span>
  )
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null
  return (
    <p
      id={id}
      role="alert"
      className="mt-1 flex items-center gap-1 text-sm text-signal-alert"
    >
      <AlertCircle size={14} aria-hidden /> {msg}
    </p>
  )
}

export function AddMouForm({
  schools,
  defaultYear,
  initialError,
}: {
  schools: SchoolOption[]
  defaultYear: string
  initialError: string | null
}) {
  const [schoolName, setSchoolName] = useState('')
  const [schoolAddress, setSchoolAddress] = useState('')
  const [existingSchoolId, setExistingSchoolId] = useState('')
  const [programme, setProgramme] = useState<string>('STEAM')
  const [academicYear, setAcademicYear] = useState(defaultYear)
  const [students, setStudents] = useState('')
  const [pricePerStudent, setPricePerStudent] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [salesChannel, setSalesChannel] = useState('')
  const [signDate, setSignDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [installments, setInstallments] = useState<InstalmentRow[]>([
    { dueDateIso: '', amountRs: '' },
  ])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(initialError)
  const [submitting, setSubmitting] = useState(false)

  const linkedSchool = useMemo(
    () => schools.find((s) => s.id === existingSchoolId) ?? null,
    [schools, existingSchoolId],
  )

  const studentsNum = Number(students)
  const priceNum = Number(pricePerStudent)
  const contractValue =
    Number.isFinite(studentsNum) && studentsNum > 0 && Number.isFinite(priceNum) && priceNum > 0
      ? Math.round(studentsNum * priceNum)
      : 0

  const completeRows = installments.filter(
    (r) => r.dueDateIso !== '' && Number(r.amountRs) > 0,
  )
  const scheduledTotal = completeRows.reduce((s, r) => s + Number(r.amountRs), 0)
  // Live percent share of the contract value. Display-only; entering a %
  // to derive the amount is a possible follow-up.
  const totalPct = instalmentSharePct(scheduledTotal, contractValue)
  const rowPct = (amountRs: string): string | null => {
    const amt = Number(amountRs)
    if (contractValue <= 0 || !Number.isFinite(amt) || amt <= 0) return null
    return `${instalmentSharePct(amt, contractValue).toFixed(1)}%`
  }
  const scheduleMismatch =
    contractValue > 0 &&
    completeRows.length > 0 &&
    !scheduleAddsUp(scheduledTotal, contractValue)

  function validate(): FieldErrors {
    const e: FieldErrors = {}
    if (!linkedSchool && !schoolName.trim()) e.schoolName = 'School name is required.'
    if (!linkedSchool && !schoolAddress.trim()) e.schoolAddress = 'School address is required.'
    if (!/^\d{4}-\d{2}$/.test(academicYear.trim())) {
      e.academicYear = 'Enter the academic year as YYYY-YY (e.g. 2026-27).'
    }
    if (!Number.isFinite(studentsNum) || studentsNum <= 0) {
      e.students = 'Enter the number of students.'
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      e.pricePerStudent = 'Enter the sale price per student.'
    }
    if (!startDate) e.startDate = 'MOU start date is required.'
    if (!endDate) e.endDate = 'MOU end date is required.'
    if (startDate && endDate && endDate < startDate) {
      e.endDate = 'End date must be on or after the start date.'
    }
    if (completeRows.length === 0) {
      e.installments = 'Add at least one instalment with a due date and an amount.'
    }
    if (file && !file.name.toLowerCase().endsWith('.pdf')) {
      e.file = 'Only PDF files are accepted for the signed MOU.'
    }
    if (file && file.size > 10 * 1024 * 1024) {
      e.file = 'The signed PDF exceeds 10 MB.'
    }
    return e
  }

  function updateRow(idx: number, patch: Partial<InstalmentRow>) {
    setInstallments((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) {
      setSubmitError('Some required fields are missing. Check the highlighted fields.')
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('schoolName', linkedSchool ? linkedSchool.name : schoolName.trim())
      fd.set('schoolAddress', schoolAddress.trim())
      fd.set('existingSchoolId', existingSchoolId)
      fd.set('programme', programme)
      fd.set('academicYear', academicYear.trim())
      fd.set('students', students)
      fd.set('pricePerStudent', pricePerStudent)
      fd.set('startDate', startDate)
      fd.set('endDate', endDate)
      fd.set('salesChannel', salesChannel)
      fd.set('signDate', signDate)
      fd.set(
        'installments',
        JSON.stringify(
          completeRows.map((r) => ({ dueDateIso: r.dueDateIso, amountRs: Number(r.amountRs) })),
        ),
      )
      if (file) fd.set('file', file)

      const res = await fetch('/api/mou/create-from-upload', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: fd,
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; redirect?: string }
        | null
      if (!res.ok || !data?.ok) {
        setSubmitError(
          data?.message
            ? `Could not save the MOU (${res.status}): ${data.message}`
            : `Could not save the MOU (${res.status}). Ask an admin to check the function logs.`,
        )
        return
      }
      window.location.assign(data.redirect ?? '/mous')
    } catch (err) {
      setSubmitError(
        `Could not reach the server: ${(err as Error).message}. Check your connection and retry.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4 rounded-md border border-border bg-card p-5"
      data-testid="add-mou-form"
    >
      {submitError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert"
          data-testid="upload-error"
        >
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <div>
        <label htmlFor="existingSchoolId" className={FIELD}>
          Link to existing school <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <select
          id="existingSchoolId"
          className={INPUT}
          value={existingSchoolId}
          data-testid="school-select"
          onChange={(ev) => {
            const id = ev.target.value
            setExistingSchoolId(id)
            const s = schools.find((x) => x.id === id)
            if (s) setSchoolName(s.name)
          }}
        >
          <option value="">No link: enter the school below</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.city ? ` - ${s.city}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-600">
          Linking reuses the canonical school record. Without a link, a new school record is
          created from the name and address below.
        </p>
      </div>

      <div>
        <label htmlFor="schoolName" className={FIELD}>
          School name
          <Req />
        </label>
        <input
          id="schoolName"
          className={INPUT}
          value={linkedSchool ? linkedSchool.name : schoolName}
          disabled={!!linkedSchool}
          aria-required="true"
          aria-invalid={!!errors.schoolName}
          aria-describedby={errors.schoolName ? 'schoolName-error' : undefined}
          data-testid="school-name-input"
          onChange={(ev) => setSchoolName(ev.target.value)}
        />
        <FieldError id="schoolName-error" msg={errors.schoolName} />
      </div>

      <div>
        <label htmlFor="schoolAddress" className={FIELD}>
          School address
          {!linkedSchool ? <Req /> : <span className="font-normal text-slate-500"> (optional when linked)</span>}
        </label>
        <textarea
          id="schoolAddress"
          rows={2}
          className={INPUT}
          value={schoolAddress}
          aria-required={!linkedSchool}
          aria-invalid={!!errors.schoolAddress}
          aria-describedby={errors.schoolAddress ? 'schoolAddress-error' : undefined}
          data-testid="school-address-input"
          onChange={(ev) => setSchoolAddress(ev.target.value)}
        />
        <FieldError id="schoolAddress-error" msg={errors.schoolAddress} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="programme" className={FIELD}>
            Programme
            <Req />
          </label>
          <select
            id="programme"
            className={INPUT}
            value={programme}
            aria-required="true"
            onChange={(ev) => setProgramme(ev.target.value)}
          >
            {PROGRAMMES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="salesChannel" className={FIELD}>
            Sales channel <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <select
            id="salesChannel"
            className={INPUT}
            value={salesChannel}
            data-testid="sales-channel-select"
            onChange={(ev) => setSalesChannel(ev.target.value)}
          >
            <option value="">: select a channel :</option>
            {SALES_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="academicYear" className={FIELD}>
            Academic year
            <Req />
          </label>
          <input
            id="academicYear"
            className={INPUT}
            value={academicYear}
            placeholder="2026-27"
            aria-required="true"
            aria-invalid={!!errors.academicYear}
            aria-describedby={errors.academicYear ? 'academicYear-error' : undefined}
            onChange={(ev) => setAcademicYear(ev.target.value)}
          />
          <FieldError id="academicYear-error" msg={errors.academicYear} />
        </div>
        <div>
          <label htmlFor="signDate" className={FIELD}>
            Sign date <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="signDate"
            type="date"
            className={INPUT}
            value={signDate}
            onChange={(ev) => setSignDate(ev.target.value)}
          />
        </div>
      </div>

      <fieldset>
        <legend className={FIELD}>
          Duration of MOU
          <Req />
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-xs text-slate-600">
              Start date
            </label>
            <input
              id="startDate"
              type="date"
              className={INPUT}
              value={startDate}
              aria-required="true"
              aria-invalid={!!errors.startDate}
              aria-describedby={errors.startDate ? 'startDate-error' : undefined}
              data-testid="start-date-input"
              onChange={(ev) => setStartDate(ev.target.value)}
            />
            <FieldError id="startDate-error" msg={errors.startDate} />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-xs text-slate-600">
              End date
            </label>
            <input
              id="endDate"
              type="date"
              className={INPUT}
              value={endDate}
              aria-required="true"
              aria-invalid={!!errors.endDate}
              aria-describedby={errors.endDate ? 'endDate-error' : undefined}
              data-testid="end-date-input"
              onChange={(ev) => setEndDate(ev.target.value)}
            />
            <FieldError id="endDate-error" msg={errors.endDate} />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="students" className={FIELD}>
            No. of students
            <Req />
          </label>
          <input
            id="students"
            type="number"
            min={1}
            inputMode="numeric"
            className={INPUT}
            value={students}
            aria-required="true"
            aria-invalid={!!errors.students}
            aria-describedby={errors.students ? 'students-error' : undefined}
            data-testid="students-input"
            onChange={(ev) => setStudents(ev.target.value)}
          />
          <FieldError id="students-error" msg={errors.students} />
        </div>
        <div>
          <label htmlFor="pricePerStudent" className={FIELD}>
            Sale price per student (Rs)
            <Req />
          </label>
          <input
            id="pricePerStudent"
            type="number"
            min={1}
            inputMode="numeric"
            className={INPUT}
            value={pricePerStudent}
            aria-required="true"
            aria-invalid={!!errors.pricePerStudent}
            aria-describedby={errors.pricePerStudent ? 'pricePerStudent-error' : undefined}
            data-testid="price-input"
            onChange={(ev) => setPricePerStudent(ev.target.value)}
          />
          <FieldError id="pricePerStudent-error" msg={errors.pricePerStudent} />
        </div>
      </div>

      <p className="text-sm text-slate-700" data-testid="contract-value-line">
        Contract value: <strong>{contractValue > 0 ? formatRs(contractValue) : 'Rs -'}</strong>
        {contractValue > 0 ? (
          <span className="text-slate-500">
            {' '}
            ({Number(students).toLocaleString('en-IN')} students x {formatRs(priceNum)})
          </span>
        ) : null}
      </p>

      <fieldset>
        <legend className={FIELD}>
          Instalment schedule
          <Req />
        </legend>
        <div className="mt-2 space-y-2">
          {installments.map((row, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <div className="flex-1">
                <label htmlFor={`inst-date-${idx}`} className="sr-only">
                  Instalment {idx + 1} due date
                </label>
                <input
                  id={`inst-date-${idx}`}
                  type="date"
                  className={INPUT}
                  value={row.dueDateIso}
                  data-testid={`instalment-date-${idx}`}
                  onChange={(ev) => updateRow(idx, { dueDateIso: ev.target.value })}
                />
              </div>
              <div className="flex-1">
                <label htmlFor={`inst-amount-${idx}`} className="sr-only">
                  Instalment {idx + 1} amount in rupees
                </label>
                <input
                  id={`inst-amount-${idx}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Amount (Rs)"
                  className={INPUT}
                  value={row.amountRs}
                  data-testid={`instalment-amount-${idx}`}
                  onChange={(ev) => updateRow(idx, { amountRs: ev.target.value })}
                />
                {rowPct(row.amountRs) ? (
                  <p
                    className="mt-1 text-right text-xs text-slate-500 tabular-nums"
                    data-testid={`instalment-percent-${idx}`}
                  >
                    {rowPct(row.amountRs)} of contract value
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Remove instalment ${idx + 1}`}
                className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-slate-500 hover:bg-slate-100 hover:text-signal-alert focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-40"
                disabled={installments.length === 1}
                onClick={() => setInstallments((rows) => rows.filter((_, i) => i !== idx))}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          data-testid="add-instalment"
          onClick={() => setInstallments((rows) => [...rows, { dueDateIso: '', amountRs: '' }])}
        >
          <Plus size={16} aria-hidden /> Add instalment
        </button>
        <p
          className="mt-2 border-t border-border pt-2 text-sm font-medium text-slate-700"
          data-testid="schedule-total-line"
        >
          Total scheduled: {formatRs(scheduledTotal)}
          {contractValue > 0 ? (
            <>
              {' '}
              <span className="tabular-nums">({totalPct.toFixed(1)}%)</span> of{' '}
              {formatRs(contractValue)} contract value
            </>
          ) : null}
        </p>
        {scheduleMismatch ? (
          <p className="mt-1 text-sm text-amber-700" data-testid="schedule-mismatch-warning">
            The schedule does not add up to the contract value. Save is still allowed.
          </p>
        ) : null}
        <FieldError id="installments-error" msg={errors.installments} />
      </fieldset>

      <div>
        <label htmlFor="file" className={FIELD}>
          Signed MOU (PDF) <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="file"
          type="file"
          accept="application/pdf"
          className="mt-1 w-full text-sm"
          data-testid="file-input"
          onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
        />
        <FieldError id="file-error" msg={errors.file} />
      </div>

      <p className="text-xs text-slate-600">
        Pricing is per student; products are assigned by Ops after entry. On save, the MOU is
        created as <strong>Active</strong> and surfaces to Ops as <strong>Pending for review</strong>.
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-60"
          data-testid="save-mou"
        >
          {submitting ? 'Saving...' : 'Save MOU'}
        </button>
      </div>
    </form>
  )
}
