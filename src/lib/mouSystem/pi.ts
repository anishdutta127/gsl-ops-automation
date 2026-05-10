/*
 * PI (Proforma Invoice) domain logic.
 *
 * Generates a PI number from pi_counter.json (atomic through the queue),
 * composes the PDF via @react-pdf/renderer, and writes a matching Tally
 * XML voucher alongside.
 *
 * Phase 3 Step 3 locked GSTIN/HSN/PI prefix per entity. The MAF
 * Technologies Maharashtra (YP, Harvard, VEX-MH) and Uttar Pradesh
 * (STEAM, Robotics, VEX-UP) registrations live in config/company.json
 * and are loaded via lib/company.ts. Each entity has its own sequential
 * PI counter so the GST audit trail stays gap-free per GSTIN.
 */

import { issuePiNumberAtomic } from './piCounterAtomic'
import {
  company,
  getEntity,
  getEntityForProgramme,
  type EntityKey,
} from './company'
import type { Adjustment, MOU, Payment, PiCounterMap, Programme, School } from './types'

export interface PiLineItem {
  description: string
  hsn: string
  quantity: number
  ratePerUnit: number
  cgstPct: number
  sgstPct: number
  igstPct: number
  amount: number
}

/**
 * MOU statuses that are not allowed to issue a PI. Phase 3a P1 fix:
 * keep the list in one place so the route handler, the UI button, and
 * the unit tests agree on which statuses block PI generation.
 */
export const PI_BLOCKED_STATUSES = [
  'Draft',
  'Sent for Signing',
  'Awaiting Signature',
  'Pending Signature',
] as const

export function isPiAllowedForStatus(status: string): boolean {
  return !(PI_BLOCKED_STATUSES as readonly string[]).includes(status)
}

/**
 * Round 3 Step 4 : restore the original 7-column summary.
 *
 * Round 2 trimmed the PI summary to PI Number / Due Date / Amount /
 * Status. Pranav's Round 3 correction: he only asked for the date
 * column to show the due date (not the issue date), not for the
 * whole table to be trimmed. The original Phase 2 columns are back;
 * only the date column meaning is pinned to the instalment due date.
 */
export interface PiSummaryRow {
  piNumber: string
  instalmentLabel: string
  originalAmount: number
  paidAmount: number
  dueAmount: number
  dueDateIso: string | null
  status: string
}

export interface PiInvoice {
  piNumber: string
  issueDate: string                // ISO yyyy-mm-dd
  fiscalYear: string               // "26-27"
  school: {
    name: string
    legalEntity: string | null
    address: string | null
    city: string | null
    state: string | null
    pan: string | null
    gstNumber: string | null
  }
  company: {
    name: string
    address: string
    gstin: string
    pan: string
    stateCode: string              // "27" for Maharashtra
    email: string
  }
  installment: {
    id: string
    mouId: string
    label: string
    dueDateIso: string | null
    expectedAmount: number
    description: string
  }
  lineItems: PiLineItem[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  /** Combined GST (CGST + SGST + IGST) for the simplified PI footer. */
  gstAmount: number
  roundOff: number
  total: number
  /**
   * Sum of active adjustments applied to this instalment, signed:
   * negative = excess received (credit), positive = additional charge.
   * Zero when no adjustments apply, in which case the line still
   * renders showing Rs 0 per Pranav's Round 2 spec.
   */
  balanceDuePreviousInstalments: number
  /** total + balanceDuePreviousInstalments. */
  netPaymentDue: number
  amountInWords: string
  notes: string | null
  /** Summary of all PIs for this MOU, attached so the school sees the
   *  full picture (Phase 3 Step 6). */
  mouPiSummary?: PiSummaryRow[]
}

/**
 * Build the PI company block for a given entity key. Used by both the
 * PDF renderer and the Tally XML builder.
 */
export function companyBlockFor(entity: EntityKey): {
  name: string
  address: string
  gstin: string
  pan: string
  stateCode: string
  email: string
} {
  const e = getEntity(entity)
  return {
    name: company.name,
    address: e.address,
    gstin: e.gstin,
    pan: company.pan,
    stateCode: e.stateCode,
    email: company.email,
  }
}

/**
 * Programme → HSN code. Single HSN (999294) used across STEAM/YP/Harvard
 * + VEX per Phase 3 Step 3; the per-programme map is kept so future
 * programmes can override.
 */
export function hsnFor(programme: Programme | 'VEX' | string): string {
  const entity = getEntityForProgramme(programme)
  return getEntity(entity).hsn
}

/**
 * Atomic next-PI-number increment for the given GST entity. Retries up
 * to 3 times on 409 so two concurrent PI generators never collide.
 * Returns the formatted PI number per company.json.
 */
export async function issuePiNumber(
  entity: EntityKey,
): Promise<{ piNumber: string; counter: PiCounterMap }> {
  return issuePiNumberAtomic(entity)
}

export function amountInWordsInr(amount: number): string {
  // Indian-lakh/crore style. Keep it readable for non-tech users.
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]

  function twoDigits(n: number): string {
    if (n === 0) return ''
    if (n < 10) return ones[n]!
    if (n < 20) return teens[n - 10]!
    const t = Math.floor(n / 10)
    const o = n % 10
    return `${tens[t]}${o ? ' ' + ones[o] : ''}`
  }

  function threeDigits(n: number): string {
    const h = Math.floor(n / 100)
    const r = n % 100
    const parts: string[] = []
    if (h > 0) parts.push(`${ones[h]} Hundred`)
    const rest = twoDigits(r)
    if (rest) parts.push(rest)
    return parts.join(' ')
  }

