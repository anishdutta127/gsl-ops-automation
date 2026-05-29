/*
 * Direct-write helpers for entity JSON files. Phase 3 retired the
 * sync runner that used to consume `pending_updates.json`; routes now
 * write to the target entity directly via the GitHub Contents API
 * (atomicUpdateJson) so changes show up after the next Vercel rebuild.
 *
 * Each helper:
 *   - reads the current file (or starts from the given default),
 *   - applies a focused mutation,
 *   - returns the new array + commit sha.
 *
 * Conflict handling lives in atomicUpdateJson: 409s retry up to three
 * times with jittered backoff and the mutate callback is re-invoked on
 * each attempt so concurrent writers always see fresh state.
 *
 * Helpers below cover the four broken modules from Pranav's feedback
 * (Save Draft, Log Payment, Agreements, Sales Team) plus signed-values,
 * MOU reassignment, VEX status and VEX import; the remaining queue
 * callers (installments/update, pi/generate piIssue) ride along.
 */

import crypto from 'node:crypto'
import { atomicUpdateJson } from '@/lib/githubQueue'
import { currentBackend } from '@/lib/db/backend'
import { paidAmount, deriveStatus } from './installments'
import type {
  Adjustment,
  AdjustmentTrigger,
  Agreement,
  AgreementType,
  AuditEntry,
  GradewiseDistributionRow,
  MouBillingBlock,
  MOU,
  MouStatus,
  PartialPaymentEntry,
  Payment,
  PaymentLog,
  PaymentMode,
  ProductSelection,
  Programme,
  SalesChannel,
  SalesPerson,
  SalesProgramme,
  SignedValues,
  TrainerModel,
  VexDispatch,
  VexDispatchItem,
  VexDispatchMode,
  VexDispatchStatusV3,
  VexOrder,
  VexPi,
  VexPiLineItem,
  VexPiStatus,
  YearPaymentSchedule,
  YearlyPricingRow,
} from './types'
import { computeContractValue, deriveSpWithoutTax } from './pricing'

const MOUS_PATH = 'src/data/mous.json'
const SCHOOLS_PATH = 'src/data/schools.json'
const PAYMENTS_PATH = 'src/data/payments.json'
const PAYMENT_LOG_PATH = 'src/data/payment_log.json'
const AGREEMENTS_PATH = 'src/data/agreements.json'
const SALES_TEAM_PATH = 'src/data/sales_team.json'
const SIGNED_VALUES_PATH = 'src/data/signed_values.json'
const VEX_ORDERS_PATH = 'src/data/vex_orders.json'
const VEX_PIS_PATH = 'src/data/vex_pis.json'
const VEX_DISPATCHES_PATH = 'src/data/vex_dispatches.json'
const ADJUSTMENTS_PATH = 'src/data/adjustments.json'

function nowIso(): string {
  return new Date().toISOString()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function uuid(): string {
  return crypto.randomUUID()
}

function shortId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

// ----------------------------------------------------------------------------
// Agreements

export interface AgreementInput {
  id: string | null
  type: AgreementType
  partyName: string
  natureOfAgreement: string
  product: string | null
  department: string | null
  keyTerms: string | null
  startDate: string
  endDate: string | null
  tenure: string | null
  noticePeriod: string | null
  vendorLocation: string | null
  physicalCustody: 'Physical' | 'Digital' | null
  documentUrl: string | null
}

export async function upsertAgreement(
  identityName: string,
  input: AgreementInput,
): Promise<{ agreement: Agreement; commitSha: string }> {
  let result: Agreement | null = null
  const { commitSha } = await atomicUpdateJson<Agreement[]>(
    AGREEMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: input.id ? 'update' : 'create',
      }
      const days = input.endDate
        ? Math.round(
            (new Date(input.endDate).getTime() - Date.now()) / 86400000,
          )
        : null
      if (input.id) {
        const idx = list.findIndex((a) => a.id === input.id)
        if (idx >= 0) {
          const prev = list[idx]!
          const updated: Agreement = {
            ...prev,
            type: input.type,
            partyName: input.partyName,
            natureOfAgreement: input.natureOfAgreement,
            product: input.product,
            department: input.department,
            keyTerms: input.keyTerms,
            startDate: input.startDate,
            endDate: input.endDate,
            tenure: input.tenure,
            noticePeriod: input.noticePeriod,
            vendorLocation: input.vendorLocation,
            physicalCustody: input.physicalCustody,
            documentUrl: input.documentUrl,
            daysToExpiry: days,
            auditLog: [...(prev.auditLog ?? []), audit],
          }
          const next = [...list]
          next[idx] = updated
          result = updated
          return {
            next,
            commitMessage: `feat(agreements): update ${input.id}`,
          }
        }
      }
      const created: Agreement = {
        id: input.id ?? shortId('AGR'),
        type: input.type,
        partyName: input.partyName,
        natureOfAgreement: input.natureOfAgreement,
        product: input.product,
        department: input.department,
        keyTerms: input.keyTerms,
        startDate: input.startDate,
        endDate: input.endDate,
        tenure: input.tenure,
        noticePeriod: input.noticePeriod,
        vendorLocation: input.vendorLocation,
        physicalCustody: input.physicalCustody,
        documentUrl: input.documentUrl,
        daysToExpiry: days,
        auditLog: [audit],
      }
      result = created
      return {
        next: [...list, created],
        commitMessage: `feat(agreements): add ${created.id} (${created.partyName})`,
      }
    },
    { defaultValue: [] as Agreement[], maxRetries: 3 },
  )
  if (!result) throw new Error('upsertAgreement returned without a record')
  return { agreement: result, commitSha }
}

