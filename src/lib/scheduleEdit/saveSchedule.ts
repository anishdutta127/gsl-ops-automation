/*
 * Per-MOU payment schedule editor lib (Gate 5A.6 Step 1).
 *
 * Two write paths:
 *   - saveScheduleNoPi(): full structural replace of installments when no
 *     PI has been issued for any of the MOU's payments. Rows may be
 *     added, removed, or reordered; due dates and percentages are free.
 *   - overrideLockedSchedule(): when at least one payment carries a
 *     piNumber, the editor still surfaces but every save runs through
 *     the recalc engine (computeRecalcWithAdjustments) so issued PIs
 *     remain numerically correct and an Adjustment row materialises for
 *     every locked installment whose new expectedAmount differs.
 *
 * Both paths attach an AuditEntry to the MOU and to every touched
 * Payment row. Override path appends a follow-up MOU audit entry that
 * records the operator-supplied reason.
 *
 * Permission gates live at the route layer; the lib trusts the caller
 * and returns structured error reasons for the form to surface.
 */

import type { AuditEntry, MOU, Payment, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { recalcInstallments } from '@/lib/mou/studentCountRecalc'

export interface ScheduleRowInput {
  /** Existing Payment.id when editing a row; null for newly-added rows. */
  paymentId: string | null
  pctDue: number
  dueDateIso: string | null
  notes: string | null
}

export interface SaveScheduleArgs {
  mouId: string
  rows: ScheduleRowInput[]
  recordedBy: string
}

export interface OverrideScheduleArgs extends SaveScheduleArgs {
  reason: string
}

export type SaveScheduleFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'pi-issued-requires-override'
  | 'invalid-rows'
  | 'pct-sum-out-of-range'
  | 'missing-reason'
  | 'override-requires-existing-rows'

export type SaveScheduleResult =
  | { ok: true; touchedPayments: number; createdPayments: number; deletedPayments: number; adjustmentsCount: number }
  | { ok: false; reason: SaveScheduleFailureReason; detail?: string }

export interface ScheduleEditDeps {
  mous: MOU[]
  payments: Payment[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ScheduleEditDeps = {
  mous: mousJson as unknown as MOU[],
  payments: paymentsJson as unknown as Payment[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isPiIssued(p: Payment): boolean {
  return p.piNumber !== null || p.piSentDate !== null
}

function validateRows(rows: ScheduleRowInput[]): SaveScheduleFailureReason | null {
  if (!Array.isArray(rows) || rows.length === 0) return 'invalid-rows'
  for (const r of rows) {
    if (!Number.isFinite(r.pctDue) || r.pctDue <= 0 || r.pctDue > 100) {
      return 'invalid-rows'
    }
    if (r.dueDateIso !== null && !ISO_DATE_RE.test(r.dueDateIso)) {
      return 'invalid-rows'
    }
  }
  const sum = round2(rows.reduce((s, r) => s + r.pctDue, 0))
  if (sum < 99.5 || sum > 100.5) return 'pct-sum-out-of-range'
  return null
}

function makeNewPayment(args: {
  mou: MOU
  seq: number
  totalInstalments: number
  pctDue: number
  amount: number
  dueDateIso: string | null
  notes: string | null
  auditEntry: AuditEntry
}): Payment {
  const { mou, seq, totalInstalments, amount, dueDateIso, notes, auditEntry } = args
  return {
    id: `${mou.id}-i${seq}`,
    mouId: mou.id,
    schoolName: mou.schoolName,
    programme: mou.programme,
    instalmentLabel: `${seq} of ${totalInstalments}`,
    instalmentSeq: seq,
    totalInstalments,
    description: '',
    dueDateRaw: dueDateIso,
    dueDateIso,
    expectedAmount: amount,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: [],
    auditLog: [auditEntry],
  }
}

/**
 * No-PI path. Replaces the MOU's installments wholesale with the rows
 * supplied. Allowed only when no existing Payment for the MOU carries
 * a PI number or a PI-sent date.
 */
export async function saveScheduleNoPi(
  args: SaveScheduleArgs,
  deps: ScheduleEditDeps = defaultDeps,
): Promise<SaveScheduleResult> {
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!(canEditMOU(user) || canEditFinanceData(user))) {
    return { ok: false, reason: 'permission' }
  }
  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const existing = deps.payments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  if (existing.some(isPiIssued)) {
    return { ok: false, reason: 'pi-issued-requires-override' }
  }
  const rowError = validateRows(args.rows)
  if (rowError) return { ok: false, reason: rowError }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { installmentCount: existing.length },
    after: { installmentCount: args.rows.length },
    notes: `Payment schedule edited (no-PI path): ${args.rows.length} instalment(s).`,
  }

  const totalInstalments = args.rows.length
  let touched = 0
  let created = 0
  let deleted = 0

  const keptIds = new Set<string>()
  for (let i = 0; i < args.rows.length; i++) {
    const seq = i + 1
    const row = args.rows[i]!
    const amount = round2((mou.contractValue * row.pctDue) / 100)
    const targetId = row.paymentId ?? `${mou.id}-i${seq}`
    const prior = existing.find((p) => p.id === targetId)
    if (prior) {
      keptIds.add(prior.id)
      const updated: Payment = {
        ...prior,
        instalmentLabel: `${seq} of ${totalInstalments}`,
        instalmentSeq: seq,
        totalInstalments,
        expectedAmount: amount,
        dueDateRaw: row.dueDateIso,
        dueDateIso: row.dueDateIso,
        notes: row.notes,
        auditLog: [...(prior.auditLog ?? []), audit],
      }
      await deps.enqueue({
        queuedBy: args.recordedBy,
        entity: 'payment',
        operation: 'update',
        payload: updated as unknown as Record<string, unknown>,
      })
      touched += 1
    } else {
      const fresh = makeNewPayment({
        mou,
        seq,
        totalInstalments,
        pctDue: row.pctDue,
        amount,
        dueDateIso: row.dueDateIso,
        notes: row.notes,
        auditEntry: audit,
      })
      keptIds.add(fresh.id)
      await deps.enqueue({
        queuedBy: args.recordedBy,
        entity: 'payment',
        operation: 'create',
        payload: fresh as unknown as Record<string, unknown>,
      })
      created += 1
    }
  }
  for (const prior of existing) {
    if (keptIds.has(prior.id)) continue
    await deps.enqueue({
      queuedBy: args.recordedBy,
      entity: 'payment',
      operation: 'delete',
      payload: { id: prior.id, mouId: prior.mouId } as Record<string, unknown>,
    })
    deleted += 1
  }
  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: {
      ...mou,
      auditLog: [...(mou.auditLog ?? []), audit],
    } as unknown as Record<string, unknown>,
  })

  return {
    ok: true,
    touchedPayments: touched,
    createdPayments: created,
    deletedPayments: deleted,
    adjustmentsCount: 0,
  }
}

/**
 * Override path. Re-allocates percentages across existing Payment rows.
 * Locked installments (paid or PI sent) keep their stored expectedAmount;
 * an Adjustment record materialises for every locked row whose
 * recalculated expectedAmount differs from the stored amount.
 * Row count is preserved (no add/remove in override mode).
 */
export async function overrideLockedSchedule(
  args: OverrideScheduleArgs,
  deps: ScheduleEditDeps = defaultDeps,
): Promise<SaveScheduleResult> {
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) {
    return { ok: false, reason: 'permission' }
  }
  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const existing = deps.payments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
  if (existing.length === 0) {
    return { ok: false, reason: 'override-requires-existing-rows' }
  }
  if (args.rows.length !== existing.length) {
    return {
      ok: false,
      reason: 'override-requires-existing-rows',
      detail: 'Row count must match existing instalments. Add/remove rows is disabled in override mode.',
    }
  }
  const rowError = validateRows(args.rows)
  if (rowError) return { ok: false, reason: rowError }

  // Phase 6D Part 4: route through the unified spread-by-weight engine.
  // The operator's per-row pctDue becomes each Payment's percentShare;
  // mou.contractValue is the override total so the engine derives the
  // new per-row netDue at fixed contract value rather than from
  // currentCount * pricePerStudent. Locked rows preserve receivedAmount
  // as netDue; the carry from any locked-row delta is absorbed by the
  // unpaid rows in proportion to their pctDue. No Adjustment entity is
  // created here (Pranav's stated model: "adjustments will be made in
  // the next PIs", which is what the netDue redistribution captures).
  const recalcInputs: Payment[] = existing.map((p, i) => ({
    ...p,
    percentShare: args.rows[i]!.pctDue,
  }))
  const recalcResult = recalcInstallments({
    pricePerStudent: mou.spWithTax,
    currentCount: mou.studentsActual ?? mou.studentsMou,
    installments: recalcInputs,
    newContractValue: mou.contractValue,
  })
  const newExpectedById = new Map(
    recalcResult.rows.map((r) => [r.paymentId, r.netDue]),
  )

  const ts = deps.now().toISOString()
  const mouAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: {
      installmentExpected: existing.map((p) => ({ id: p.id, expected: p.expectedAmount })),
    },
    after: {
      installmentExpected: existing.map((p) => ({
        id: p.id,
        expected: newExpectedById.get(p.id) ?? p.expectedAmount,
      })),
    },
    notes: `Override locked schedule: ${reason}`,
  }

  let touched = 0
  for (let i = 0; i < existing.length; i++) {
    const prior = existing[i]!
    const row = args.rows[i]!
    const recalcNetDue = newExpectedById.get(prior.id) ?? prior.expectedAmount
    // The engine returns netDue for every row. Locked rows return
    // receivedAmount (unchanged from prior.expectedAmount in the
    // common case where expectedAmount == receivedAmount); unpaid rows
    // return the spread-by-weight allocation.
    const newExpected = recalcNetDue
    const expectedChanged = Math.abs(newExpected - prior.expectedAmount) > 0.01
    void expectedChanged
    const update = expectedChanged ? { newExpectedAmount: newExpected } : undefined
    const rowAudit: AuditEntry = {
      timestamp: ts,
      user: args.recordedBy,
      action: 'update',
      before: {
        expectedAmount: prior.expectedAmount,
        dueDateIso: prior.dueDateIso,
        notes: prior.notes,
      },
      after: {
        expectedAmount: newExpected,
        dueDateIso: row.dueDateIso,
        notes: row.notes,
      },
      notes: update
        ? `Override save: re-priced from Rs ${prior.expectedAmount.toLocaleString('en-IN')} to Rs ${newExpected.toLocaleString('en-IN')}.`
        : `Override save: due date / notes updated, expected preserved (locked).`,
    }
    const updated: Payment = {
      ...prior,
      expectedAmount: newExpected,
      dueDateRaw: row.dueDateIso,
      dueDateIso: row.dueDateIso,
      notes: row.notes,
      auditLog: [...(prior.auditLog ?? []), rowAudit],
    }
    await deps.enqueue({
      queuedBy: args.recordedBy,
      entity: 'payment',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
    touched += 1
  }

  // Phase 6D Part 4: Adjustment-entity creation retired. The locked-row
  // delta is now absorbed by the unpaid-row spread inside
  // recalcInstallments; no separate Adjustment entity is required.
  // The return shape keeps `adjustmentsCount` for API compatibility,
  // pinned to 0.
  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: {
      ...mou,
      auditLog: [...(mou.auditLog ?? []), mouAudit],
    } as unknown as Record<string, unknown>,
  })

  return {
    ok: true,
    touchedPayments: touched,
    createdPayments: 0,
    deletedPayments: 0,
    adjustmentsCount: 0,
  }
}
