/*
 * MOU actuals confirmation.
 *
 * Phase 6A (2026-05-20) revision per Pranav review #2: confirming
 * actuals now ALSO cascades the count change through the recalc
 * engine. Pre-Phase-6A this lib only updated `studentsActual` on the
 * MOU and left the Payment rows alone, so an operator who clicked the
 * "Update Actual student count" icon on the instalments page (which
 * still links to /actuals) would see no instalment recalculation.
 * Pranav hit exactly this on MOU-STEAM-2627-001 (Mutahhary Public
 * School Baroo): count changed from 500 to 450, but PI 2 / 3 / 4
 * stayed at Rs 1,20,000 each instead of redistributing.
 *
 * Behaviour now: after computing the variance + drift state, if the
 * count actually changed AND the MOU has Payment rows, the lib
 * delegates to applyCountChange to mint a StudentCountEvent and
 * rewrite the unpaid Payment rows. The MOU update is enqueued once
 * with both audit entries (actuals-confirmed AND student-count-changed)
 * stacked, plus the appended studentCountEventIds pointer. The order
 * of writes that hit the queue is: studentCountEvent create →
 * payment updates → mou update (single combined record). The order
 * matches the existing student-count route.
 *
 * Drift detection: if |variancePct| > 0.10 strictly, the result is
 * marked needsDriftReview=true. The badge UI consumes this flag.
 *
 * Permission gate: caller must hold the 'mou:confirm-actuals' Action.
 */

