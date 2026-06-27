/*
 * VEX payment corrections (Pass 1 finance corrections).
 *
 * A VEX payment is a PaymentLog whose id sits in a VexPi.paymentLogIds and
 * whose amount was added to VexPi.paymentReceivedAmount at record time. Until
 * now a wrong or duplicate VEX payment could only be fixed with a one-off
 * recovery script (VEXPI-UP-26-27-020, Funscholar). These two actions make the
 * correction first-class and reconcile the parent VexPi:
 *
 *   - editVexPayment: change amount/date/mode/reference on a recorded VEX
 *     payment; the VexPi balance moves by the delta and status is recomputed.
 *   - voidVexPayment: soft-delete (tombstone) the payment_log, drop its id from
 *     the VexPi, decrement the balance, recompute status. This is exactly what
 *     the over-count recovery scripts did, as a permissioned + audited action.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard) - owner decision
 * 2026-06-27, finance self-serves corrections. Both require a reason and write
 * full before/after audit on BOTH the VexPi and the PaymentLog.
 */

import type {
  AuditEntry,
  PaymentLog,
  PaymentMode,
  User,
  VexPi,
} from '@/lib/types'
import { canEditFinanceData } from '@/lib/access'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { userRepo } from '@/lib/db/repos/user'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Recompute a VexPi's status from a balance change. Mirrors the forward rule in
 * vexPiRepo.recordVexPayment, made symmetric so a decrement (void/edit-down)
 * rewinds correctly:
 *   received <= 0          -> Generated      (no payment stands)
 *   0 < received < total   -> Payment Pending
 *   received >= total      -> Delivery Pending (preserve Completed if set)
 */
export function recomputeVexPiStatus(
  received: number,
  total: number,
  current: VexPi['status'],
): VexPi['status'] {
  if (received <= 0) return 'Generated'
  if (received < total) return 'Payment Pending'
  return current === 'Completed' ? 'Completed' : 'Delivery Pending'
}

export interface VexPaymentDeps {
  pis: VexPi[]
  logs: PaymentLog[]
  users: User[]
  updatePi: (pi: VexPi, queuedBy: string) => Promise<void>
  updateLog: (log: PaymentLog, queuedBy: string) => Promise<void>
  voidLog: (
    id: string,
    args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry },
  ) => Promise<void>
  now: () => Date
}

async function defaultDeps(): Promise<VexPaymentDeps> {
  return {
    pis: (await vexPiRepo.findAll()) as VexPi[],
    logs: (await paymentLogRepo.findAll()) as PaymentLog[],
    users: (await userRepo.findAll()) as User[],
    updatePi: (pi, queuedBy) => vexPiRepo.update(pi, { queuedBy }),
    updateLog: (log, queuedBy) => paymentLogRepo.update(log, { queuedBy }),
    voidLog: (id, args) => paymentLogRepo.void(id, args),
    now: () => new Date(),
  }
}

type Resolved =
  | { user: User; pi: VexPi; log: PaymentLog }
  | { error: VexPaymentFailureReason }

export type VexPaymentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'pi-not-found'
  | 'log-not-found'
  | 'not-on-pi'
  | 'already-voided'
  | 'invalid-amount'
  | 'invalid-date'
  | 'missing-reason'

function resolve(
  deps: VexPaymentDeps,
  piId: string,
  logId: string,
  userId: string,
): Resolved {
  const user = deps.users.find((u) => u.id === userId)
  if (!user) return { error: 'unknown-user' }
  if (!canEditFinanceData(user)) return { error: 'permission' }
  const pi = deps.pis.find((p) => p.id === piId)
  if (!pi) return { error: 'pi-not-found' }
  const log = deps.logs.find((l) => l.id === logId)
  if (!log) return { error: 'log-not-found' }
  if (!(pi.paymentLogIds ?? []).includes(logId)) return { error: 'not-on-pi' }
  if (log.voidedAt) return { error: 'already-voided' }
  return { user, pi, log }
}

// ----------------------------------------------------------------------------
// Edit

export interface EditVexPaymentArgs {
  piId: string
  logId: string
  amount: number
  date: string
  mode: PaymentMode
  reference: string | null
  recordedBy: string
}

