/*
 * PI generation (Phase D1) + render-only split (Gate 5A Step 2).
 *
 * Two public entry points:
 *   - renderPi(args)             pure render. NO counter advance, NO
 *                                Payment enqueue, NO audit. Used by
 *                                /finance/pi/[paymentId] Download for
 *                                already-issued PIs.
 *   - issueAndRenderPi(args)     advances the per-entity counter, builds
 *                                + enqueues the Payment record, appends
 *                                'pi-issued' audit on the MOU, returns
 *                                the rendered .docx. Idempotent: if a
 *                                Payment already exists for the
 *                                (mouId, instalmentSeq) pair with a
 *                                piNumber set, falls through to renderPi
 *                                behaviour so the counter does not
 *                                burn a fresh number on a duplicate
 *                                click.
 *
 * `generatePi` is preserved as a deprecated alias for issueAndRenderPi
 * to keep historical call sites + tests working.
 *
 * Counter monotonicity: issuePiNumberAtomic is called BEFORE any other
 * write in the issue path. Re-issuing the same PI via /finance/pi/.../
 * reissue advances the counter (per-issue is the legal convention);
 * Download re-rendering does NOT.
 *
 * Failure modes (issueAndRenderPi):
 *  - `permission`             not Admin or Finance
 *  - `unknown-user`           session.sub not in users.json
 *  - `mou-not-found`
 *  - `school-not-found`
 *  - `wrong-status`           MOU not Active
 *  - `template-missing`       caller surfaces TemplateMissingError to operator
 *
 * Failure modes (renderPi):
 *  - `payment-not-found`      paymentId not in payments.json
 *  - `payment-missing-pi-number` Payment row has piNumber === null
 *  - `mou-not-found`
 *  - `school-not-found`
 *  - `template-missing`
 *
 * W4-A.6: GSTIN no longer blocks PI generation. The DOCX renders the
 * literal "GSTIN: To be added" placeholder when school.gstNumber is
 * null or empty; Finance backfills the GSTIN later via
 * /schools/[id]/edit and the PI document gets re-issued (or
 * annotated) before GST filing.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import type {
  AuditEntry,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import paymentsJson from '@/data/payments.json'
import usersJson from '@/data/users.json'
import companyJson from '../../../config/company.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { issuePiNumberAtomic } from '@/lib/mouSystem/piCounterAtomic'
import { getEntityForProgramme, getEntity } from '@/lib/mouSystem/company'
import { canPerform } from '@/lib/auth/permissions'
import { formatRs, formatDate } from '@/lib/format'
import { PI_TEMPLATE, TemplateMissingError } from './templates'

interface CompanyConfig {
  legalEntity: string
  gstin: string
  address: string[]
  accountDetails: string[]
  paymentTerms: string
  gstRate: number
}

export interface GeneratePiArgs {
  mouId: string
  instalmentSeq: number
  generatedBy: string
}

export type GeneratePiFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'school-not-found'
  | 'wrong-status'
  | 'template-missing'

export type GeneratePiResult =
  | {
      ok: true
      piNumber: string
      payment: Payment
      docxBytes: Uint8Array
      /** True when the call short-circuited via idempotency (existing
       *  payment + piNumber already on record); no counter advance,
       *  no enqueue, no audit. False on first-ever issue. */
      reissued?: boolean
    }
  | { ok: false; reason: GeneratePiFailureReason; templateError?: TemplateMissingError }

export interface GeneratePiDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
  payments: Payment[]
  company: CompanyConfig
  enqueue: typeof enqueueUpdate
  issueCounter: typeof issuePiNumberAtomic
  loadTemplate: (templatePath: string) => Promise<Uint8Array>
  now: () => Date
}

const defaultLoadTemplate = async (templatePath: string): Promise<Uint8Array> => {
  const fullPath = path.join(process.cwd(), templatePath)
  try {
    return await readFile(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new TemplateMissingError(PI_TEMPLATE.id, PI_TEMPLATE.file)
    }
    throw err
  }
}

const defaultDeps: GeneratePiDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  payments: paymentsJson as unknown as Payment[],
  company: companyJson as CompanyConfig,
  enqueue: enqueueUpdate,
  issueCounter: issuePiNumberAtomic,
  loadTemplate: defaultLoadTemplate,
  now: () => new Date(),
}

interface LineItem {
  description: string
  students: number
  rate: number
  amount: number
}