// ----------------------------------------------------------------------------
// Sales Team

export interface SalesPersonInput {
  name?: string
  email?: string
  phone?: string | null
  territories?: string[]
  programmes?: SalesProgramme[]
  active?: boolean
  joinedDate?: string
}

export async function createSalesPerson(
  identityName: string,
  input: SalesPersonInput,
): Promise<{ person: SalesPerson; commitSha: string }> {
  let result: SalesPerson | null = null
  const { commitSha } = await atomicUpdateJson<SalesPerson[]>(
    SALES_TEAM_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const slug = (input.name ?? 'rep')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'rep'
      let id = `sp-${slug}`
      let suffix = 1
      while (list.some((p) => p.id === id)) {
        suffix += 1
        id = `sp-${slug}-${suffix}`
      }
      const created: SalesPerson = {
        id,
        name: (input.name ?? '').trim(),
        email: (input.email ?? '').trim(),
        phone: input.phone?.trim() || null,
        territories: input.territories ?? [],
        programmes: input.programmes ?? [],
        active: input.active ?? true,
        joinedDate: input.joinedDate ?? todayIso(),
      }
      result = created
      return {
        next: [...list, created],
        commitMessage: `feat(sales-team): add ${id} (${created.name})`,
      }
    },
    { defaultValue: [] as SalesPerson[], maxRetries: 3 },
  )
  if (!result) throw new Error('createSalesPerson returned without a record')
  void identityName
  return { person: result, commitSha }
}

export async function updateSalesPerson(
  identityName: string,
  salesPersonId: string,
  fields: SalesPersonInput,
): Promise<{ person: SalesPerson; commitSha: string }> {
  let result: SalesPerson | null = null
  const { commitSha } = await atomicUpdateJson<SalesPerson[]>(
    SALES_TEAM_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((p) => p.id === salesPersonId)
      if (idx < 0) {
        throw new Error(`Sales person not found: ${salesPersonId}`)
      }
      const prev = list[idx]!
      const updated: SalesPerson = {
        ...prev,
        name: fields.name ?? prev.name,
        email: fields.email ?? prev.email,
        phone: fields.phone === undefined ? prev.phone : fields.phone,
        territories: fields.territories ?? prev.territories,
        programmes: fields.programmes ?? prev.programmes,
        active: fields.active ?? prev.active,
        joinedDate: fields.joinedDate ?? prev.joinedDate,
      }
      const next = [...list]
      next[idx] = updated
      result = updated
      return {
        next,
        commitMessage: `feat(sales-team): update ${salesPersonId}`,
      }
    },
    { defaultValue: [] as SalesPerson[], maxRetries: 3 },
  )
  if (!result) throw new Error('updateSalesPerson returned without a record')
  void identityName
  return { person: result, commitSha }
}

export async function deleteSalesPerson(
  identityName: string,
  salesPersonId: string,
): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<SalesPerson[]>(
    SALES_TEAM_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.filter((p) => p.id !== salesPersonId)
      return {
        next,
        commitMessage: `feat(sales-team): remove ${salesPersonId}`,
      }
    },
    { defaultValue: [] as SalesPerson[], maxRetries: 3 },
  )
  void identityName
  return { commitSha }
}

// ----------------------------------------------------------------------------
// Payment log + splits applied to payments.json

export interface PaymentSplit {
  installmentId: string
  amount: number
  bankAmount?: number
  tdsAmount?: number
}

export interface PaymentLogInput {
  identityName: string
  date: string
  amount: number
  mode: PaymentMode
  reference: string | null
  narration: string | null
  salesPersonId: string | null
  splits: PaymentSplit[]
  unmatched: boolean
}

export async function appendPaymentLog(
  input: PaymentLogInput,
): Promise<{ log: PaymentLog; commitSha: string }> {
  const log: PaymentLog = {
    id: uuid(),
    date: input.date,
    amount: input.amount,
    mode: input.mode,
    reference: input.reference,
    narration: input.narration,
    salesPersonId: input.salesPersonId,
    matchedInstallmentIds: input.splits.map((s) => s.installmentId),
    unmatched: input.unmatched,
    loggedBy: input.identityName,
    loggedAt: nowIso(),
    notes: null,
  }
  const { commitSha } = await atomicUpdateJson<PaymentLog[]>(
    PAYMENT_LOG_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, log],
        commitMessage: `feat(payments): log ${input.unmatched ? 'unmatched' : 'matched'} payment ${log.id.slice(0, 8)}`,
      }
    },
    { defaultValue: [] as PaymentLog[], maxRetries: 3 },
  )
  return { log, commitSha }
}