export type VexPaymentResult =
  | { ok: true; pi: VexPi; log: PaymentLog }
  | { ok: false; reason: VexPaymentFailureReason }

export async function editVexPayment(
  args: EditVexPaymentArgs,
  depsOverride?: VexPaymentDeps,
): Promise<VexPaymentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const r = resolve(deps, args.piId, args.logId, args.recordedBy)
  if ('error' in r) return { ok: false, reason: r.error }
  const { pi, log } = r
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  if (!ISO_DATE_RE.test(args.date)) return { ok: false, reason: 'invalid-date' }

  const ts = deps.now().toISOString()
  const ref = (args.reference ?? '').trim() || null
  const delta = round2(args.amount - log.amount)
  const newReceived = round2(pi.paymentReceivedAmount + delta)
  const newStatus = recomputeVexPiStatus(newReceived, pi.total, pi.status)

  const logAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { amount: log.amount, date: log.date, mode: log.mode, reference: log.reference },
    after: { amount: args.amount, date: args.date, mode: args.mode, reference: ref },
    notes: `VEX payment edited on ${pi.id}. Balance delta Rs ${delta}.`,
  }
  const nextLog: PaymentLog = {
    ...log,
    amount: args.amount,
    date: args.date,
    mode: args.mode,
    reference: ref,
    auditLog: [...(log.auditLog ?? []), logAudit],
  }
  // Record first, then move the balance (a thrown balance update leaves a
  // detectable low balance, never an inflated one).
  await deps.updateLog(nextLog, args.recordedBy)

  const piAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { paymentReceivedAmount: pi.paymentReceivedAmount, status: pi.status },
    after: { paymentReceivedAmount: newReceived, status: newStatus },
    notes: `VEX payment ${log.id} edited (amount Rs ${log.amount} -> Rs ${args.amount}); balance reconciled.`,
  }
  const nextPi: VexPi = {
    ...pi,
    paymentReceivedAmount: newReceived,
    status: newStatus,
    auditLog: [...(pi.auditLog ?? []), piAudit],
  }
  await deps.updatePi(nextPi, args.recordedBy)

  return { ok: true, pi: nextPi, log: nextLog }
}

// ----------------------------------------------------------------------------
// Void (soft-delete + reconcile)

export interface VoidVexPaymentArgs {
  piId: string
  logId: string
  reason: string
  recordedBy: string
}

export async function voidVexPayment(
  args: VoidVexPaymentArgs,
  depsOverride?: VexPaymentDeps,
): Promise<VexPaymentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const r = resolve(deps, args.piId, args.logId, args.recordedBy)
  if ('error' in r) return { ok: false, reason: r.error }
  const { pi, log } = r
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const ts = deps.now().toISOString()
  const newReceived = round2(pi.paymentReceivedAmount - log.amount)
  const newIds = (pi.paymentLogIds ?? []).filter((id) => id !== log.id)
  const newStatus = recomputeVexPiStatus(newReceived, pi.total, pi.status)

  const piAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: {
      paymentReceivedAmount: pi.paymentReceivedAmount,
      status: pi.status,
      paymentLogIds: pi.paymentLogIds,
    },
    after: {
      paymentReceivedAmount: newReceived,
      status: newStatus,
      paymentLogIds: newIds,
    },
    notes: `VEX payment ${log.id} (Rs ${log.amount}) voided. Reason: ${reason}`,
  }
  const nextPi: VexPi = {
    ...pi,
    paymentReceivedAmount: newReceived,
    paymentLogIds: newIds,
    status: newStatus,
    auditLog: [...(pi.auditLog ?? []), piAudit],
  }
  // Reverse the balance on the parent FIRST, then tombstone the log. If the
  // tombstone throws, the log id is already gone from the PI so it no longer
  // counts; the orphaned-but-live row is detectable and harmless.
  await deps.updatePi(nextPi, args.recordedBy)

  const logAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { voidedAt: null },
    after: { voidedAt: ts },
    notes: `Voided VEX payment on ${pi.id} (Rs ${log.amount}). Reason: ${reason}`,
  }
  await deps.voidLog(log.id, {
    voidedAt: ts,
    voidedBy: args.recordedBy,
    voidReason: reason,
    audit: logAudit,
  })

  return { ok: true, pi: nextPi, log: { ...log, voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason } }
}
