/*
 * Manual Adjustment creation lib (Gate 5A.6 Step 5).
 *
 * Pranav creates an adjustment via /finance/adjustments/new when a
 * student-count change, fee revision, discount, or refund needs to
 * surface as an Adjustment row against a specific instalment. The
 * recalc engine consumes the resulting Adjustment via the next-unpaid
 * PI's "Balance due Previous Instalments / (Excess Received)" line.
 *
 * Required:
 *   - mouId
 *   - installmentId (the affected Payment row; required so the
 *     beforeAmount + afterAmount land coherently)
 *   - amountDelta (signed; negative = credit to school)
 *   - reason (>=10 chars)
 *
 * The lib computes:
 *   - beforeAmount = installment.expectedAmount
 *   - afterAmount  = installment.expectedAmount + amountDelta
 *   - appliedToInstallmentId = next-unlocked instalment if the
 *     supplied installmentId is locked (paid or PI sent), else the
 *     same installment.
 *
 * Permission: canEditFinanceData.
 */

import crypto from 'node:crypto'
import type {
  Adjustment,
  AdjustmentTrigger,
  AuditEntry,
  MOU,
  Payment,
  User,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'

export interface CreateAdjustmentArgs {
  mouId: string
  installmentId: string
  triggeredByEvent: AdjustmentTrigger
  amountDelta: number
  reason: string
  effectiveDate: string | null
  notes: string | null
  recordedBy: string
}

export type CreateAdjustmentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'installment-not-found'
  | 'installment-mismatch'
  | 'invalid-amount'
  | 'missing-reason'

export type CreateAdjustmentResult =
  | { ok: true; adjustment: Adjustment }
  | { ok: false; reason: CreateAdjustmentFailureReason }

export interface CreateAdjustmentDeps {
  mous: MOU[]
  payments: Payment[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

async function defaultDeps(): Promise<CreateAdjustmentDeps> {
  return {
  mous: await mouRepo.findAll() as MOU[],
  payments: await paymentRepo.findAll() as Payment[],
  users: await userRepo.findAll() as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}
}

function isLocked(p: Payment): boolean {
  if (p.piNumber !== null || p.piSentDate !== null) return true
  if (p.receivedAmount !== null && p.receivedAmount > 0) return true
  return false
}

export async function createAdjustment(
  args: CreateAdjustmentArgs,
  depsOverride?: CreateAdjustmentDeps,
): Promise<CreateAdjustmentResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  if (!Number.isFinite(args.amountDelta) || args.amountDelta === 0) {
    return { ok: false, reason: 'invalid-amount' }
  }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const installment = deps.payments.find((p) => p.id === args.installmentId)
  if (!installment) return { ok: false, reason: 'installment-not-found' }
  if (installment.mouId !== mou.id) {
    return { ok: false, reason: 'installment-mismatch' }
  }

  // If the source installment is locked, attach the credit/charge to
  // the next unlocked instalment so it actually nets out for the school.
  const mouPayments = deps.payments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
  const targetInstallment = isLocked(installment)
    ? mouPayments.find((p) => p.instalmentSeq > installment.instalmentSeq && !isLocked(p)) ?? null
    : installment
  const appliedToInstallmentId = targetInstallment?.id ?? null

  const beforeAmount = installment.expectedAmount
  const afterAmount = installment.expectedAmount + args.amountDelta

  const ts = deps.now().toISOString()
  const adjId = `ADJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const adj: Adjustment = {
    id: adjId,
    mouId: mou.id,
    schoolId: mou.schoolId,
    triggeredByEvent: args.triggeredByEvent,
    triggeredAt: ts,
    triggeredBy: args.recordedBy,
    originalInstallmentId: installment.id,
    appliedToInstallmentId,
    amountDelta: args.amountDelta,
    reason,
    beforeAmount,
    afterAmount,
    status: 'Active',
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'adjustment',
    operation: 'create',
    payload: adj as unknown as Record<string, unknown>,
  })

  const mouAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'create',
    notes: `Adjustment ${adjId} created against ${installment.id}: ${args.triggeredByEvent}, Rs ${args.amountDelta.toLocaleString('en-IN')}. ${reason}${args.notes ? ` (${args.notes})` : ''}`,
  }
  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: {
      ...mou,
      auditLog: [...(mou.auditLog ?? []), mouAudit],
    } as unknown as Record<string, unknown>,
  })

  return { ok: true, adjustment: adj }
}