export async function applyPaymentSplits(
  paymentLogId: string,
  identityName: string,
  paymentDate: string,
  paymentMode: PaymentMode,
  reference: string | null,
  splits: PaymentSplit[],
): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<Payment[]>(
    PAYMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((p) => ({ ...p }))
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: 'update',
        notes: `payment-log ${paymentLogId.slice(0, 8)}`,
      }
      for (const split of splits) {
        const idx = next.findIndex((p) => p.id === split.installmentId)
        if (idx < 0) {
          throw new Error(
            `Installment ${split.installmentId} not found while applying payment ${paymentLogId}`,
          )
        }
        const target = next[idx]!
        const partials: PartialPaymentEntry[] = [
          ...(target.partialPayments ?? []),
          {
            date: paymentDate,
            amount: split.amount,
            mode: paymentMode,
            reference,
            notes:
              split.bankAmount != null && split.tdsAmount != null
                ? `bank Rs ${split.bankAmount.toLocaleString('en-IN')} + TDS Rs ${split.tdsAmount.toLocaleString('en-IN')}`
                : null,
            paymentLogId,
          },
        ]
        const updated: Payment = {
          ...target,
          partialPayments: partials,
          receivedAmount: paidAmount({ ...target, partialPayments: partials }),
          receivedDate: paymentDate,
          paymentMode,
          bankReference: reference ?? target.bankReference,
          auditLog: [...(target.auditLog ?? []), audit],
        }
        updated.status = deriveStatus(updated)
        next[idx] = updated
      }
      return {
        next,
        commitMessage: `feat(payments): apply ${splits.length} split(s) for payment-log ${paymentLogId.slice(0, 8)}`,
      }
    },
    { defaultValue: [] as Payment[], maxRetries: 3 },
  )
  return { commitSha }
}

// ----------------------------------------------------------------------------
// Save Draft MOU → mous.json

export interface DraftMouInput {
  identityName: string
  draftMouId: string | null
  templateId: string
  templateVersion: string | null
  programme: Programme
  schoolId: string | null
  schoolName: string
  variables: Record<string, string>
  annexureHtml: string | null
  // Phase 3 Step 4 fields
  trainerModel?: TrainerModel | null
  salesChannel?: SalesChannel | null
  salesPersonId?: string | null
  schoolCrmId?: string | null
  paymentSchedules?: YearPaymentSchedule[] | null
  yearlyPricing?: YearlyPricingRow[] | null
  billingBlock?: MouBillingBlock | null
  // Gate 3 Step 1: kits-dispatch enhancements. Optional at draft time.
  productSelection?: ProductSelection | null
  gradewiseDistribution?: GradewiseDistributionRow[] | null
}

function summarisePaymentSchedules(
  schedules: YearPaymentSchedule[] | null,
): string {
  if (!schedules || schedules.length === 0) return ''
  return schedules
    .map((y) => `Y${y.year}: ${y.instalments.map((i) => `${i.pctDue}%`).join('-')}`)
    .join(' · ')
}

