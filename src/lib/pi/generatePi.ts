/*
 * PI generation (Phase D1).
 *
 * Real implementation. Inputs: mouId + instalmentSeq + generatedBy.
 * The lib resolves school + MOU data, gates on GSTIN presence,
 * atomically increments the PI counter to obtain a unique PI number,
 * loads the .docx template from public/ops-templates/, fills it via
 * docxtemplater, builds + enqueues a Payment record, and appends a
 * `pi-issued` audit entry on the MOU.
 *
 * Failure modes:
 *  - `permission`             not Admin or Finance
 *  - `unknown-user`           session.sub not in users.json
 *  - `mou-not-found`
 *  - `school-not-found`
 *  - `wrong-status`           MOU not Active
 *  - `template-missing`       caller surfaces TemplateMissingError to operator
 *
 * W4-A.6: GSTIN no longer blocks PI generation. The DOCX renders the
 * literal "GSTIN: To be added" placeholder when school.gstNumber is
 * null or empty; Finance backfills the GSTIN later via
 * /schools/[id]/edit and the PI document gets re-issued (or
 * annotated) before GST filing. The pre-W4-A.6 'gstin-required'
 * failure branch is removed; tests previously covering it now assert
 * the placeholder path.
 *
 * Counter monotonicity is preserved: issuePiNumberAtomic is called
 * BEFORE any other write, and the API route reads the returned
 * piNumber into the docx. Re-rendering the same PI uses the same
 * Payment.id (`<mouId>-i<seq>`) so retries do not duplicate.
 *
 * Idempotency divergence vs raiseDispatch: this lib advances the PI
 * counter on every successful call (no per-call idempotency by
 * design). PI numbers have external significance (GST filing, legal
 * documents); a duplicate click creates a counter gap rather than
 * re-rendering the same PI. raiseDispatch.ts intentionally differs
 * (idempotent re-render). Phase 1.1 may add per-(mouId,
 * instalmentSeq) lookup to suppress duplicates pre-counter-advance
 * if testers report accidental duplicates. See RUNBOOK section 10
 * "PI vs Dispatch idempotency divergence".
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
import usersJson from '@/data/users.json'
import companyJson from '../../../config/company.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { issuePiNumberAtomic } from '@/lib/githubQueue'
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
    }
  | { ok: false; reason: GeneratePiFailureReason; templateError?: TemplateMissingError }

export interface GeneratePiDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
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
  // '25-25-25-25 quarterly' -> 4. Falls back to 1 when unparseable.
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

export async function generatePi(
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
  // W4-A.6: GSTIN-missing no longer blocks. Finance backfills via the
  // school edit form; the DOCX renders a "To be added" placeholder
  // until then.
  const renderedGstin = (school.gstNumber !== null && school.gstNumber.trim() !== '')
    ? school.gstNumber
    : 'To be added'

  // Atomic counter advance is the FIRST write. If anything below fails
  // the counter has still moved, but PI numbers gap; never duplicate.
  const { piNumber } = await deps.issueCounter()
  const ts = deps.now().toISOString()

  const totalInsts = totalInstallments(mou.paymentSchedule)
  const instalmentLabel = `${args.instalmentSeq} of ${totalInsts}`
  const studentsForBilling = mou.studentsActual ?? mou.studentsMou
  const subtotal = studentsForBilling * mou.spWithoutTax
  const gstAmount = Math.round(subtotal * deps.company.gstRate)
  const total = subtotal + gstAmount
  const expectedAmount = Math.round(mou.contractValue / totalInsts)

  const lineItems: LineItem[] = [
    {
      description: `${mou.programme}${mou.programmeSubType ? ` (${mou.programmeSubType})` : ''} - Instalment ${instalmentLabel}`,
      students: studentsForBilling,
      rate: mou.spWithoutTax,
      amount: subtotal,
    },
  ]

  // Build placeholder bag for docxtemplater. Multi-line addresses are
  // joined by newline; the template's table loop reads LINE_ITEMS.
  const placeholderBag = {
    PI_NUMBER: piNumber,
    PI_DATE: formatDate(ts),
    SCHOOL_NAME: school.legalEntity ?? school.name,
    SCHOOL_GSTIN: renderedGstin,
    SCHOOL_ADDRESS: [
      school.name,
      `${school.city}, ${school.state}`,
      school.pinCode ?? '',
    ].filter((s) => s !== '').join('\n'),
    GSL_LEGAL_ENTITY: deps.company.legalEntity,
    GSL_GSTIN: deps.company.gstin,
    GSL_ADDRESS: deps.company.address.join('\n'),
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
    PAYMENT_TERMS: deps.company.paymentTerms,
    ACCOUNT_DETAILS: deps.company.accountDetails.join('\n'),
  }

  let docxBytes: Uint8Array
  try {
    const templateBytes = await deps.loadTemplate(PI_TEMPLATE.file)
    const zip = new PizZip(templateBytes)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
    doc.render(placeholderBag)
    const out = doc.getZip().generate({ type: 'uint8array' })
    docxBytes = out as unknown as Uint8Array
  } catch (err) {
    if (err instanceof TemplateMissingError) {
      return { ok: false, reason: 'template-missing', templateError: err }
    }
    throw err
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
    id: `${mou.id}-i${args.instalmentSeq}`,
    mouId: mou.id,
    schoolName: school.name,
    programme: mou.programme,
    instalmentLabel,
    instalmentSeq: args.instalmentSeq,
    totalInstalments: totalInsts,
    description: lineItems[0]!.description,
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

  return { ok: true, piNumber, payment, docxBytes }
}