  const whole = Math.floor(Math.abs(amount))
  const paise = Math.round((Math.abs(amount) - whole) * 100)
  if (whole === 0 && paise === 0) return 'Rupees Zero Only'

  const crore = Math.floor(whole / 10000000)
  const lakh = Math.floor((whole % 10000000) / 100000)
  const thousand = Math.floor((whole % 100000) / 1000)
  const remainder = whole % 1000

  const parts: string[] = []
  if (crore > 0) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`)
  if (remainder > 0) parts.push(threeDigits(remainder))

  let out = `Rupees ${parts.join(' ')}`
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`
  out += ' Only'
  return out
}

export interface PiInputs {
  piNumber: string
  issueDate: string
  installment: Payment
  mou: MOU
  school: School | undefined
  gstPct: number                         // 0.18 default
  entityKey?: EntityKey                  // override default programme routing
  /**
   * Active adjustment records that apply to this instalment. Phase 3
   * Round 2: surfaces as the "Balance due Previous Instalments /
   * (Excess Received)" line on the PI bottom block.
   */
  adjustments?: Adjustment[]
}

export function composePi(inputs: PiInputs): PiInvoice {
  const { piNumber, issueDate, installment, mou, school, gstPct, adjustments } = inputs
  const entityKey: EntityKey =
    inputs.entityKey ?? getEntityForProgramme(mou.programme)
  const entity = getEntity(entityKey)
  const hsn = entity.hsn
  const baseAmount = installment.expectedAmount / (1 + gstPct)
  const gstAmount = installment.expectedAmount - baseAmount
  const schoolState = school?.state ?? entity.state
  const isInterState = schoolState !== entity.state
  const cgst = isInterState ? 0 : gstAmount / 2
  const sgst = isInterState ? 0 : gstAmount / 2
  const igst = isInterState ? gstAmount : 0

  const students = installment.studentCountActual ?? mou.studentsActual ?? mou.studentsMou
  const perStudent = students > 0 ? baseAmount / students : baseAmount

  const rounded = Math.round(baseAmount + cgst + sgst + igst)
  const roundOff = rounded - (baseAmount + cgst + sgst + igst)

  const fiscalYear = computeFiscalYear(issueDate)

  // Round 2: sum active adjustments applied to this instalment.
  const balanceDuePreviousInstalments = (adjustments ?? [])
    .filter((a) => a.status === 'Active' && a.appliedToInstallmentId === installment.id)
    .reduce((s, a) => s + a.amountDelta, 0)
  const netPaymentDue = Math.round(rounded + balanceDuePreviousInstalments)

  return {
    piNumber,
    issueDate,
    fiscalYear,
    school: {
      name: school?.billingName ?? school?.legalEntity ?? mou.schoolName,
      legalEntity: school?.legalEntity ?? null,
      address: school ? `${school.city}, ${school.state}` : null,
      city: school?.city ?? null,
      state: school?.state ?? null,
      pan: school?.pan ?? null,
      gstNumber: school?.gstNumber ?? null,
    },
    company: companyBlockFor(entityKey),
    installment: {
      id: installment.id,
      mouId: installment.mouId,
      label: installment.instalmentLabel,
      dueDateIso: installment.dueDateIso,
      expectedAmount: installment.expectedAmount,
      description: installment.description,
    },
    lineItems: [
      {
        description: `${mou.programme} programme : ${installment.description} (${installment.instalmentLabel}) for ${mou.schoolName}`,
        hsn,
        quantity: students,
        ratePerUnit: Math.round(perStudent * 100) / 100,
        cgstPct: isInterState ? 0 : (gstPct / 2) * 100,
        sgstPct: isInterState ? 0 : (gstPct / 2) * 100,
        igstPct: isInterState ? gstPct * 100 : 0,
        amount: Math.round(baseAmount),
      },
    ],
    subtotal: Math.round(baseAmount),
    cgst: Math.round(cgst),
    sgst: Math.round(sgst),
    igst: Math.round(igst),
    gstAmount: Math.round(gstAmount),
    roundOff: Math.round(roundOff * 100) / 100,
    total: rounded,
    balanceDuePreviousInstalments: Math.round(balanceDuePreviousInstalments),
    netPaymentDue,
    amountInWords: amountInWordsInr(netPaymentDue),
    notes: null,
  }
}

/**
 * Build the per-MOU PI summary block. Round 3 Step 4 restores the
 * original Phase 2 column shape (PI No / Instalment / Original /
 * Paid / Due / Due Date / Status). Only the date column is pinned
 * to the instalment due date : that was Pranav's actual Round 2 ask.
 */
export function buildMouPiSummary(args: {
  mouPayments: Payment[]
}): PiSummaryRow[] {
  const { mouPayments } = args
  return mouPayments
    .slice()
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
    .map((p) => {
      const paid =
        (p.partialPayments ?? []).reduce((s, x) => s + (x.amount || 0), 0) ||
        (p.receivedAmount ?? 0)
      const due = Math.max(0, (p.expectedAmount || 0) - paid)
      return {
        piNumber: p.piNumber ?? ':',
        instalmentLabel: p.instalmentLabel,
        originalAmount: p.expectedAmount,
        paidAmount: paid,
        dueAmount: due,
        dueDateIso: p.dueDateIso,
        status: p.status,
      }
    })
}

function computeFiscalYear(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  // Indian FY runs April-March. An April-or-later date belongs to FY yy-(yy+1).
  const startYY = d.getMonth() >= 3 ? y : y - 1
  const endYY = startYY + 1
  return `${String(startYY).slice(-2)}-${String(endYY).slice(-2)}`
}