function nextDraftSequence(programme: Programme, list: MOU[]): string {
  // Gate 2 Step 5 (sub-agent flag #4): explicit Robotics branch.
  // Pre-fix the ternary bucketed Robotics into HBPE; post-fix the
  // Robotics MOU id prefix is `MOU-ROBO-<fy>-DRAFT-<seq>`.
  const code =
    programme === 'STEAM'
      ? 'STEAM'
      : programme === 'Young Pioneers'
        ? 'YP'
        : programme === 'Robotics'
          ? 'ROBO'
          : 'HBPE'
  const fy = '2627'
  const prefix = `MOU-${code}-${fy}-DRAFT-`
  const taken = list
    .map((m) => m.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
  const next = (taken.length ? Math.max(...taken) : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

export async function saveDraftMou(
  input: DraftMouInput,
): Promise<{ mou: MOU; commitSha: string }> {
  // Postgres enforces the mous.school_id FK; an empty or non-existent
  // schoolId surfaces as `mous_school_id_fkey` instead of a friendly
  // error. Guard here so the API returns 400 with a clear message
  // and the wizard's serverError surface shows it to the user.
  const schoolIdTrimmed = (input.schoolId ?? '').trim()
  if (!schoolIdTrimmed) {
    throw new Error(
      'Pick a school from the dropdown before saving. If the school is new, create it via Admin → Schools first.',
    )
  }
  if (currentBackend() === 'postgres') {
    const { schoolRepo } = await import('@/lib/db/repos/school')
    const school = await schoolRepo.findById(schoolIdTrimmed)
    if (!school) {
      throw new Error(
        `School ${schoolIdTrimmed} not found. Pick a different school or create this one via Admin → Schools.`,
      )
    }
  }
  const audit: AuditEntry = {
    timestamp: nowIso(),
    user: input.identityName,
    action: input.draftMouId ? 'update' : 'create',
    notes: `Save draft via ${input.templateId}`,
  }
  const fy = '2026-27'
  const v = input.variables
  const toNum = (s: string | undefined) => {
    if (!s) return 0
    const n = parseFloat(s.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const studentsMou = toNum(v.NUMBER_OF_STUDENTS ?? v.STUDENTS ?? v.STUDENT_COUNT)
  // PRICE_PER_STUDENT is the with-GST entry in the template registry
  // (placeholder label: "Price per student (incl. GST)"). Derive the
  // without-GST counterpart top-down using the company GST rate so the
  // value matches the PI subtotal anchor (see deriveSpWithoutTax).
  const spWithTax = toNum(v.PRICE_PER_STUDENT_INCL_GST ?? v.PRICE_PER_STUDENT)
  const spWithoutTax = toNum(v.PRICE_PER_STUDENT_BEFORE_TAX) || deriveSpWithoutTax(spWithTax)
  const startDate = v.START_DATE ?? null
  const endDate = v.END_DATE ?? null
  let numberOfYears: number | null = null
  if (startDate && endDate) {
    const s = new Date(startDate)
    const e = new Date(endDate)
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s) {
      numberOfYears = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (365.25 * 86400000)))
    }
  }
  const contractValue = computeContractValue({
    studentsMou, spWithoutTax, spWithTax, numberOfYears,
    yearlyPricing: input.yearlyPricing ?? null,
  })

  function buildMou(targetId: string, prev: MOU | null): MOU {
    const base: MOU = {
      id: targetId,
      schoolId: schoolIdTrimmed,
      schoolName: input.schoolName,
      programme: input.programme,
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: 'Draft' as MouStatus,
      cohortStatus: 'active',
      delayNotes: null,
      academicYear: fy,
      startDate, endDate, studentsMou,
      studentsActual: null, studentsVariance: null, studentsVariancePct: null,
      spWithoutTax, spWithTax, contractValue,
      received: 0, tds: 0, balance: contractValue, receivedPct: 0,
      paymentSchedule: v.PAYMENT_SCHEDULE ?? summarisePaymentSchedules(input.paymentSchedules ?? null),
      trainerModel: input.trainerModel ?? null,
      notes: null, daysToExpiry: null,
      salesPersonId: input.salesPersonId ?? null,
      templateVersion: input.templateVersion ?? input.templateId,
      generatedAt: nowIso(),
      draftVariables: v,
      auditLog: [audit],
      effectiveDate: v.EFFECTIVE_DATE ?? null,
      numberOfYears,
      salesChannel: input.salesChannel ?? null,
      schoolCrmId: input.schoolCrmId ?? null,
      paymentSchedules: input.paymentSchedules ?? null,
      yearlyPricing: input.yearlyPricing ?? null,
      billingBlock: input.billingBlock ?? null,
      signedMouPdfPath: null,
      productSelection: input.productSelection ?? null,
      gradewiseDistribution: input.gradewiseDistribution ?? null,
    }
    let mou = prev ? { ...prev, ...base, auditLog: [...(prev.auditLog ?? []), audit] } : base
    if (input.annexureHtml !== null) {
      mou = { ...mou, draftVariables: { ...(mou.draftVariables ?? {}), _ANNEXURE_HTML: input.annexureHtml } }
    }
    return mou
  }

  if (currentBackend() === 'postgres') {
    const { mouRepo } = await import('@/lib/db/repos/mou')
    const allMous = await mouRepo.findAll()
    const targetId =
      input.draftMouId && allMous.some((m) => m.id === input.draftMouId && m.status === 'Draft')
        ? input.draftMouId
        : nextDraftSequence(input.programme, allMous)
    const prev = allMous.find((m) => m.id === targetId) ?? null
    const mou = buildMou(targetId, prev)
    if (prev) {
      await mouRepo.update(mou, { queuedBy: input.identityName })
    } else {
      await mouRepo.create(mou, { queuedBy: input.identityName })
    }
    return { mou, commitSha: 'postgres-direct' }
  }

  let result: MOU | null = null
  const { commitSha } = await atomicUpdateJson<MOU[]>(
    MOUS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const targetId =
        input.draftMouId && list.some((m) => m.id === input.draftMouId && m.status === 'Draft')
          ? input.draftMouId
          : nextDraftSequence(input.programme, list)
      const prev = list.find((m) => m.id === targetId) ?? null
      result = buildMou(targetId, prev)
      const idx = list.findIndex((m) => m.id === targetId)
      const nextList = idx >= 0 ? [...list.slice(0, idx), result, ...list.slice(idx + 1)] : [...list, result]
      return { next: nextList, commitMessage: `feat(mou): save draft ${targetId}` }
    },
    { defaultValue: [] as MOU[], maxRetries: 3 },
  )
  if (!result) throw new Error('saveDraftMou returned without a record')
  return { mou: result, commitSha }
}

// ----------------------------------------------------------------------------
// MOU updates (status, sales-person reassignment, generic field patch)

export async function updateMouFields(
  identityName: string,
  mouId: string,
  patch: Partial<MOU>,
  notes?: string,
): Promise<{ mou: MOU; commitSha: string }> {
  let result: MOU | null = null
  const { commitSha } = await atomicUpdateJson<MOU[]>(
    MOUS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((m) => m.id === mouId)
      if (idx < 0) throw new Error(`MOU not found: ${mouId}`)
      const prev = list[idx]!
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: patch.status && patch.status !== prev.status ? 'status_change' : 'update',
        before: extractFields(prev, Object.keys(patch) as (keyof MOU)[]),
        after: extractFields({ ...prev, ...patch } as MOU, Object.keys(patch) as (keyof MOU)[]),
        notes,
      }
      const next: MOU = {
        ...prev,
        ...patch,
        auditLog: [...(prev.auditLog ?? []), audit],
      }
      const nextList = [...list]
      nextList[idx] = next
      result = next
      return {
        next: nextList,
        commitMessage: `feat(mou): update ${mouId}`,
      }
    },
    { defaultValue: [] as MOU[], maxRetries: 3 },
  )
  if (!result) throw new Error('updateMouFields returned without a record')
  return { mou: result, commitSha }
}