import type {
  AuditEntry,
  MOU,
  Payment,
  StudentCountEvent,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import { applyCountChange } from './applyCountChange'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { studentCountEventRepo } from '@/lib/db/repos/leafRepos'

const STUDENTS_MAX = 20000
const DRIFT_THRESHOLD = 0.10  // strict greater than triggers review

export interface ConfirmActualsArgs {
  mouId: string
  studentsActual: number
  confirmedBy: string         // User.id
  notes?: string
}

export type ConfirmActualsFailureReason =
  | 'mou-not-found'
  | 'invalid-students'        // <= 0 or > 20000 or not finite number
  | 'wrong-status'            // MOU not in Active state
  | 'permission'
  | 'unknown-user'

export type ConfirmActualsResult =
  | { ok: true; mou: MOU; needsDriftReview: boolean; variancePct: number; recalcCascadeApplied: boolean }
  | { ok: false; reason: ConfirmActualsFailureReason }

export interface ConfirmActualsDeps {
  mous: MOU[]
  users: User[]
  payments?: Payment[]
  events?: StudentCountEvent[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<ConfirmActualsDeps> {
  const [mous, users, payments, events] = await Promise.all([
    mouRepo.findAll(),
    userRepo.findAll(),
    paymentRepo.findAll(),
    studentCountEventRepo.findAll() as unknown as Promise<StudentCountEvent[]>,
  ])
  return { mous, users, payments, events, enqueue: enqueueUpdate, now: () => new Date() }
}

export function isDriftReviewRequired(variancePct: number): boolean {
  return Math.abs(variancePct) > DRIFT_THRESHOLD
}

export async function confirmActuals(
  args: ConfirmActualsArgs,
  depsOverride?: ConfirmActualsDeps,
): Promise<ConfirmActualsResult> {
  const deps = depsOverride ?? (await defaultDeps())
  if (
    typeof args.studentsActual !== 'number' ||
    !Number.isFinite(args.studentsActual) ||
    args.studentsActual <= 0 ||
    args.studentsActual > STUDENTS_MAX
  ) {
    return { ok: false, reason: 'invalid-students' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  if (mou.status !== 'Active') return { ok: false, reason: 'wrong-status' }

  const user = deps.users.find((u) => u.id === args.confirmedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:confirm-actuals')) {
    return { ok: false, reason: 'permission' }
  }

  const variance = args.studentsActual - mou.studentsMou
  const variancePct = mou.studentsMou > 0 ? variance / mou.studentsMou : 0
  const ts = deps.now().toISOString()

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.confirmedBy,
    action: 'actuals-confirmed',
    before: {
      studentsActual: mou.studentsActual,
      studentsVariance: mou.studentsVariance,
      studentsVariancePct: mou.studentsVariancePct,
    },
    after: {
      studentsActual: args.studentsActual,
      studentsVariance: variance,
      studentsVariancePct: variancePct,
    },
    notes: args.notes,
  }

  // Decide whether to cascade through the recalc engine. We cascade
  // when (a) the count actually changed from the previously-recorded
  // count and (b) the MOU has Payment rows to recalculate. The
  // previous count is studentsActual (or studentsMou when the actuals
  // have never been recorded). Cascading mints a StudentCountEvent +
  // rewrites unpaid Payment rows in the same way the dedicated
  // /mous/[id]/student-count flow does.
  const previousCount = mou.studentsActual ?? mou.studentsMou
  const countChanged = args.studentsActual !== previousCount
  const ownPayments = (deps.payments ?? []).filter((p) => p.mouId === mou.id)
  const shouldCascade = countChanged && ownPayments.length > 0

  let cascadeApplied = false
  let cascadeAuditEntry: AuditEntry | null = null
  let cascadeEventId: string | null = null

  if (shouldCascade) {
    const cascade = applyCountChange(
      {
        mouId: mou.id,
        newCount: args.studentsActual,
        effectiveDate: ts.slice(0, 10),
        reason: `Actuals confirmation: count moved from ${previousCount} to ${args.studentsActual}.`,
        recordedBy: args.confirmedBy,
        notes: args.notes ?? null,
      },
      {
        mous: deps.mous,
        payments: deps.payments ?? [],
        users: deps.users,
        events: deps.events ?? [],
        now: deps.now,
      },
    )
    if (cascade.ok) {
      cascadeApplied = true
      cascadeEventId = cascade.payloads.event.id
      // Pull out the student-count-changed audit entry that
      // applyCountChange built so we can stack it onto the single
      // MOU update we enqueue below.
      cascadeAuditEntry =
        cascade.payloads.mouUpdate.auditLog.find(
          (e) =>
            e.action === 'student-count-changed' &&
            e.timestamp === ts &&
            (e.after as Record<string, unknown> | undefined)?.eventId === cascade.payloads.event.id,
        ) ?? null
      // Enqueue the StudentCountEvent + per-Payment updates first; the
      // combined MOU update lands last so the drain order matches the
      // dedicated /student-count path.
      await deps.enqueue({
        queuedBy: args.confirmedBy,
        entity: 'studentCountEvent',
        operation: 'create',
        payload: cascade.payloads.event as unknown as Record<string, unknown>,
      })
      for (const p of cascade.payloads.paymentUpdates) {
        await deps.enqueue({
          queuedBy: args.confirmedBy,
          entity: 'payment',
          operation: 'update',
          payload: p as unknown as Record<string, unknown>,
        })
      }
    }
  }

  const stackedAuditLog: AuditEntry[] = [...mou.auditLog, auditEntry]
  if (cascadeAuditEntry) stackedAuditLog.push(cascadeAuditEntry)

  const updatedMou: MOU = {
    ...mou,
    studentsActual: args.studentsActual,
    studentsVariance: variance,
    studentsVariancePct: variancePct,
    studentCountEventIds: cascadeEventId
      ? [...(mou.studentCountEventIds ?? []), cascadeEventId]
      : mou.studentCountEventIds,
    auditLog: stackedAuditLog,
  }

  await deps.enqueue({
    queuedBy: args.confirmedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  return {
    ok: true,
    mou: updatedMou,
    needsDriftReview: isDriftReviewRequired(variancePct),
    variancePct,
    recalcCascadeApplied: cascadeApplied,
  }
}