function totalInstallments(paymentSchedule: string): number {
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

function buildPlaceholderBag(args: {
  piNumber: string
  piDateIso: string
  mou: MOU
  school: School
  company: CompanyConfig
  entity: ReturnType<typeof getEntity>
  studentsForBilling: number
  subtotal: number
  gstAmount: number
  total: number
  instalmentLabel: string
  /** Phase 5: optional MOU-wide instalment list for the summary table. */
  allInstallmentsForMou?: Payment[]
  /** Phase 5: optional currently-issued payment id so the table can flag "this invoice". */
  thisPaymentId?: string
}): Record<string, unknown> {
  const { piNumber, piDateIso, mou, school, company, entity,
    studentsForBilling, subtotal, gstAmount, total, instalmentLabel,
    allInstallmentsForMou, thisPaymentId } = args

  const renderedGstin = (school.gstNumber !== null && school.gstNumber.trim() !== '')
    ? school.gstNumber
    : 'To be added'

  const lineItems: LineItem[] = [
    {
      description: `${mou.programme}${mou.programmeSubType ? ` (${mou.programmeSubType})` : ''} - Instalment ${instalmentLabel}`,
      students: studentsForBilling,
      rate: mou.spWithoutTax,
      amount: subtotal,
    },
  ]

  // Phase 5 (2026-05-19, Pranav review #5): instalment summary table.
  // The PI document now carries a table of every instalment for the
  // parent MOU with status (Paid / This invoice / Due) and amount.
  // The placeholder bag exposes `INSTALMENT_SUMMARY` for the docx
  // template's `{#INSTALMENT_SUMMARY}...{/INSTALMENT_SUMMARY}` loop;
  // the template binary must be updated separately. The
  // `CONTRACT_TOTAL_AT_CURRENT_COUNT` and `TOTAL_RECEIVED_TO_DATE`
  // placeholders below the loop carry the footer numbers.
  const sortedAll = (allInstallmentsForMou ?? [])
    .slice()
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
  const installmentSummary = sortedAll.map((p) => {
    const dueDate = p.dueDateIso ? formatDate(p.dueDateIso) : (p.dueDateRaw ?? '-')
    const isCurrent = thisPaymentId === p.id
    const isPaid = p.receivedAmount !== null && p.receivedAmount > 0
    const status = isPaid
      ? `Paid${p.receivedDate ? ` (${formatDate(p.receivedDate)})` : ''}`
      : isCurrent
        ? 'This invoice'
        : 'Due'
    const amount = (() => {
      if (typeof p.netDue === 'number' && p.netDue !== p.expectedAmount) return p.netDue
      if (isPaid && p.receivedAmount !== null) return p.receivedAmount
      return p.expectedAmount
    })()
    const breakdown =
      typeof p.nominalAmount === 'number' &&
      typeof p.adjustmentFromLockedInstallments === 'number' &&
      p.adjustmentFromLockedInstallments !== 0
        ? `Nominal ${formatRs(p.nominalAmount)} ${p.adjustmentFromLockedInstallments < 0 ? 'less excess credit' : 'plus shortfall catchup'} ${formatRs(Math.abs(p.adjustmentFromLockedInstallments))}`
        : ''
    return {
      seq: String(p.instalmentSeq),
      label: p.instalmentLabel,
      dueDate,
      status,
      amount: formatRs(amount),
      breakdown,
      isCurrent,
      isPaid,
    }
  })
  const contractTotalAtCurrentCount = sortedAll.reduce((s, p) => {
    const isPaid = p.receivedAmount !== null && p.receivedAmount > 0
    const amount = (() => {
      if (typeof p.netDue === 'number' && p.netDue !== p.expectedAmount) return p.netDue
      if (isPaid && p.receivedAmount !== null) return p.receivedAmount
      return p.expectedAmount
    })()
    return s + amount
  }, 0)
  const totalReceivedToDate = sortedAll.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)

  return {
    PI_NUMBER: piNumber,
    PI_DATE: formatDate(piDateIso),
    SCHOOL_NAME: school.legalEntity ?? school.name,
    SCHOOL_GSTIN: renderedGstin,
    SCHOOL_ADDRESS: [
      school.name,
      `${school.city}, ${school.state}`,
      school.pinCode ?? '',
    ].filter((s) => s !== '').join('\n'),
    GSL_LEGAL_ENTITY: company.legalEntity,
    GSL_GSTIN: entity.gstin,
    GSL_ADDRESS: entity.address,
    PROGRAMME: mou.programme,
    PROGRAMME_SUB_TYPE: mou.programmeSubType ?? '',
    LINE_ITEMS: lineItems.map((li) => ({
      description: li.description,
      students: String(li.students),
      rate: formatRs(li.rate),
      amount: formatRs(li.amount),
    })),
    SUBTOTAL: formatRs(subtotal),
    GST_AMOUNT: formatRs(gstAmount),
    TOTAL: formatRs(total),
    INSTALLMENT_LABEL: `Instalment ${instalmentLabel}`,
    PAYMENT_TERMS: company.paymentTerms,
    ACCOUNT_DETAILS: company.accountDetails.join('\n'),
    INSTALMENT_SUMMARY: installmentSummary,
    CONTRACT_TOTAL_AT_CURRENT_COUNT: formatRs(contractTotalAtCurrentCount),
    TOTAL_RECEIVED_TO_DATE: formatRs(totalReceivedToDate),
    CURRENT_STUDENT_COUNT: String(studentsForBilling),
  }
}