function extractFields<T>(obj: T, keys: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    out[String(k)] = obj[k]
  }
  return out
}

export async function reassignMouSalesPerson(
  identityName: string,
  mouId: string,
  toSalesPersonId: string | null,
  notes?: string,
): Promise<{ mou: MOU; commitSha: string }> {
  return updateMouFields(
    identityName,
    mouId,
    { salesPersonId: toSalesPersonId },
    notes ?? 'sales person reassignment',
  )
}

// ----------------------------------------------------------------------------
// Signed values (per MOU)

export async function upsertSignedValues(
  identityName: string,
  mouId: string,
  values: {
    pricePerStudent: number
    studentCount: number
    duration: string
    signedDate: string
    signedScanUrl: string | null
    notes: string | null
  },
): Promise<{ commitSha: string }> {
  const entry: SignedValues = {
    mouId,
    signedDate: values.signedDate,
    signedBy: identityName,
    pricePerStudent: values.pricePerStudent,
    studentCount: values.studentCount,
    duration: values.duration,
    signedScanUrl: values.signedScanUrl,
    capturedAt: nowIso(),
    notes: values.notes,
  }

  if (currentBackend() === 'postgres') {
    const { getSql } = await import('@/lib/db/client')
    const sql = getSql()
    await sql`
      INSERT INTO signed_values (mou_id, signed_date, signed_by, price_per_student, student_count, duration, signed_scan_url, captured_at, notes)
      VALUES (${entry.mouId}, ${entry.signedDate}, ${entry.signedBy}, ${entry.pricePerStudent}, ${entry.studentCount}, ${1}, ${entry.signedScanUrl ?? null}, ${entry.capturedAt}, ${entry.notes ?? null})
      ON CONFLICT (mou_id) DO UPDATE SET
        signed_date = EXCLUDED.signed_date, signed_by = EXCLUDED.signed_by,
        price_per_student = EXCLUDED.price_per_student, student_count = EXCLUDED.student_count,
        duration = EXCLUDED.duration, signed_scan_url = EXCLUDED.signed_scan_url,
        captured_at = EXCLUDED.captured_at, notes = EXCLUDED.notes
    `
    return { commitSha: 'postgres-direct' }
  }

  const { commitSha } = await atomicUpdateJson<SignedValues[]>(
    SIGNED_VALUES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((s) => s.mouId === mouId)
      const next = [...list]
      if (idx >= 0) next[idx] = entry
      else next.push(entry)
      return { next, commitMessage: `feat(signed-values): record signed values for ${mouId}` }
    },
    { defaultValue: [] as SignedValues[], maxRetries: 3 },
  )
  return { commitSha }
}

// ----------------------------------------------------------------------------
// VEX orders

export async function applyVexStatus(
  identityName: string,
  orderId: string,
  patch: Partial<VexOrder>,
): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<VexOrder[]>(
    VEX_ORDERS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((o) => o.id === orderId)
      if (idx < 0) throw new Error(`VEX order not found: ${orderId}`)
      const prev = list[idx]!
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: 'update',
      }
      const updated: VexOrder = {
        ...prev,
        ...patch,
        auditLog: [...(prev.auditLog ?? []), audit],
      }
      const next = [...list]
      next[idx] = updated
      return {
        next,
        commitMessage: `feat(vex): update ${orderId}`,
      }
    },
    { defaultValue: [] as VexOrder[], maxRetries: 3 },
  )
  return { commitSha }
}

