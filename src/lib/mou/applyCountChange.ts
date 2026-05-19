/*
 * applyCountChange (Phase 5, 2026-05-19).
 *
 * Write path for the student-count change flow. Pure function over
 * the MOU + Payment fixtures + the operator-supplied event input.
 * Returns the StudentCountEvent record to create + the per-Payment
 * updates to enqueue. Callers persist via enqueueUpdate.
 *
 *   1. Resolve the previous count via getCurrentStudentCountFor(mou,
 *      events).
 *   2. Backfill `percentShare` on every Payment row if missing
 *      (from `expectedAmount / signingContractValue * 100`). Without
 *      this, the recalc engine cannot preserve the original share
 *      ratios across multiple recalcs.
 *   3. Run recalcInstallments at the new count.
 *   4. Build a StudentCountEvent with the recalc impact summary.
 *   5. Return Payment-row updates with new nominalAmount /
 *      adjustmentFromLockedInstallments / netDue / expectedAmount.
 *      `expectedAmount` mirrors `netDue` for unpaid rows so the
 *      operational read path keeps working without change.
 *
 * Permission: canEditMOU OR canEditFinanceData. Sales + Finance can
 * both record a count change; Pranav typically does it (Finance)
 * but Sales captures it for new schools.
 */

import type {
  AuditEntry,
  MOU,
  Payment,
  StudentCountEvent,
  StudentCountEventRecalcImpact,
  User,
} from '@/lib/types'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { recalcInstallments, type RecalcInstalmentRow } from './studentCountRecalc'

export interface ApplyCountChangeArgs {
  mouId: string
  newCount: number
  effectiveDate: string                  // ISO yyyy-mm-dd
  reason: string                         // form requires >= 10 chars; lib only checks non-empty
  relatedInstallmentId?: string | null
  notes?: string | null
  recordedBy: string                     // User.id
}

export interface ApplyCountChangePayloads {
  event: StudentCountEvent
  mouUpdate: MOU
  paymentUpdates: Payment[]
}

export type ApplyCountChangeFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'invalid-count'
  | 'no-change'
  | 'invalid-reason'
  | 'invalid-date'
  | 'reconciliation-failure'

export type ApplyCountChangeResult =
  | { ok: true; payloads: ApplyCountChangePayloads }
  | { ok: false; reason: ApplyCountChangeFailureReason }

export interface ApplyCountChangeDeps {
  mous: MOU[]
  payments: Payment[]
  users: User[]
  events: StudentCountEvent[]            // existing events, for id minting + previousCount derivation
  now: () => Date
}

/**
 * Returns the latest recorded count for the MOU, falling back to
 * `studentsActual ?? studentsMou` when no event exists. Pure helper
 * used by both the apply path and any display surface that wants
 * the current count.
 */
