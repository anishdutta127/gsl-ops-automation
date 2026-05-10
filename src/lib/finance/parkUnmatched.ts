/*
 * Park a bank entry as unmatched (Gate 2 Step 6).
 *
 * Inputs: amount, date, mode, reference, narration, user. Writes a
 * single PaymentLog row with unmatched: true and matchedInstallmentIds: [].
 *
 * The parked row surfaces on /finance/payments/unmatched until Finance
 * comes back to reconcile it against a Payment.
 *
 * Permission gate: canEditFinanceData (Finance + cross-functional Admin).
 */

import crypto from 'node:crypto'
import type { PaymentLog, PaymentMode, User } from '@/lib/types'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'

const VALID_MODES: ReadonlyArray<PaymentMode> = [
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Cash',
  'Zoho',
  'Razorpay',
  'Other',
]

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface ParkUnmatchedArgs {
  date: string
  amount: number
  mode: PaymentMode
  reference: string | null
  narration: string | null
  loggedBy: string
}

export type ParkUnmatchedFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-mode'

export type ParkUnmatchedOutcome =
  | { ok: true; paymentLog: PaymentLog }
  | { ok: false; reason: ParkUnmatchedFailureReason }

export interface ParkUnmatchedDeps {
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ParkUnmatchedDeps = {
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function parkUnmatched(
  args: ParkUnmatchedArgs,
  deps: ParkUnmatchedDeps = defaultDeps,
): Promise<ParkUnmatchedOutcome> {
  const user = deps.users.find((u) => u.id === args.loggedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }

  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  if (!ISO_DATE_RE.test(args.date)) {
    return { ok: false, reason: 'invalid-date' }
  }
  if (!VALID_MODES.includes(args.mode)) {
    return { ok: false, reason: 'invalid-mode' }
  }

  const ts = deps.now().toISOString()
  const paymentLog: PaymentLog = {
    id: `PL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    date: args.date,
    amount: args.amount,
    mode: args.mode,
    reference: (args.reference ?? '').trim() || null,
    narration: (args.narration ?? '').trim() || null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: true,
    loggedBy: args.loggedBy,
    loggedAt: ts,
    notes: null,
  }

  await deps.enqueue({
    queuedBy: args.loggedBy,
    entity: 'paymentLog',
    operation: 'create',
    payload: paymentLog as unknown as Record<string, unknown>,
  })

  return { ok: true, paymentLog }
}
