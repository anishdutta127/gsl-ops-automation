'use client'

/*
 * GeneratorWizard (Step 5; ported from gsl-mou-system).
 *
 * Mirrors gsl-mou-system/src/components/generator/GeneratorWizard.tsx
 * field-for-field. Pranav has months of muscle memory on this form;
 * the only deltas are:
 *   - Identity is inherited from the Ops session cookie (passed in by
 *     the host page), not from the gsl-mou-system useIdentity() hook.
 *   - Save Draft POSTs to /api/mou/save-draft (Ops); the body shape is
 *     identical to gsl-mou-system's /api/generator/save-draft.
 *   - Generate POSTs to the gsl-mou-system /api/generator/preview
 *     endpoint via a same-origin fetch - the .docx generator has not
 *     been ported to Ops yet (D-tracked); the Generate button stays
 *     disabled inside Ops with an inline note explaining how to render
 *     the .docx (download from gsl-mou-system or wait for the port).
 *     // QUESTION: confirm the deferred-generate path is acceptable for
 *     // V1 - see STEP5_QUESTIONS.md Q-deferred.
 *
 * Department accent: navy/teal (Sales-led).
 *
 * The toast after save uses the brief's verbatim string:
 * "Saved. Will reflect everywhere within ~5 minutes."
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Save, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import type { PlaceholderSpec, TemplateSpec } from '@/lib/mouSystem/templates'
import { SALES_CHANNELS, TRAINER_MODELS } from '@/lib/mouSystem/templates'
import { formatRs } from '@/lib/format'
import { monthsForYear, formatMonthLabel } from '@/lib/mouSystem/monthRange'
import { deriveSpWithoutTax } from '@/lib/mouSystem/pricing'
import type {
  GradewiseDistributionRow,
  MouBillingBlock,
  ProductSelection,
  SalesChannel,
  SalesPerson,
  TrainerModel,
  YearPaymentSchedule,
  YearlyPricingRow,
} from '@/lib/mouSystem/types'
import { GradewiseSection } from './GradewiseSection'

export interface GenSchool {
  id: string
  name: string
  legalEntity: string | null
  city: string
  state: string
  pinCode?: string | null
  pan: string | null
  gstNumber: string | null
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  billingName?: string | null
}

interface Props {
  template: TemplateSpec
  schools: GenSchool[]
  salesTeam: SalesPerson[]
  minAcceptable: number | null
  rateCardVariant: string | null
  currentUserId: string
  currentUserName: string
  initialDraftId?: string
  initialValues?: Record<string, string>
  initialAnnexureHtml?: string | null
  initialSchoolId?: string | null
  initialProductSelection?: ProductSelection | null
  initialGradewiseDistribution?: GradewiseDistributionRow[] | null
}

const EMPTY_BILLING: MouBillingBlock = {
  billingName: '',
  billingAddress: '',
  billingCityState: '',
  shipToName: '',
  shipToAddress: '',
  shipToCityState: '',
  schoolEmail: '',
  contactPersonName: '',
  designation: '',
  mobileNo: '',
  contactEmail: '',
  schoolContactNo: '',
  pan: '',
  gst: '',
}

function computeNumberOfYears(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  if (e <= s) return 0
  const years = (e.getTime() - s.getTime()) / (365.25 * 86400000)
  return Math.max(1, Math.ceil(years))
}

function durationLabel(start: string, end: string): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ''
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-IN', { month: 'short' })}-${d.getFullYear()}`
  return `${fmt(s)} to ${fmt(e)}`
}

function defaultSchedule(year: number, yearMonths: string[]): YearPaymentSchedule {
  // Spread 4 quarterly instalments across the year's months. Falls back
  // to a single placeholder month when the year doesn't yet have date
  // data (start/end dates not picked).
  const months = yearMonths.length > 0 ? yearMonths : ['']
  const pick = (idx: number, of: number): string => {
    if (months.length === 0 || months[0] === '') return ''
    const i = Math.min(months.length - 1, Math.round((months.length - 1) * (idx / Math.max(1, of - 1))))
    return months[i] ?? months[0]!
  }
  return {
    year,
    instalments: [
      { month: pick(0, 4), pctDue: 25 },
      { month: pick(1, 4), pctDue: 25 },
      { month: pick(2, 4), pctDue: 25 },
      { month: pick(3, 4), pctDue: 25 },
    ],
  }
}

export function GeneratorWizard({
  template,
  schools,
  salesTeam,
  minAcceptable,
  rateCardVariant,
  currentUserId,
  currentUserName,
  initialDraftId,
  initialValues,
  initialAnnexureHtml,
  initialSchoolId,
  initialProductSelection,
  initialGradewiseDistribution,
}: Props) {
  const [schoolId, setSchoolId] = useState<string>(initialSchoolId ?? '')
  // Round 4 follow-up: inline school-create. When `addingSchool` is
  // true the wizard hides the dropdown and shows a thin panel that
  // captures Name, Region (required), City, State. The server slugs
  // the id and runs the school + MOU insert in one postgres
  // transaction (see saveDraftMou). The dropdown path (the 25%
  // repeat-customer case) is unchanged.
  const [addingSchool, setAddingSchool] = useState<boolean>(false)
  const [newSchoolName, setNewSchoolName] = useState<string>('')
  const [newSchoolRegion, setNewSchoolRegion] = useState<'' | 'East' | 'North' | 'South-West'>('')
  const [newSchoolCity, setNewSchoolCity] = useState<string>('')
  const [newSchoolState, setNewSchoolState] = useState<string>('')
  const [values, setValues] = useState<Record<string, string>>(() => initialValues ?? {})
  const [trainerModel, setTrainerModel] = useState<TrainerModel | ''>('')
  const [salesChannel, setSalesChannel] = useState<SalesChannel>('School Programs (Course)')
  const [salesPersonId, setSalesPersonId] = useState<string>('')
  const [crmSchoolId, setCrmSchoolId] = useState<string>('')
  const [schedules, setSchedules] = useState<YearPaymentSchedule[]>([defaultSchedule(1, [])])
  const [yearlyPricing, setYearlyPricing] = useState<YearlyPricingRow[]>([
    { year: 1, spWithoutTax: 0, spWithTax: 0 },
  ])
  const [billing, setBilling] = useState<MouBillingBlock>(EMPTY_BILLING)
  const [annexureRaw, setAnnexureRaw] = useState<string>(initialAnnexureHtml ?? '')
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null)

  // Gate 3 Step 1: kits-dispatch enhancements (optional, collapsible).
  const [productSelection, setProductSelection] = useState<ProductSelection | null>(
    initialProductSelection ?? null,
  )
  const [gradewiseDistribution, setGradewiseDistribution] = useState<
    GradewiseDistributionRow[] | null
  >(initialGradewiseDistribution ?? null)
  const [kitsSectionExpanded, setKitsSectionExpanded] = useState<boolean>(
    Boolean(initialProductSelection || initialGradewiseDistribution),
  )

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [generateState, setGenerateState] = useState<'idle' | 'generating' | 'generated' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === schoolId) ?? null,
    [schools, schoolId],
  )

  const startDate = values.START_DATE ?? ''
  const endDate = values.END_DATE ?? ''
  const numberOfYears = computeNumberOfYears(startDate, endDate)

  // Sync schedule length with number of years.
  useEffect(() => {
    if (numberOfYears <= 0) return
    setSchedules((prev) => {
      if (prev.length === numberOfYears) return prev
      const next = [...prev]
      while (next.length < numberOfYears) {
        const yr = next.length + 1
        next.push(defaultSchedule(yr, monthsForYear(startDate, yr, endDate)))
      }
      while (next.length > numberOfYears) next.pop()
      return next.map((y, i) => ({ ...y, year: i + 1 }))
    })
  }, [numberOfYears, startDate, endDate])

  // Keep yearlyPricing length in sync with the contract duration. New
  // years default to Year 1's price.
  useEffect(() => {
    if (numberOfYears <= 0) return
    setYearlyPricing((prev) => {
      if (prev.length === numberOfYears) return prev
      const next = [...prev]
      const seedFrom = next[0] ?? { year: 1, spWithoutTax: 0, spWithTax: 0 }
      while (next.length < numberOfYears) {
        next.push({
          year: next.length + 1,
          spWithoutTax: seedFrom.spWithoutTax,
          spWithTax: seedFrom.spWithTax,
        })
      }
      while (next.length > numberOfYears) next.pop()
      return next.map((y, i) => ({ ...y, year: i + 1 }))
    })
  }, [numberOfYears])

  // Year 1 pricing tracks the PRICE_PER_STUDENT placeholder (which is
  // labelled "incl. GST" in the template registry, so it is the
  // with-GST value). The without-GST counterpart is derived top-down
  // via deriveSpWithoutTax so it matches what generatePi.ts uses for
  // the PI subtotal (Round 1 anchor). Round 4 Bug 2: prior code fell
  // back to PRICE_PER_STUDENT for BOTH fields, so both showed the
  // same Rs 1200 instead of Rs 1017 / Rs 1200.
  useEffect(() => {
    const num = (s: string | undefined) => {
      if (!s) return 0
      const n = parseFloat(s.replace(/[^0-9.]/g, ''))
      return Number.isFinite(n) ? n : 0
    }
    const spWithTax = num(values.PRICE_PER_STUDENT)
    const spWithoutTax = deriveSpWithoutTax(spWithTax)
    setYearlyPricing((prev) => {
      if (prev.length === 0) return prev
      const cur = prev[0]!
      if (cur.spWithoutTax === spWithoutTax && cur.spWithTax === spWithTax) return prev
      const next = [...prev]
      next[0] = { ...cur, spWithoutTax, spWithTax }
      return next
    })
  }, [values])

  function updateYearlyPricing(
    yearIdx: number,
    field: 'spWithoutTax' | 'spWithTax',
    next: number,
  ) {
    setYearlyPricing((prev) =>
      prev.map((row, i) => {
        if (i !== yearIdx) return row
        const v = Number.isFinite(next) ? next : 0
        // Round 4 Bug 2: editing the with-GST entry derives the
        // without-GST counterpart so the two stay locked in the
        // same Math.round(withTax / 1.18) ratio the PI generator
        // uses. without-GST is read-only in the UI, so the
        // 'spWithoutTax' branch only fires for legacy callers and
        // also keeps the derivation invariant.
        if (field === 'spWithTax') {
          return { ...row, spWithTax: v, spWithoutTax: deriveSpWithoutTax(v) }
        }
        return { ...row, spWithoutTax: v }
      }),
    )
  }

  // Prefill from school record.
  useEffect(() => {
    if (!selectedSchool) return
    setValues((prev) => {
      const next = { ...prev }
      for (const [name, spec] of Object.entries(template.placeholders)) {
        if ((next[name] ?? '').trim() === '') {
          next[name] = prefillFor(spec, selectedSchool)
        }
      }
      return next
    })
    setBilling((prev) => ({
      ...prev,
      billingName: prev.billingName || selectedSchool.billingName || selectedSchool.legalEntity || selectedSchool.name,
      billingAddress: prev.billingAddress || `${selectedSchool.city}, ${selectedSchool.state}${selectedSchool.pinCode ? ' - ' + selectedSchool.pinCode : ''}`,
      billingCityState: prev.billingCityState || `${selectedSchool.city}, ${selectedSchool.state}`,
      shipToName: prev.shipToName || selectedSchool.name,
      shipToAddress: prev.shipToAddress || `${selectedSchool.city}, ${selectedSchool.state}${selectedSchool.pinCode ? ' - ' + selectedSchool.pinCode : ''}`,
      shipToCityState: prev.shipToCityState || `${selectedSchool.city}, ${selectedSchool.state}`,
      schoolEmail: prev.schoolEmail || selectedSchool.email || '',
      contactPersonName: prev.contactPersonName || selectedSchool.contactPerson || '',
      contactEmail: prev.contactEmail || selectedSchool.email || '',
      schoolContactNo: prev.schoolContactNo || selectedSchool.phone || '',
      pan: prev.pan || selectedSchool.pan || '',
      gst: prev.gst || selectedSchool.gstNumber || '',
    }))
  }, [selectedSchool, template.placeholders])

  function prefillFor(spec: PlaceholderSpec, school: GenSchool): string {
    switch (spec.prefillFrom) {
      case 'school.legalEntity':
        return school.legalEntity ?? school.name
      case 'school.name':
        return school.name
      case 'school.city':
        return school.city
      case 'school.state':
        return school.state
      case 'school.pan':
        return school.pan ?? ''
      case 'school.gstNumber':
        return school.gstNumber ?? ''
      default:
        return spec.default ?? ''
    }
  }

  const annexureFields = Object.entries(template.placeholders).filter(([, s]) => s.section === 'annexure')

  const rateWarning = useMemo(() => {
    const raw = values.PRICE_PER_STUDENT
    if (!raw) return null
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n)) return null
    if (minAcceptable !== null && n < minAcceptable) {
      return `Price ${formatRs(n)} is below the rate card floor of ${formatRs(minAcceptable)}${
        rateCardVariant ? ` for ${rateCardVariant}` : ''
      }. Get sales head approval before signing.`
    }
    return null
  }, [values, minAcceptable, rateCardVariant])

  const validationError = useMemo(() => {
    if (addingSchool) {
      if (!newSchoolName.trim()) {
        return 'Enter the new school’s name to continue.'
      }
      if (!newSchoolRegion) {
        return 'Pick a region (East, North, or South-West) for the new school.'
      }
    } else if (!selectedSchool) {
      return 'Pick a school from the dropdown, or use "+ Add new school" to create one inline.'
    }
    if (!values.EFFECTIVE_DATE) return 'Effective date is required.'
    if (!startDate || !endDate) return 'Start and end dates are required.'
    if (new Date(startDate) >= new Date(endDate)) return 'End date must be after the start date.'
    if (!trainerModel) return 'Trainer model is required.'
    const studentsRaw = values.STUDENT_COUNT ?? ''
    const students = parseFloat(studentsRaw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(students) || students <= 0) return 'Students committed must be a positive number.'
    for (const yr of schedules) {
      if (yr.instalments.length === 0) return `Year ${yr.year}: add at least one instalment.`
      if (yr.instalments.length > 4) return `Year ${yr.year}: max 4 instalments per year.`
      const total = yr.instalments.reduce((s, x) => s + (Number.isFinite(x.pctDue) ? x.pctDue : 0), 0)
      if (Math.abs(total - 100) > 0.01) return `Year ${yr.year}: instalments must total 100% (currently ${total}%).`
      const allowed = new Set(monthsForYear(startDate, yr.year, endDate))
      for (let i = 0; i < yr.instalments.length; i++) {
        const m = yr.instalments[i]!.month
        if (!m) return `Year ${yr.year}: pick a month for instalment ${i + 1}.`
        if (allowed.size > 0 && !allowed.has(m)) {
          return `Year ${yr.year}: instalment ${i + 1} month ${m} is outside the MOU duration.`
        }
      }
    }
    return null
  }, [
    values,
    selectedSchool,
    startDate,
    endDate,
    trainerModel,
    schedules,
    addingSchool,
    newSchoolName,
    newSchoolRegion,
  ])

  function updateSchedule(yearIdx: number, fn: (s: YearPaymentSchedule) => YearPaymentSchedule) {
    setSchedules((prev) => prev.map((y, i) => (i === yearIdx ? fn(y) : y)))
  }

  function addInstalment(yearIdx: number) {
    updateSchedule(yearIdx, (y) => {
      if (y.instalments.length >= 4) return y
      const months = monthsForYear(startDate, y.year, endDate)
      return {
        ...y,
        instalments: [
          ...y.instalments,
          { month: months[0] ?? '', pctDue: 0 },
        ],
      }
    })
  }

  function removeInstalment(yearIdx: number, instIdx: number) {
    updateSchedule(yearIdx, (y) => ({
      ...y,
      instalments: y.instalments.filter((_, i) => i !== instIdx),
    }))
  }

  function updateInstalment(
    yearIdx: number,
    instIdx: number,
    field: 'month' | 'pctDue',
    next: string | number,
  ) {
    updateSchedule(yearIdx, (y) => ({
      ...y,
      instalments: y.instalments.map((it, i) =>
        i === instIdx
          ? {
              ...it,
              [field]: field === 'pctDue' ? Number(next) || 0 : (next as string),
            }
          : it,
      ),
    }))
  }

  const saveDraft = useCallback(async () => {
    if (validationError) {
      setServerError(validationError)
      setSaveState('error')
      return
    }
    setSaveState('saving')
    setServerError(null)
    try {
      const res = await fetch('/api/mou/save-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityName: currentUserName,
          identityId: currentUserId,
          draftMouId: draftId,
          templateId: template.id,
          programme: template.programme,
          schoolId: addingSchool ? null : (selectedSchool?.id ?? null),
          schoolName:
            (addingSchool ? newSchoolName : values.SCHOOL_NAME) ??
            selectedSchool?.name ??
            '',
          newSchool: addingSchool
            ? {
                name: newSchoolName,
                region: newSchoolRegion,
                city: newSchoolCity || null,
                state: newSchoolState || null,
                billingName: billing.billingName || null,
                contactPerson: billing.contactPersonName || null,
                email: billing.contactEmail || null,
                phone: billing.mobileNo || null,
                pan: billing.pan || null,
                gstNumber: billing.gst || null,
              }
            : null,
          variables: values,
          annexureHtml: annexureRaw,
          trainerModel,
          salesChannel,
          salesPersonId: salesPersonId || null,
          schoolCrmId: crmSchoolId.trim() || null,
          paymentSchedules: schedules,
          yearlyPricing,
          billingBlock: billing,
          productSelection,
          gradewiseDistribution,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `Save failed (${res.status})`)
      }
      const json = (await res.json()) as { draft: { id: string } }
      setDraftId(json.draft.id)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
    } catch (e) {
      setSaveState('error')
      setServerError(e instanceof Error ? e.message : 'Save failed')
    }
  }, [
    validationError, currentUserName, currentUserId, draftId, template, values,
    selectedSchool, annexureRaw, trainerModel, salesChannel, salesPersonId,
    crmSchoolId, schedules, yearlyPricing, billing, productSelection,
    gradewiseDistribution,
    addingSchool, newSchoolName, newSchoolRegion, newSchoolCity, newSchoolState,
  ])

  const generateDocx = useCallback(async () => {
    if (validationError) {
      setServerError(validationError)
      setGenerateState('error')
      return
    }
    setGenerateState('generating')
    setServerError(null)
    try {
      const res = await fetch('/api/mou/generate-docx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draftMouId: draftId,
          templateId: template.id,
          programme: template.programme,
          schoolId: addingSchool ? null : (selectedSchool?.id ?? null),
          schoolName:
            (addingSchool ? newSchoolName : values.SCHOOL_NAME) ??
            selectedSchool?.name ??
            '',
          newSchool: addingSchool
            ? {
                name: newSchoolName,
                region: newSchoolRegion,
                city: newSchoolCity || null,
                state: newSchoolState || null,
                billingName: billing.billingName || null,
                contactPerson: billing.contactPersonName || null,
                email: billing.contactEmail || null,
                phone: billing.mobileNo || null,
                pan: billing.pan || null,
                gstNumber: billing.gst || null,
              }
            : null,
          variables: values,
          annexureHtml: annexureRaw,
          trainerModel,
          salesChannel,
          salesPersonId: salesPersonId || null,
          schoolCrmId: crmSchoolId.trim() || null,
          paymentSchedules: schedules,
          yearlyPricing,
          billingBlock: billing,
          productSelection,
          gradewiseDistribution,
        }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(errBody.message ?? errBody.error ?? `Generate failed (${res.status})`)
      }
      // Pull the persisted MOU id off the custom header so the wizard
      // can keep working with the same draft after generation.
      const savedMouId = res.headers.get('x-mou-id')
      if (savedMouId) setDraftId(savedMouId)
      const filename = `${savedMouId ?? draftId ?? 'mou'}.docx`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setGenerateState('generated')
      setTimeout(() => setGenerateState('idle'), 6000)
    } catch (e) {
      setGenerateState('error')
      setServerError(e instanceof Error ? e.message : 'Generate failed')
    }
  }, [
    draftId,
    template.id,
    template.programme,
    selectedSchool,
    values,
    annexureRaw,
    trainerModel,
    salesChannel,
    salesPersonId,
    crmSchoolId,
    schedules,
    yearlyPricing,
    billing,
    productSelection,
    gradewiseDistribution,
    validationError,
    currentUserId,
    currentUserName,
    addingSchool,
    newSchoolName,
    newSchoolRegion,
    newSchoolCity,
    newSchoolState,
  ])

  // Auto-created SalesPerson records (e.g. from the Pranav refresh import)
  // may land without the `programmes` field set. Treat a missing or empty
  // programmes list as "rep covers every programme", so the wizard does not
  // crash when one of these partial records ends up in the team.
  const programmeSalesTeam = salesTeam.filter((sp) => {
    const programmes = sp.programmes ?? []
    return programmes.length === 0 || programmes.some((p) => p === template.programme)
  })

  const fieldClass =
    'mt-1 w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="max-w-4xl space-y-6">
      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          School and dates
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className={labelClass}>School</span>
              <button
                type="button"
                onClick={() => {
                  setAddingSchool((prev) => {
                    const next = !prev
                    if (next) {
                      // entering inline-create mode: clear the dropdown
                      // selection so the form payload routes through
                      // newSchool, not schoolId.
                      setSchoolId('')
                      if (!newSchoolName && values.SCHOOL_NAME) {
                        setNewSchoolName(values.SCHOOL_NAME)
                      }
                    }
                    return next
                  })
                }}
                data-testid="toggle-inline-school-create"
                className="text-xs font-semibold uppercase tracking-wider text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {addingSchool ? '← Back to dropdown' : '+ Add new school'}
              </button>
            </div>
            {addingSchool ? (
              <div
                className="mt-1 grid gap-3 rounded-md border border-dashed border-brand-navy/30 bg-brand-teal/5 p-3 sm:grid-cols-2"
                data-testid="inline-school-create-panel"
              >
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    New school name <span className="text-signal-alert">*</span>
                  </span>
                  <input
                    type="text"
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    aria-label="New school name"
                    data-testid="new-school-name"
                    className={fieldClass}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    The id is generated from the name on save (e.g. Christ Mission School →
                    {' '}SCH-CHRIST_MISSION_SCHOOL).
                  </span>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Region <span className="text-signal-alert">*</span>
                  </span>
                  <select
                    value={newSchoolRegion}
                    onChange={(e) =>
                      setNewSchoolRegion(e.target.value as '' | 'East' | 'North' | 'South-West')
                    }
                    aria-label="Region for new school"
                    data-testid="new-school-region"
                    className={fieldClass}
                  >
                    <option value="">{'- Pick a region -'}</option>
                    <option value="East">East</option>
                    <option value="North">North</option>
                    <option value="South-West">South-West</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    City <span className="text-xs font-normal italic text-muted-foreground">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={newSchoolCity}
                    onChange={(e) => setNewSchoolCity(e.target.value)}
                    aria-label="City for new school"
                    data-testid="new-school-city"
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    State <span className="text-xs font-normal italic text-muted-foreground">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={newSchoolState}
                    onChange={(e) => setNewSchoolState(e.target.value)}
                    aria-label="State for new school"
                    data-testid="new-school-state"
                    className={fieldClass}
                  />
                </label>
                {(!newSchoolCity || !newSchoolState) ? (
                  <p className="sm:col-span-2 text-xs text-amber-700">
                    City / state left blank will save as incomplete. The school will surface
                    in the admin cleanup view for later editing.
                  </p>
                ) : null}
              </div>
            ) : (
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                aria-label="Pick a school"
                className={'mt-1 ' + fieldClass}
              >
                <option value="">{'- Pick a school -'}</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {'·'} {s.city}, {s.state}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="block">
            <span className={labelClass}>Effective date</span>
            <input
              type="date"
              value={values.EFFECTIVE_DATE ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, EFFECTIVE_DATE: e.target.value }))}
              aria-label="Effective date"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>School name (as on contract)</span>
            <input
              type="text"
              value={values.SCHOOL_NAME ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, SCHOOL_NAME: e.target.value }))}
              aria-label="School name"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Start date</span>
            <input
              type="date"
              value={values.START_DATE ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, START_DATE: e.target.value }))}
              aria-label="Start date"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>End date</span>
            <input
              type="date"
              value={values.END_DATE ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, END_DATE: e.target.value }))}
              aria-label="End date"
              className={fieldClass}
            />
          </label>
          <div className="block sm:col-span-2 text-xs text-foreground">
            Duration: <strong>{durationLabel(startDate, endDate) || '-'}</strong>
            {numberOfYears > 0 && (
              <span className="ml-2 text-muted-foreground">
                ({numberOfYears} year{numberOfYears === 1 ? '' : 's'})
              </span>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          Sales tagging
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Sales channel</span>
            <select
              value={salesChannel}
              onChange={(e) => setSalesChannel(e.target.value as SalesChannel)}
              aria-label="Sales channel"
              className={fieldClass}
            >
              {SALES_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Sales representative</span>
            <select
              value={salesPersonId}
              onChange={(e) => setSalesPersonId(e.target.value)}
              aria-label="Sales representative"
              className={fieldClass}
            >
              <option value="">{'- None -'}</option>
              {programmeSalesTeam.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                  {sp.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>School ID (CRM reference, optional)</span>
            <input
              type="text"
              value={crmSchoolId}
              onChange={(e) => setCrmSchoolId(e.target.value)}
              placeholder="e.g. SF-12345"
              aria-label="CRM school id"
              className={fieldClass}
            />
          </label>
          <fieldset className="block">
            <legend className={labelClass}>Trainer model</legend>
            <div className="mt-1 flex flex-col gap-1.5">
              {TRAINER_MODELS.map((t) => (
                <label key={t.value} className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="trainerModel"
                    value={t.value}
                    checked={trainerModel === t.value}
                    onChange={(e) => setTrainerModel(e.target.value as TrainerModel)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          Annexure A {'-'} commercial terms
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {annexureFields.map(([name, spec]) => (
            <label key={name} className="block">
              <span className={labelClass}>
                {spec.label}
                {spec.required && <span className="ml-1 text-signal-alert">*</span>}
              </span>
              <input
                type={spec.type === 'date' ? 'date' : 'text'}
                value={values[name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                placeholder={spec.placeholder}
                aria-label={spec.label}
                className={fieldClass}
              />
            </label>
          ))}
        </div>
        {rateWarning && (
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{rateWarning}</span>
          </div>
        )}
        <label className="mt-4 block">
          <span className={labelClass}>Annexure free text (optional)</span>
          <textarea
            value={annexureRaw}
            onChange={(e) => setAnnexureRaw(e.target.value)}
            rows={5}
            placeholder="Add scope, deliverables, sub-clauses, etc. Each new line becomes a paragraph in the .docx."
            aria-label="Annexure free text"
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
        </label>
      </fieldset>

      {numberOfYears > 1 && (
        <fieldset className="rounded-lg border border-border bg-card p-5">
          <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
            Year-wise pricing ({numberOfYears} years)
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Year 1 reflects the PRICE_PER_STUDENT entered in Annexure A. Override Year 2 onwards if
            pricing differs by year. Total contract value is the sum of (students × each year&apos;s
            price with GST).
          </p>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 text-left font-medium">Year</th>
                <th className="px-1 py-1 text-right font-medium">Per student (without GST)</th>
                <th className="px-1 py-1 text-right font-medium">Per student (with GST)</th>
              </tr>
            </thead>
            <tbody>
              {yearlyPricing.map((row, yearIdx) => (
                <tr key={row.year}>
                  <td className="px-1 py-1 font-medium text-foreground">Year {row.year}</td>
                  <td className="px-1 py-1 text-right">
                    <input
                      type="number"
                      value={row.spWithoutTax || ''}
                      readOnly
                      aria-label={`Year ${row.year} price without GST (derived from with-GST)`}
                      title="Auto-calculated from the with-GST price using the company GST rate."
                      className="w-32 min-h-9 rounded border border-input bg-muted/40 px-2 py-1 text-right tabular-nums opacity-70"
                      min={0}
                    />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <input
                      type="number"
                      value={row.spWithTax || ''}
                      onChange={(e) =>
                        updateYearlyPricing(yearIdx, 'spWithTax', parseFloat(e.target.value) || 0)
                      }
                      aria-label={`Year ${row.year} price with GST`}
                      readOnly={yearIdx === 0}
                      className={
                        'w-32 min-h-9 rounded border border-input bg-card px-2 py-1 text-right tabular-nums ' +
                        (yearIdx === 0 ? 'opacity-70' : '')
                      }
                      min={0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      )}

      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          Payment schedule ({numberOfYears || 0} {numberOfYears === 1 ? 'year' : 'years'})
        </legend>
        {numberOfYears === 0 && (
          <p className="text-sm text-muted-foreground">
            Pick start and end dates above to render a payment schedule per year.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {schedules.map((yr, yearIdx) => {
            const total = yr.instalments.reduce((s, x) => s + (Number.isFinite(x.pctDue) ? x.pctDue : 0), 0)
            const valid = Math.abs(total - 100) < 0.01
            return (
              <div key={yr.year} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-heading text-sm font-semibold text-brand-navy">Year {yr.year}</span>
                  <span
                    className={
                      'text-xs font-semibold ' +
                      (valid ? 'text-emerald-700' : 'text-signal-alert')
                    }
                  >
                    Total {total}%
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-1 py-1 text-left font-medium">Month</th>
                      <th className="px-1 py-1 text-right font-medium">% Due</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {yr.instalments.map((it, i) => {
                      const monthOptions = monthsForYear(startDate, yr.year, endDate)
                      const inRange = it.month === '' || monthOptions.includes(it.month)
                      return (
                        <tr key={i}>
                          <td className="px-1 py-1">
                            <select
                              value={inRange ? it.month : ''}
                              onChange={(e) => updateInstalment(yearIdx, i, 'month', e.target.value)}
                              aria-label={`Year ${yr.year} instalment ${i + 1} month`}
                              className="w-full min-h-9 rounded border border-input bg-card px-2 py-1"
                            >
                              <option value="">Pick a month</option>
                              {monthOptions.map((m) => (
                                <option key={m} value={m}>
                                  {formatMonthLabel(m)}
                                </option>
                              ))}
                            </select>
                            {!inRange && (
                              <span className="block text-[10px] text-amber-700">
                                {it.month} is outside the MOU duration. Pick again.
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input
                              type="number"
                              value={it.pctDue}
                              onChange={(e) => updateInstalment(yearIdx, i, 'pctDue', e.target.value)}
                              aria-label={`Year ${yr.year} instalment ${i + 1} percent`}
                              min={0}
                              max={100}
                              className="w-20 min-h-9 rounded border border-input bg-card px-2 py-1 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-1 py-1 text-right">
                            {yr.instalments.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeInstalment(yearIdx, i)}
                                aria-label={`Remove instalment ${i + 1} of year ${yr.year}`}
                                className="text-muted-foreground hover:text-signal-alert"
                              >
                                <Trash2 aria-hidden className="size-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => addInstalment(yearIdx)}
                  disabled={yr.instalments.length >= 4}
                  className="mt-2 inline-flex min-h-9 items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Plus aria-hidden className="size-3" /> Add instalment
                  {yr.instalments.length >= 4 && <span className="text-muted-foreground"> (max 4)</span>}
                </button>
              </div>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          Standard billing section
        </legend>
        <p className="mb-3 text-xs text-muted-foreground">
          Pre-filled from the school record where possible. Edit any field; both the .docx and the
          school record update on save.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <BillingField label="Billing Name (for invoice)" value={billing.billingName} onChange={(v) => setBilling((b) => ({ ...b, billingName: v }))} />
          <BillingField label="Billing Address with Pin Code" value={billing.billingAddress} onChange={(v) => setBilling((b) => ({ ...b, billingAddress: v }))} />
          <BillingField label="City and State (billing)" value={billing.billingCityState} onChange={(v) => setBilling((b) => ({ ...b, billingCityState: v }))} />
          <BillingField label="School Name (Ship To)" value={billing.shipToName} onChange={(v) => setBilling((b) => ({ ...b, shipToName: v }))} />
          <BillingField label="School Address with Pin Code (Ship To)" value={billing.shipToAddress} onChange={(v) => setBilling((b) => ({ ...b, shipToAddress: v }))} />
          <BillingField label="City and State (ship to)" value={billing.shipToCityState} onChange={(v) => setBilling((b) => ({ ...b, shipToCityState: v }))} />
          <BillingField label="School Email Id" value={billing.schoolEmail} onChange={(v) => setBilling((b) => ({ ...b, schoolEmail: v }))} />
          <BillingField label="Contact Person Name" value={billing.contactPersonName} onChange={(v) => setBilling((b) => ({ ...b, contactPersonName: v }))} />
          <BillingField label="Designation" value={billing.designation} onChange={(v) => setBilling((b) => ({ ...b, designation: v }))} />
          <BillingField label="Mobile No" value={billing.mobileNo} onChange={(v) => setBilling((b) => ({ ...b, mobileNo: v }))} />
          <BillingField label="Email Id" value={billing.contactEmail} onChange={(v) => setBilling((b) => ({ ...b, contactEmail: v }))} />
          <BillingField label="School Contact No" value={billing.schoolContactNo} onChange={(v) => setBilling((b) => ({ ...b, schoolContactNo: v }))} />
          <BillingField label="PAN No" value={billing.pan} onChange={(v) => setBilling((b) => ({ ...b, pan: v }))} />
          <BillingField label="GST No" value={billing.gst} onChange={(v) => setBilling((b) => ({ ...b, gst: v }))} />
        </div>
      </fieldset>

      <GradewiseSection
        productSelection={productSelection}
        gradewiseDistribution={gradewiseDistribution}
        onProductSelectionChange={setProductSelection}
        onGradewiseDistributionChange={setGradewiseDistribution}
        expanded={kitsSectionExpanded}
        onToggle={() => setKitsSectionExpanded((v) => !v)}
      />

      {validationError && (
        <div className="rounded border border-amber-500/40 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {validationError}
        </div>
      )}

      {serverError && (
        <div
          data-testid="wizard-server-error"
          className="space-y-2 rounded border border-signal-alert/40 bg-red-50 px-4 py-3 text-sm text-signal-alert"
        >
          <p>{serverError}</p>
          {generateState === 'error' ? (
            <p className="text-xs text-signal-alert/80">
              {'.docx generation is still being hardened (Phase 1.1). Save the draft and use the Word template at '}
              <code className="rounded bg-white px-1 py-0.5 text-[11px] text-brand-navy">
                public/mou-templates/{template.id.replace('-v3', '-v2.1')}.docx
              </code>
              {' as a manual fallback for now.'}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={saveState === 'saving'}
          data-testid="wizard-save-draft"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 disabled:opacity-60"
        >
          <Save aria-hidden className="size-4" /> {saveState === 'saving' ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={() => void generateDocx()}
          disabled={generateState === 'generating'}
          data-testid="wizard-generate-docx"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
        >
          <Save aria-hidden className="size-4" />{' '}
          {generateState === 'generating' ? 'Generating…' : 'Generate .docx'}
        </button>
        {saveState === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle aria-hidden className="size-3" /> Saved. Will reflect everywhere within ~5 minutes.
          </span>
        )}
        {generateState === 'generated' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700" data-testid="wizard-generate-success">
            <CheckCircle aria-hidden className="size-3" /> Generated. Check your downloads.
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="wizard-generate-fallback-hint">
          {'.docx generation is still being hardened. If the button errors, save the draft and download the Word template at '}
          <code className="rounded bg-white px-1 py-0.5 text-[11px] text-brand-navy">
            public/mou-templates/{template.id.replace('-v3', '-v2.1')}.docx
          </code>
          {'.'}
        </span>
      </div>
    </div>
  )
}

function BillingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
      />
    </label>
  )
}
