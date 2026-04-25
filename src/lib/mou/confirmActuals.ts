/*
 * MOU actuals confirmation (Phase C4 hybrid; first lifecycle stage
 * with a real API + lib).
 *
 * Pure async function. Validates inputs, computes variance + variance
 * percentage, builds the updated MOU with an 'actuals-confirmed'
 * auditLog entry, and enqueues the queue write. Returns a
 * discriminated result.
 *
 * Drift detection: if |variancePct| > 0.10 strictly, the result is
 * marked needsDriftReview=true. The badge UI consumes this flag.
 * Queue routing to Pratik's Sales Head queue is deferred to Phase D
 * (separate /admin/drift-approvals surface); for C4 we only compute
 * + flag.
 *
 * Permission gate: caller must hold the 'mou:confirm-actuals' Action
 * (Admin / SalesHead / SalesRep per Item B). Cross-verify (per
 * handoff: "OpsHead cross-verifies") is documentation-grade in
 * Phase 1, not a separate UI gate; the actuals page surfaces a single
 * submit action for both gather and sign-off paths. Phase 1.1 may
 * add a dedicated 'mou:verify-actuals' Action and a "Verify" button
 * if testers ask for it.
 */

import type { AuditEntry, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

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
  | { ok: true; mou: MOU; needsDriftReview: boolean; variancePct: number }
  | { ok: false; reason: ConfirmActualsFailureReason }

export interface ConfirmActualsDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ConfirmActualsDeps = {
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export function isDriftReviewRequired(variancePct: number): boolean {
  return Math.abs(variancePct) > DRIFT_THRESHOLD
}

export async function confirmActuals(
  args: ConfirmActualsArgs,
  deps: ConfirmActualsDeps = defaultDeps,
): Promise<ConfirmActualsResult> {
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

  const updatedMou: MOU = {
    ...mou,
    studentsActual: args.studentsActual,
    studentsVariance: variance,
    studentsVariancePct: variancePct,
    auditLog: [...mou.auditLog, auditEntry],
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
  }
}