async function renderDocxFromBag(
  bag: Record<string, unknown>,
  loadTemplate: GeneratePiDeps['loadTemplate'],
): Promise<{ ok: true; docxBytes: Uint8Array } | { ok: false; templateError: TemplateMissingError }> {
  try {
    const templateBytes = await loadTemplate(PI_TEMPLATE.file)
    const zip = new PizZip(templateBytes)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
    doc.render(bag)
    const out = doc.getZip().generate({ type: 'uint8array' })
    return { ok: true, docxBytes: out as unknown as Uint8Array }
  } catch (err) {
    if (err instanceof TemplateMissingError) {
      return { ok: false, templateError: err }
    }
    throw err
  }
}

// ===========================================================================
// renderPi: pure render, no counter advance, no enqueue, no audit.
// ===========================================================================

export interface RenderPiArgs {
  /** Payment.id of the instalment whose piNumber should be rendered. */
  paymentId: string
}

export type RenderPiFailureReason =
  | 'payment-not-found'
  | 'payment-missing-pi-number'
  | 'mou-not-found'
  | 'school-not-found'
  | 'template-missing'

export type RenderPiResult =
  | { ok: true; piNumber: string; docxBytes: Uint8Array }
  | { ok: false; reason: RenderPiFailureReason; templateError?: TemplateMissingError }