export async function appendVexOrders(
  identityName: string,
  orders: VexOrder[],
): Promise<{ commitSha: string; added: number }> {
  let added = 0
  const { commitSha } = await atomicUpdateJson<VexOrder[]>(
    VEX_ORDERS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const known = new Set(list.map((o) => o.id))
      const fresh = orders.filter((o) => !known.has(o.id))
      added = fresh.length
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: 'create',
        notes: `imported ${fresh.length} VEX order(s)`,
      }
      // Tag each new order with the audit entry before commit.
      const tagged = fresh.map((o) => ({ ...o, auditLog: [...(o.auditLog ?? []), audit] }))
      return {
        next: [...list, ...tagged],
        commitMessage: `feat(vex): import ${fresh.length} order(s)`,
      }
    },
    { defaultValue: [] as VexOrder[], maxRetries: 3 },
  )
  return { commitSha, added }
}

// ----------------------------------------------------------------------------
// VEX PIs (Phase 3b Step 11)

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface VexPiInput {
  identityName: string
  piNumber: string
  entityKey: 'MH' | 'UP'
  schoolName: string
  shippingAddress: string
  billingName: string
  billingAddress: string
  schoolGstNumber: string | null
  contactPerson: string
  contactNo: string
  lineItems: VexPiLineItem[]
  freightCharges: number
  gstPct: number
  notes: string | null
}

export async function createVexPi(
  input: VexPiInput,
): Promise<{ pi: VexPi; commitSha: string }> {
  let result: VexPi | null = null
  const { commitSha } = await atomicUpdateJson<VexPi[]>(
    VEX_PIS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const subtotal = round2(input.lineItems.reduce((s, x) => s + x.total, 0))
      const taxableValue = round2(subtotal + input.freightCharges)
      const gstAmount = round2(taxableValue * input.gstPct)
      const total = round2(taxableValue + gstAmount)
      const seq = list.filter((p) => p.entityKey === input.entityKey).length + 1
      const pi: VexPi = {
        id: `VEXPI-${input.entityKey}-2627-${String(seq).padStart(3, '0')}`,
        piNumber: input.piNumber,
        entityKey: input.entityKey,
        issueDate: todayIso(),
        schoolName: input.schoolName,
        shippingAddress: input.shippingAddress,
        billingName: input.billingName,
        billingAddress: input.billingAddress,
        schoolGstNumber: input.schoolGstNumber,
        contactPerson: input.contactPerson,
        contactNo: input.contactNo,
        lineItems: input.lineItems,
        subtotal,
        freightCharges: input.freightCharges,
        taxableValue,
        gstPct: input.gstPct,
        gstAmount,
        total,
        status: 'Generated' as VexPiStatus,
        generatedBy: input.identityName,
        generatedAt: nowIso(),
        paymentReceivedAmount: 0,
        paymentLogIds: [],
        notes: input.notes,
        auditLog: [
          { timestamp: nowIso(), user: input.identityName, action: 'create' },
        ],
      }
      result = pi
      return {
        next: [...list, pi],
        commitMessage: `feat(vex): create PI ${pi.piNumber} for ${pi.schoolName}`,
      }
    },
    { defaultValue: [] as VexPi[], maxRetries: 3 },
  )
  if (!result) throw new Error('createVexPi returned without a record')
  return { pi: result, commitSha }
}

export async function applyVexPiPatch(
  identityName: string,
  piId: string,
  patch: Partial<VexPi>,
  notes?: string,
  auditAfter?: Record<string, unknown>,
): Promise<{ pi: VexPi; commitSha: string }> {
  let result: VexPi | null = null
  const { commitSha } = await atomicUpdateJson<VexPi[]>(
    VEX_PIS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((p) => p.id === piId)
      if (idx < 0) throw new Error(`VEX PI not found: ${piId}`)
      const prev = list[idx]!
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: 'update',
        notes,
        ...(auditAfter ? { after: auditAfter } : {}),
      }
      const updated: VexPi = {
        ...prev,
        ...patch,
        auditLog: [...(prev.auditLog ?? []), audit],
      }
      result = updated
      const next = [...list]
      next[idx] = updated
      return {
        next,
        commitMessage: `feat(vex): update PI ${piId}`,
      }
    },
    { defaultValue: [] as VexPi[], maxRetries: 3 },
  )
  if (!result) throw new Error('applyVexPiPatch returned without a record')
  return { pi: result, commitSha }
}

// ----------------------------------------------------------------------------
// VEX Dispatches (Phase 3b Step 11.4)

export interface VexDispatchInput {
  identityName: string
  piId: string
  items: VexDispatchItem[]
  freight: number
  mode: VexDispatchMode
}

