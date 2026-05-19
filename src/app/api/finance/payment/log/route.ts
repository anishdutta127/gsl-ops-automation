/*
 * POST /api/finance/payment/log (Gate 5A.6 Step 2).
 *
 * Form target for /finance/payments/new. Branches per the data the
 * operator could narrow to:
 *
 *   1. schoolId + mouId + paymentId + amount === expectedAmount
 *      -> recordReceipt() (auto-match path); 303 to /finance/payments
 *      with `recorded` toast.
 *   2. schoolId + mouId only (or amount diverges)
 *      -> enqueue PaymentLog row; 303 to /finance/payments with banner.
 *   3. schoolId only
 *      -> enqueue PaymentLog with no MOU hint; 303 to
 *      /finance/payments/unmatched.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { recordReceipt } from '@/lib/payment/recordReceipt'
import type {
  MOU,
  Payment,
  PaymentLog,
  PaymentMode,
  School,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'

const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

const VALID_MODES: ReadonlyArray<PaymentMode> = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

// Form-facing modes mapped to canonical PaymentMode (the form accepts
// 'DD' which we collapse to 'Cheque' since DD is functionally a banker's
// cheque under our payment-mode enum; the bank narration captures DD vs
// cheque verbatim).
function canonicalMode(raw: string): PaymentMode | null {
  if (raw === 'DD') return 'Cheque'
  if (VALID_MODES.includes(raw as PaymentMode)) return raw as PaymentMode
  return null
}

export async function POST(request: Request) {
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/finance/payments/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string, extras: Record<string, string> = {}) => {
    const url = new URL('/finance/payments/new', request.url)
    url.searchParams.set('error', reason)
    for (const [k, v] of Object.entries(extras)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditFinanceData(user)) return errorTo('permission')

  const bankReference = String(form.get('bankReference') ?? '').trim()
  if (!bankReference) return errorTo('missing-reference')

  // Phase 4 (2026-05-19): the form now sends bankAmount + tdsAmount
  // as the primary inputs; receivedAmount is the hidden sum the
  // client computed onChange. Fall back to receivedAmount as the
  // canonical total when bank + TDS are both zero (legacy callers
  // who post receivedAmount only).
  const bankAmountRaw = Number(String(form.get('bankAmount') ?? ''))
  const tdsAmountRaw = Number(String(form.get('tdsAmount') ?? ''))
  const formReceived = Number(String(form.get('receivedAmount') ?? ''))
  const bankAmount = Number.isFinite(bankAmountRaw) && bankAmountRaw >= 0 ? bankAmountRaw : 0
  const tdsAmount = Number.isFinite(tdsAmountRaw) && tdsAmountRaw >= 0 ? tdsAmountRaw : 0
  const splitProvided = bankAmount + tdsAmount > 0
  const receivedAmount = splitProvided ? bankAmount + tdsAmount : formReceived
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
    return errorTo('invalid-amount')
  }

  const receivedDate = String(form.get('receivedDate') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return errorTo('invalid-date')

  const paymentMode = canonicalMode(String(form.get('paymentMode') ?? ''))
  if (!paymentMode) return errorTo('invalid-mode')

  const bankNameRaw = String(form.get('bankName') ?? '').trim()
  const bankNameOther = String(form.get('bankNameOther') ?? '').trim()
  const bankName =
    bankNameRaw === 'Other' && bankNameOther ? bankNameOther : bankNameRaw

  const schoolId = String(form.get('schoolId') ?? '').trim()
  if (!schoolId) return errorTo('missing-school')
  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) return errorTo('school-not-found')

  const mouId = String(form.get('mouId') ?? '').trim()
  const paymentId = String(form.get('paymentId') ?? '').trim()
  const notesRaw = String(form.get('notes') ?? '').trim()
  const tdsDeducted = splitProvided ? tdsAmount : null

  // Build the narration string carried on the queued PaymentLog (or
  // dropped onto the audit notes for auto-matches).
  const narrationParts: string[] = []
  if (bankName) narrationParts.push(`bank=${bankName}`)
  if (tdsDeducted !== null) narrationParts.push(`tds=${tdsDeducted}`)
  if (notesRaw) narrationParts.push(notesRaw)
  const narration = narrationParts.join(' | ')

  // Branch 1: full chain selected, attempt auto-match via recordReceipt.
  if (mouId && paymentId) {
    const payment = allPayments.find((p) => p.id === paymentId)
    const mou = allMous.find((m) => m.id === mouId)
    if (!payment || !mou || mou.schoolId !== schoolId) {
      // Selection inconsistent; fall through to park path.
    } else if (Math.abs(payment.expectedAmount - receivedAmount) < 0.01) {
      const result = await recordReceipt({
        paymentId,
        receivedDate,
        receivedAmount,
        paymentMode,
        bankReference,
        notes:
          (notesRaw ? notesRaw + ' | ' : '') + `Bank: ${bankName || '-'}`,
        recordedBy: user.id,
        // Phase 4: persist the bank / TDS split alongside the receipt
        // when the form supplied them; legacy callers that posted only
        // receivedAmount continue to land here with both undefined.
        bankAmount: splitProvided ? bankAmount : undefined,
        tdsAmount: splitProvided ? tdsAmount : undefined,
      })
      if (!result.ok) return errorTo(result.reason)
      const url = new URL('/finance/payments', request.url)
      url.searchParams.set('logged', paymentId)
      url.searchParams.set('school', mou.schoolName)
      return NextResponse.redirect(url, { status: 303 })
    }
  }

  // Branch 2 + 3: park as PaymentLog.
  const paymentLog: PaymentLog = {
    id: `PL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    date: receivedDate,
    amount: receivedAmount,
    mode: paymentMode,
    reference: bankReference,
    narration: narration || null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: true,
    loggedBy: user.id,
    loggedAt: new Date().toISOString(),
    notes: mouId
      ? `Suggested MOU: ${mouId}${paymentId ? ` instalment ${paymentId}` : ''}. School: ${school.name}.`
      : `School: ${school.name}. No MOU narrowed at log time.`,
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'paymentLog',
      operation: 'create',
      payload: paymentLog as unknown as Record<string, unknown>,
    })
  } catch {
    return errorTo('queue-failure')
  }

  const url = mouId
    ? new URL('/finance/payments', request.url)
    : new URL('/finance/payments/unmatched', request.url)
  url.searchParams.set('parked', paymentLog.id)
  url.searchParams.set('school', school.name)
  return NextResponse.redirect(url, { status: 303 })
}
