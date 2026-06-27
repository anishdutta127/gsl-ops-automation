/*
 * PaymentLog corrections (Pass 1 finance corrections).
 *
 * A PaymentLog is a logged bank receipt. Until now there was no way to edit or
 * remove a mis-logged one in-app (the St Paul's duplicate PL-CB850B8E needed a
 * script). These two actions cover a PARKED / unmatched log:
 *
 *   - editPaymentLog: correct amount/date/reference/mode/narration on a parked
 *     log (one with no balance effect yet).
 *   - voidPaymentLog: soft-delete (tombstone) a parked log.
 *
 * A log that still feeds a balance is NOT touched here:
 *   - matchedInstallmentIds non-empty -> 'still-matched': unmatch the linked
 *     instalment first (owner decision 2026-06-27: each financial reversal is a
 *     separate audited step). Unmatching the instalment resets this log back to
 *     unmatched (see unmatchPayment), after which it can be voided.
 *   - referenced by a VexPi -> 'vex-payment': use the VEX payment edit/void on
 *     the PI page (vexPaymentMutations), which reconciles the VexPi balance.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard). Void requires a
 * reason (>=10). Both write full before/after audit on the log.
 */

import type {
  AuditEntry,
  PaymentLog,
  PaymentMode,
  User,
  VexPi,
} from '@/lib/types'
import { canEditFinanceData } from '@/lib/access'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { userRepo } from '@/lib/db/repos/user'
import { isDuplicateReceipt } from '@/lib/payment/duplicateReceipt'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface PaymentLogMutationDeps {
  logs: PaymentLog[]
  users: User[]
  vexPis: VexPi[]
  updateLog: (log: PaymentLog, queuedBy: string) => Promise<void>
  voidLog: (
    id: string,
    args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry },
  ) => Promise<void>
  now: () => Date
}

async function defaultDeps(): Promise<PaymentLogMutationDeps> {
  return {
    logs: (await paymentLogRepo.findAll()) as PaymentLog[],
    users: (await userRepo.findAll()) as User[],
    vexPis: (await vexPiRepo.findAll()) as VexPi[],
    updateLog: (log, queuedBy) => paymentLogRepo.update(log, { queuedBy }),
    voidLog: (id, args) => paymentLogRepo.void(id, args),
    now: () => new Date(),
  }
}

export type PaymentLogFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'log-not-found'
  | 'already-voided'
  | 'still-matched'
  | 'vex-payment'
  | 'invalid-amount'
  | 'invalid-date'
  | 'missing-reason'
  | 'duplicate-reference'

export type PaymentLogResult =
  | { ok: true; log: PaymentLog }
  | { ok: false; reason: PaymentLogFailureReason }

type Resolved =
  | { user: User; log: PaymentLog }
  | { error: PaymentLogFailureReason }

/**
 * Common guards: user exists + permitted, log exists + not voided, and the log
 * is a PARKED log (not matched to an instalment, not feeding a VexPi).
 */
function resolveParked(
  deps: PaymentLogMutationDeps,
  logId: string,
  userId: string,
): Resolved {
  const user = deps.users.find((u) => u.id === userId)
  if (!user) return { error: 'unknown-user' }
  if (!canEditFinanceData(user)) return { error: 'permission' }
  const log = deps.logs.find((l) => l.id === logId)
  if (!log) return { error: 'log-not-found' }
  if (log.voidedAt) return { error: 'already-voided' }
  if ((log.matchedInstallmentIds ?? []).length > 0) return { error: 'still-matched' }
  if (deps.vexPis.some((p) => (p.paymentLogIds ?? []).includes(log.id))) {
    return { error: 'vex-payment' }
  }
  return { user, log }
}

// ----------------------------------------------------------------------------
// Edit

export interface EditPaymentLogArgs {
  logId: string
  amount: number
  date: string
  mode: PaymentMode
  reference: string | null
  narration: string | null
  recordedBy: string
}

export async function editPaymentLog(
  args: EditPaymentLogArgs,
  depsOverride?: PaymentLogMutationDeps,
): Promise<PaymentLogResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const r = resolveParked(deps, args.logId, args.recordedBy)
  if ('error' in r) return { ok: false, reason: r.error }
  const { log } = r
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  if (!ISO_DATE_RE.test(args.date)) return { ok: false, reason: 'invalid-date' }

  // Don't let an edit recreate a duplicate (reference+amount) of another live
  // log. Compare against every OTHER non-voided log.
  const others = deps.logs.filter((l) => l.id !== log.id && !l.voidedAt)
  const ref = (args.reference ?? '').trim() || null
  if (isDuplicateReceipt(others, { reference: ref, amount: args.amount })) {
    return { ok: false, reason: 'duplicate-reference' }
  }

  const ts = deps.now().toISOString()
  const narration = (args.narration ?? '').trim() || null
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { amount: log.amount, date: log.date, mode: log.mode, reference: log.reference, narration: log.narration },
    after: { amount: args.amount, date: args.date, mode: args.mode, reference: ref, narration },
    notes: 'Parked payment log edited.',
  }
  const next: PaymentLog = {
    ...log,
    amount: args.amount,
    date: args.date,
    mode: args.mode,
    reference: ref,
    narration,
    auditLog: [...(log.auditLog ?? []), audit],
  }
  await deps.updateLog(next, args.recordedBy)
  return { ok: true, log: next }
}

// ----------------------------------------------------------------------------
// Void (soft-delete)

export interface VoidPaymentLogArgs {
  logId: string
  reason: string
  recordedBy: string
}

export async function voidPaymentLog(
  args: VoidPaymentLogArgs,
  depsOverride?: PaymentLogMutationDeps,
): Promise<PaymentLogResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const r = resolveParked(deps, args.logId, args.recordedBy)
  if ('error' in r) return { ok: false, reason: r.error }
  const { log } = r
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { voidedAt: null },
    after: { voidedAt: ts },
    notes: `Payment log soft-deleted (parked, no balance effect). Reason: ${reason}`,
  }
  await deps.voidLog(log.id, {
    voidedAt: ts,
    voidedBy: args.recordedBy,
    voidReason: reason,
    audit,
  })
  return { ok: true, log: { ...log, voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason } }
}