export async function createVexDispatch(
  input: VexDispatchInput,
): Promise<{ dispatch: VexDispatch; commitSha: string }> {
  let result: VexDispatch | null = null
  const { commitSha } = await atomicUpdateJson<VexDispatch[]>(
    VEX_DISPATCHES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const entityKey = input.piId.includes('-MH-') ? 'MH' : 'UP'
      const seq = list.filter((d) => d.id.includes(`-${entityKey}-`)).length + 1
      const dispatch: VexDispatch = {
        id: `VEXD-${entityKey}-2627-${String(seq).padStart(3, '0')}`,
        piId: input.piId,
        items: input.items,
        freight: input.freight,
        mode: input.mode,
        status: 'Requested' as VexDispatchStatusV3,
        requestedBy: input.identityName,
        requestedAt: nowIso(),
        taxInvoiceNumber: null,
        taxInvoicePath: null,
        invoicedAt: null,
        notes: null,
        supportingDocPath: null,
        warehouseEmailSentAt: null,
        warehouseEmailSentBy: null,
        auditLog: [
          { timestamp: nowIso(), user: input.identityName, action: 'create' },
        ],
      }
      result = dispatch
      return {
        next: [...list, dispatch],
        commitMessage: `feat(vex): dispatch ${dispatch.id} requested for PI ${input.piId}`,
      }
    },
    { defaultValue: [] as VexDispatch[], maxRetries: 3 },
  )
  if (!result) throw new Error('createVexDispatch returned without a record')
  return { dispatch: result, commitSha }
}

export async function applyVexDispatchPatch(
  identityName: string,
  dispatchId: string,
  patch: Partial<VexDispatch>,
  notes?: string,
): Promise<{ dispatch: VexDispatch; commitSha: string }> {
  let result: VexDispatch | null = null
  const { commitSha } = await atomicUpdateJson<VexDispatch[]>(
    VEX_DISPATCHES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((d) => d.id === dispatchId)
      if (idx < 0) throw new Error(`VEX dispatch not found: ${dispatchId}`)
      const prev = list[idx]!
      const audit: AuditEntry = {
        timestamp: nowIso(),
        user: identityName,
        action: 'update',
        notes,
      }
      const updated: VexDispatch = {
        ...prev,
        ...patch,
        auditLog: [...(prev.auditLog ?? []), audit],
      }
      result = updated
      const next = [...list]
      next[idx] = updated
      return {
        next,
        commitMessage: `feat(vex): update dispatch ${dispatchId}`,
      }
    },
    { defaultValue: [] as VexDispatch[], maxRetries: 3 },
  )
  if (!result) throw new Error('applyVexDispatchPatch returned without a record')
  return { dispatch: result, commitSha }
}

// ----------------------------------------------------------------------------
// Installment patches (PI issue, mark-pi-sent, mark-paid, partial, count)

export async function applyInstallmentPatch(
  identityName: string,
  installmentId: string,
  patch: Partial<Payment>,
  notes?: string,
): Promise<{ payment: Payment; commitSha: string }> {
  const audit: AuditEntry = {
    timestamp: nowIso(),
    user: identityName,
    action: 'update',
    notes,
  }

  if (currentBackend() === 'postgres') {
    const { paymentRepo } = await import('@/lib/db/repos/payment')
    const prev = await paymentRepo.findById(installmentId)
    if (!prev) throw new Error(`Installment not found: ${installmentId}`)
    const updated = { ...prev, ...patch, auditLog: [...((prev.auditLog ?? []) as AuditEntry[]), audit] } as Payment
    if ('partialPayments' in patch || 'receivedAmount' in patch || 'piSentDate' in patch) {
      updated.status = deriveStatus(updated)
    }
    await paymentRepo.update(updated, { queuedBy: identityName })
    return { payment: updated, commitSha: 'postgres-direct' }
  }

  let result: Payment | null = null
  const { commitSha } = await atomicUpdateJson<Payment[]>(
    PAYMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((p) => p.id === installmentId)
      if (idx < 0) throw new Error(`Installment not found: ${installmentId}`)
      const prev = list[idx]!
      const updated: Payment = { ...prev, ...patch, auditLog: [...(prev.auditLog ?? []), audit] }
      if ('partialPayments' in patch || 'receivedAmount' in patch || 'piSentDate' in patch) {
        updated.status = deriveStatus(updated)
      }
      const next = [...list]
      next[idx] = updated
      result = updated
      return { next, commitMessage: `feat(installment): patch ${installmentId}` }
    },
    { defaultValue: [] as Payment[], maxRetries: 3 },
  )
  if (!result) throw new Error('applyInstallmentPatch returned without a record')
  return { payment: result, commitSha }
}

// ----------------------------------------------------------------------------
// Schools (used by Phase 3 Step 4 standard billing block)

// ----------------------------------------------------------------------------
// Adjustments (Phase 3 Round 2 : adjustment-as-line-item)

export interface AdjustmentInput {
  mouId: string
  schoolId: string
  triggeredByEvent: AdjustmentTrigger
  triggeredBy: string
  originalInstallmentId: string
  appliedToInstallmentId: string | null
  amountDelta: number
  reason: string
  beforeAmount: number
  afterAmount: number
}