export function getCurrentStudentCountFor(
  mou: MOU,
  events: StudentCountEvent[],
): number {
  const own = events.filter((e) => e.mouId === mou.id)
  if (own.length === 0) {
    return mou.studentsActual ?? mou.studentsMou
  }
  const latest = own.reduce((acc, e) =>
    e.recordedAt > acc.recordedAt ? e : acc,
  )
  return latest.newCount
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function mintEventId(events: StudentCountEvent[], year: number): string {
  const prefix = `SCE-${year}-`
  let highest = 0
  for (const e of events) {
    if (!e.id.startsWith(prefix)) continue
    const tail = Number(e.id.slice(prefix.length))
    if (Number.isFinite(tail) && tail > highest) highest = tail
  }
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/**
 * Compute the percentShare that should live on each Payment row.
 * When a row already carries `percentShare`, return it unchanged.
 * Otherwise derive from `expectedAmount / contractValue * 100`. This
 * runs only on first count change (when no row has been recalc'd
 * yet) so the ratios match the signing contract.
 */
function ensurePercentShares(
  installments: Payment[],
  signingContractValue: number,
): Payment[] {
  return installments.map((p) => {
    if (typeof p.percentShare === 'number' && p.percentShare > 0) return p
    if (signingContractValue <= 0) {
      return { ...p, percentShare: 0 }
    }
    return {
      ...p,
      percentShare: (p.expectedAmount / signingContractValue) * 100,
    }
  })
}

export function applyCountChange(
  args: ApplyCountChangeArgs,
  deps: ApplyCountChangeDeps,
): ApplyCountChangeResult {
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditMOU(user) && !canEditFinanceData(user)) {
    return { ok: false, reason: 'permission' }
  }

  if (!ISO_DATE_RE.test(args.effectiveDate)) {
    return { ok: false, reason: 'invalid-date' }
  }
  if (!Number.isFinite(args.newCount) || args.newCount <= 0) {
    return { ok: false, reason: 'invalid-count' }
  }
  if (!args.reason || args.reason.trim() === '') {
    return { ok: false, reason: 'invalid-reason' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const previousCount = getCurrentStudentCountFor(mou, deps.events)
  if (args.newCount === previousCount) {
    return { ok: false, reason: 'no-change' }
  }

  const ownPayments = deps.payments.filter((p) => p.mouId === mou.id)
  if (ownPayments.length === 0) {
    // No instalments to recalc; record the event as a count-only
    // audit-trail entry with an empty recalcImpact.
    const ts = deps.now().toISOString()
    const year = new Date(ts).getUTCFullYear()
    const event: StudentCountEvent = {
      id: mintEventId(deps.events, year),
      mouId: mou.id,
      newCount: args.newCount,
      previousCount,
      effectiveDate: args.effectiveDate,
      recordedAt: ts,
      recordedBy: args.recordedBy,
      reason: args.reason.trim(),
      relatedInstallmentId: args.relatedInstallmentId ?? null,
      notes: args.notes?.trim() || null,
      recalcImpact: {
        installmentsAffected: [],
        previousExpectedTotal: 0,
        newExpectedTotal: 0,
        adjustmentApplied: {
          toInstallmentId: null,
          previousNetDue: 0,
          newNetDue: 0,
          cumulativeDelta: 0,
        },
      },
      auditLog: [
        {
          timestamp: ts,
          user: args.recordedBy,
          action: 'create',
          notes: `Student count changed from ${previousCount} to ${args.newCount} (no instalments to recalc).`,
        },
      ],
    }
    const mouUpdate: MOU = {
      ...mou,
      studentsActual: args.newCount,
      studentCountEventIds: [...(mou.studentCountEventIds ?? []), event.id],
      auditLog: [
        ...mou.auditLog,
        {
          timestamp: ts,
          user: args.recordedBy,
          action: 'student-count-changed',
          before: { studentsActual: mou.studentsActual, count: previousCount },
          after: { studentsActual: args.newCount, count: args.newCount, eventId: event.id },
          notes: `Count change to ${args.newCount}: ${args.reason.trim()}`,
        },
      ],
    }
    return { ok: true, payloads: { event, mouUpdate, paymentUpdates: [] } }
  }

  const withShares = ensurePercentShares(ownPayments, mou.contractValue)
  const result = recalcInstallments({
    pricePerStudent: mou.spWithTax,
    currentCount: args.newCount,
    installments: withShares,
  })

  // Build the per-Payment updates. We only emit a payment write when
  // a row's nominalAmount / netDue / adjustmentFromLockedInstallments
  // actually differs from what's stored; locked rows whose
  // lockedDeltaContribution is zero produce no payment update.
  const ts = deps.now().toISOString()
  const year = new Date(ts).getUTCFullYear()
  const eventId = mintEventId(deps.events, year)
  const paymentUpdates: Payment[] = []
  const installmentsAffected: string[] = []

  for (const row of result.rows) {
    const original = withShares.find((p) => p.id === row.paymentId)
    if (!original) continue
    const changed =
      original.nominalAmount !== row.nominalAmount ||
      original.adjustmentFromLockedInstallments !== row.adjustmentFromLockedInstallments ||
      original.netDue !== row.netDue ||
      original.percentShare !== row.percentShare ||
      (!row.isLocked && original.expectedAmount !== row.netDue)
    if (!changed) continue
    const auditNotes =
      row.isLocked
        ? `Locked row; netDue stays at receivedAmount. Theoretical nominal at new count = Rs ${row.nominalAmount.toLocaleString('en-IN')}.`
        : `Recalculated at ${args.newCount} students. Nominal Rs ${row.nominalAmount.toLocaleString('en-IN')}${row.adjustmentFromLockedInstallments !== 0 ? `, adjustment Rs ${row.adjustmentFromLockedInstallments.toLocaleString('en-IN')}` : ''}, net due Rs ${row.netDue.toLocaleString('en-IN')}.`
    const auditEntry: AuditEntry = {
      timestamp: ts,
      user: args.recordedBy,
      action: 'student-count-changed',
      before: {
        nominalAmount: original.nominalAmount ?? null,
        adjustmentFromLockedInstallments: original.adjustmentFromLockedInstallments ?? null,
        netDue: original.netDue ?? null,
        expectedAmount: original.expectedAmount,
      },
      after: {
        nominalAmount: row.nominalAmount,
        adjustmentFromLockedInstallments: row.adjustmentFromLockedInstallments,
        netDue: row.netDue,
        expectedAmount: row.isLocked ? original.expectedAmount : row.netDue,
        eventId,
      },
      notes: auditNotes,
    }
    paymentUpdates.push({
      ...original,
      percentShare: row.percentShare,
      nominalAmount: row.nominalAmount,
      adjustmentFromLockedInstallments: row.adjustmentFromLockedInstallments,
      netDue: row.netDue,
      // For unpaid rows we mirror netDue onto expectedAmount so the
      // legacy display surfaces keep working. Locked rows retain
      // their immutable expectedAmount.
      expectedAmount: row.isLocked ? original.expectedAmount : row.netDue,
      isLocked: row.isLocked,
      lockedAt: row.isLocked
        ? original.lockedAt ?? original.receivedDate ?? null
        : original.lockedAt ?? null,
      auditLog: [...(original.auditLog ?? []), auditEntry],
    })
    installmentsAffected.push(row.paymentId)
  }

  const adjustingRow = result.rows.find((r) => r.paymentId === result.firstUnpaidId)
  const previousNetDueOnAdjuster =
    adjustingRow
      ? (withShares.find((p) => p.id === adjustingRow.paymentId)?.netDue ??
          withShares.find((p) => p.id === adjustingRow.paymentId)?.expectedAmount ??
          0)
      : 0
  const recalcImpact: StudentCountEventRecalcImpact = {
    installmentsAffected,
    previousExpectedTotal: withShares.reduce((s, p) => s + p.expectedAmount, 0),
    newExpectedTotal: result.totalCommitted,
    adjustmentApplied: {
      toInstallmentId: result.firstUnpaidId,
      previousNetDue: previousNetDueOnAdjuster,
      newNetDue: adjustingRow?.netDue ?? 0,
      cumulativeDelta: result.cumulativeDelta,
    },
  }

  const event: StudentCountEvent = {
    id: eventId,
    mouId: mou.id,
    newCount: args.newCount,
    previousCount,
    effectiveDate: args.effectiveDate,
    recordedAt: ts,
    recordedBy: args.recordedBy,
    reason: args.reason.trim(),
    relatedInstallmentId: args.relatedInstallmentId ?? null,
    notes: args.notes?.trim() || null,
    recalcImpact,
    auditLog: [
      {
        timestamp: ts,
        user: args.recordedBy,
        action: 'create',
        notes: `Student count: ${previousCount} -> ${args.newCount}. ${installmentsAffected.length} instalment${installmentsAffected.length === 1 ? '' : 's'} updated.${result.reconciled ? '' : ' Reconciliation gap; review carry.'}`,
      },
    ],
  }

  const mouUpdate: MOU = {
    ...mou,
    studentsActual: args.newCount,
    studentCountEventIds: [...(mou.studentCountEventIds ?? []), event.id],
    auditLog: [
      ...mou.auditLog,
      {
        timestamp: ts,
        user: args.recordedBy,
        action: 'student-count-changed',
        before: {
          studentsActual: mou.studentsActual,
          count: previousCount,
        },
        after: {
          studentsActual: args.newCount,
          count: args.newCount,
          eventId: event.id,
          cumulativeDelta: result.cumulativeDelta,
          installmentsAffected,
        },
        notes: `Count change to ${args.newCount}: ${args.reason.trim()}`,
      },
    ],
  }

  return {
    ok: true,
    payloads: { event, mouUpdate, paymentUpdates },
  }
}

// Re-export the engine row shape so UI components can use it for
// the preview render without re-importing from a sibling module.
export type { RecalcInstalmentRow }