export async function renderPi(
  args: RenderPiArgs,
  deps: GeneratePiDeps = defaultDeps,
): Promise<RenderPiResult> {
  const payment = deps.payments.find((p) => p.id === args.paymentId)
  if (!payment) return { ok: false, reason: 'payment-not-found' }
  if (!payment.piNumber) return { ok: false, reason: 'payment-missing-pi-number' }

  const mou = deps.mous.find((m) => m.id === payment.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const school = deps.schools.find((s) => s.id === mou.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  const entityKey = getEntityForProgramme(mou.programme)
  const entity = getEntity(entityKey)

  const totalInsts = totalInstallments(mou.paymentSchedule)
  const instalmentLabel = `${payment.instalmentSeq} of ${totalInsts}`
  const studentsForBilling = mou.studentsActual ?? mou.studentsMou
  const subtotal = studentsForBilling * mou.spWithoutTax
  const gstAmount = Math.round(subtotal * deps.company.gstRate)
  const total = subtotal + gstAmount

  const allInstallmentsForMou = deps.payments.filter((p) => p.mouId === mou.id)
  const bag = buildPlaceholderBag({
    piNumber: payment.piNumber,
    piDateIso: payment.piGeneratedAt ?? deps.now().toISOString(),
    mou, school, company: deps.company, entity,
    studentsForBilling, subtotal, gstAmount, total, instalmentLabel,
    allInstallmentsForMou,
    thisPaymentId: payment.id,
  })
  const r = await renderDocxFromBag(bag, deps.loadTemplate)
  if (!r.ok) return { ok: false, reason: 'template-missing', templateError: r.templateError }
  return { ok: true, piNumber: payment.piNumber, docxBytes: r.docxBytes }
}

// ===========================================================================
// issueAndRenderPi: advances counter, enqueues Payment + MOU update,
// writes 'pi-issued' audit, returns rendered .docx. Idempotent on
// duplicate (mouId, instalmentSeq) calls.
// ===========================================================================

export async function issueAndRenderPi(
  args: GeneratePiArgs,
  deps: GeneratePiDeps = defaultDeps,
): Promise<GeneratePiResult> {
  const user = deps.users.find((u) => u.id === args.generatedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:generate-pi')) {
    return { ok: false, reason: 'permission' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  if (mou.status !== 'Active') return { ok: false, reason: 'wrong-status' }

  const school = deps.schools.find((s) => s.id === mou.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  // Idempotency check: if a Payment row already exists for this
  // (mouId, instalmentSeq) AND has a piNumber, short-circuit to a
  // render-only path. Prevents a duplicate click burning a fresh PI
  // number off the counter.
  const expectedPaymentId = `${mou.id}-i${args.instalmentSeq}`
  const existing = deps.payments.find((p) => p.id === expectedPaymentId)
  if (existing && existing.piNumber) {
    const renderResult = await renderPi({ paymentId: expectedPaymentId }, deps)
    if (!renderResult.ok) {
      // The only render failure expected here is template-missing; the
      // other reasons were ruled out by the lookups above. Surface as
      // a GeneratePiResult shape so callers keep their existing
      // failure-handling logic intact.
      if (renderResult.reason === 'template-missing') {
        return { ok: false, reason: 'template-missing', templateError: renderResult.templateError }
      }
      // Should not happen; fall through to ok=false for safety.
      return { ok: false, reason: 'template-missing' }
    }
    return {
      ok: true,
      piNumber: existing.piNumber,
      payment: existing,
      docxBytes: renderResult.docxBytes,
      reissued: true,
    }
  }

  // First-ever issue. Advance counter atomically BEFORE any other
  // write. If anything below fails the counter has still moved, but
  // PI numbers gap; they never duplicate.
  const entityKey = getEntityForProgramme(mou.programme)
  const entity = getEntity(entityKey)
  const { piNumber } = await deps.issueCounter(entityKey)
  const ts = deps.now().toISOString()

  const totalInsts = totalInstallments(mou.paymentSchedule)
  const instalmentLabel = `${args.instalmentSeq} of ${totalInsts}`
  const studentsForBilling = mou.studentsActual ?? mou.studentsMou
  const subtotal = studentsForBilling * mou.spWithoutTax
  const gstAmount = Math.round(subtotal * deps.company.gstRate)
  const total = subtotal + gstAmount
  const expectedAmount = Math.round(mou.contractValue / totalInsts)

  const allInstallmentsForMou = deps.payments.filter((p) => p.mouId === mou.id)
  // The PI being minted right now is not in `deps.payments` yet (it's
  // being created in this very call); inject a synthetic placeholder
  // row at the right seq so the summary table shows "This invoice"
  // for the row about to be persisted.
  const summaryWithCurrentRow = allInstallmentsForMou.some((p) => p.instalmentSeq === args.instalmentSeq)
    ? allInstallmentsForMou
    : [
        ...allInstallmentsForMou,
        {
          id: expectedPaymentId,
          mouId: mou.id,
          schoolName: school.name,
          programme: mou.programme,
          instalmentLabel,
          instalmentSeq: args.instalmentSeq,
          totalInstalments: totalInsts,
          description: '',
          dueDateRaw: null,
          dueDateIso: null,
          expectedAmount,
          receivedAmount: null,
          receivedDate: null,
          paymentMode: null,
          bankReference: null,
          piNumber,
          taxInvoiceNumber: null,
          status: 'PI Sent' as const,
          notes: null,
          piSentDate: ts,
          piSentTo: null,
          piGeneratedAt: ts,
          studentCountActual: null,
          partialPayments: null,
          auditLog: [],
        } as Payment,
      ]
  const bag = buildPlaceholderBag({
    piNumber, piDateIso: ts, mou, school, company: deps.company, entity,
    studentsForBilling, subtotal, gstAmount, total, instalmentLabel,
    allInstallmentsForMou: summaryWithCurrentRow,
    thisPaymentId: expectedPaymentId,
  })
  const r = await renderDocxFromBag(bag, deps.loadTemplate)
  if (!r.ok) {
    return { ok: false, reason: 'template-missing', templateError: r.templateError }
  }

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.generatedBy,
    action: 'pi-issued',
    after: {
      piNumber,
      instalmentSeq: args.instalmentSeq,
      total,
    },
    notes: `Generated PI ${piNumber} for ${mou.id} instalment ${instalmentLabel}.`,
  }

  const updatedMou: MOU = {
    ...mou,
    auditLog: [...mou.auditLog, auditEntry],
  }

  const payment: Payment = {
    id: expectedPaymentId,
    mouId: mou.id,
    schoolName: school.name,
    programme: mou.programme,
    instalmentLabel,
    instalmentSeq: args.instalmentSeq,
    totalInstalments: totalInsts,
    description: `${mou.programme}${mou.programmeSubType ? ` (${mou.programmeSubType})` : ''} - Instalment ${instalmentLabel}`,
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber,
    taxInvoiceNumber: null,
    status: 'PI Sent',
    notes: null,
    piSentDate: ts,
    piSentTo: school.email,
    piGeneratedAt: ts,
    studentCountActual: mou.studentsActual,
    partialPayments: null,
    auditLog: [
      {
        timestamp: ts,
        user: args.generatedBy,
        action: 'create',
        notes: `Auto-created from PI generation (${piNumber}).`,
      },
    ],
  }

  await deps.enqueue({
    queuedBy: args.generatedBy,
    entity: 'payment',
    operation: 'create',
    payload: payment as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.generatedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  return { ok: true, piNumber, payment, docxBytes: r.docxBytes, reissued: false }
}

/**
 * @deprecated Use issueAndRenderPi. Preserved as an alias for back-compat
 * with existing call sites + the generatePi.test.ts fixture; future code
 * should call issueAndRenderPi directly so the intent is explicit.
 */
export const generatePi = issueAndRenderPi