export async function appendAdjustments(
  inputs: AdjustmentInput[],
): Promise<{ added: Adjustment[]; commitSha: string }> {
  if (inputs.length === 0) {
    return { added: [], commitSha: '' }
  }
  const created: Adjustment[] = inputs.map((i) => ({
    id: shortId('ADJ'),
    mouId: i.mouId,
    schoolId: i.schoolId,
    triggeredByEvent: i.triggeredByEvent,
    triggeredAt: nowIso(),
    triggeredBy: i.triggeredBy,
    originalInstallmentId: i.originalInstallmentId,
    appliedToInstallmentId: i.appliedToInstallmentId,
    amountDelta: i.amountDelta,
    reason: i.reason,
    beforeAmount: i.beforeAmount,
    afterAmount: i.afterAmount,
    status: 'Active',
  }))
  const { commitSha } = await atomicUpdateJson<Adjustment[]>(
    ADJUSTMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, ...created],
        commitMessage: `feat(payments): record ${created.length} adjustment(s)`,
      }
    },
    { defaultValue: [] as Adjustment[], maxRetries: 3 },
  )
  return { added: created, commitSha }
}

// ----------------------------------------------------------------------------
// Bulk installment append (Phase 3 Round 2 : wired by upload-signed)

export async function appendInstallments(
  identityName: string,
  newInstallments: Payment[],
): Promise<{ added: number; commitSha: string }> {
  if (newInstallments.length === 0) {
    return { added: 0, commitSha: '' }
  }
  const audit: AuditEntry = {
    timestamp: nowIso(),
    user: identityName,
    action: 'create',
    notes: `generated ${newInstallments.length} installment(s) on signed-MOU upload`,
  }
  const tagged = newInstallments.map((p) => ({
    ...p,
    auditLog: [...(p.auditLog ?? []), audit],
  }))
  let added = 0
  const { commitSha } = await atomicUpdateJson<Payment[]>(
    PAYMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const known = new Set(list.map((p) => p.id))
      const fresh = tagged.filter((p) => !known.has(p.id))
      added = fresh.length
      return {
        next: [...list, ...fresh],
        commitMessage: `feat(payments): generate ${fresh.length} installment(s)`,
      }
    },
    { defaultValue: [] as Payment[], maxRetries: 3 },
  )
  return { added, commitSha }
}

// ----------------------------------------------------------------------------
// Bulk installment patch (atomic across several rows in one commit)

export interface InstallmentBulkPatch {
  installmentId: string
  patch: Partial<Payment>
  notes?: string
}

export async function applyInstallmentBulkPatch(
  identityName: string,
  patches: InstallmentBulkPatch[],
  commitMessage: string,
): Promise<{ commitSha: string; touched: number }> {
  if (patches.length === 0) return { commitSha: '', touched: 0 }
  let touched = 0
  const { commitSha } = await atomicUpdateJson<Payment[]>(
    PAYMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((p) => ({ ...p }))
      for (const { installmentId, patch, notes } of patches) {
        const idx = next.findIndex((p) => p.id === installmentId)
        if (idx < 0) continue
        const prev = next[idx]!
        const audit: AuditEntry = {
          timestamp: nowIso(),
          user: identityName,
          action: 'update',
          before: { expectedAmount: prev.expectedAmount },
          after: { expectedAmount: patch.expectedAmount ?? prev.expectedAmount },
          notes,
        }
        const updated: Payment = {
          ...prev,
          ...patch,
          auditLog: [...(prev.auditLog ?? []), audit],
        }
        if (
          'partialPayments' in patch ||
          'receivedAmount' in patch ||
          'piSentDate' in patch ||
          'expectedAmount' in patch
        ) {
          updated.status = deriveStatus(updated)
        }
        next[idx] = updated
        touched += 1
      }
      return { next, commitMessage }
    },
    { defaultValue: [] as Payment[], maxRetries: 3 },
  )
  return { commitSha, touched }
}

export async function upsertSchoolFields(
  identityName: string,
  schoolId: string,
  patch: Record<string, unknown>,
  notes?: string,
): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<Record<string, unknown>[]>(
    SCHOOLS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((s) => (s as { id?: string }).id === schoolId)
      const next = [...list]
      const auditKeys = Object.keys(patch).filter((k) => k !== 'auditLog')
      if (idx >= 0) {
        const prev = next[idx] as Record<string, unknown>
        const before: Record<string, unknown> = {}
        const after: Record<string, unknown> = {}
        for (const k of auditKeys) {
          before[k] = prev[k] ?? null
          after[k] = patch[k] ?? null
        }
        const audit: AuditEntry = {
          timestamp: nowIso(),
          user: identityName,
          action: 'update',
          before,
          after,
          notes,
        }
        const prevAudit = Array.isArray(prev.auditLog) ? (prev.auditLog as AuditEntry[]) : []
        next[idx] = { ...prev, ...patch, auditLog: [...prevAudit, audit] }
      } else {
        const audit: AuditEntry = {
          timestamp: nowIso(),
          user: identityName,
          action: 'create',
          notes,
        }
        next.push({ id: schoolId, ...patch, auditLog: [audit] })
      }
      return {
        next,
        commitMessage: `feat(schools): patch ${schoolId}`,
      }
    },
    { defaultValue: [] as Record<string, unknown>[], maxRetries: 3 },
  )
  return { commitSha }
}
