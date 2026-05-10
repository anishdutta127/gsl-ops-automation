/*
 * Reverse an adjustment (Gate 2 Step 6).
 *
 * Flips Adjustment.status from 'Active' to 'Reversed'. Idempotent: a
 * second click on an already-reversed adjustment returns
 * ok=false reason='already-reversed' so the UI can surface "already
 * reversed" without writing a no-op audit entry.
 *
 * Appends a single 'adjustment-reversed' audit entry to the parent
 * MOU's auditLog so the MOU detail page shows the reversal in history
 * without joining adjustments.json.
 *
 * Permission gate: canEditFinanceData (Finance + cross-functional Admin).
 */

import type {
  Adjustment,
  AuditEntry,
  MOU,
  User,
} from '@/lib/types'
import adjustmentsJson from '@/data/adjustments.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canEditFinanceData } from '@/lib/access'

export interface ReverseAdjustmentArgs {
  adjustmentId: string
  reversedBy: string
  reason: string | null
}

export type ReverseAdjustmentFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'adjustment-not-found'
  | 'already-reversed'

export type ReverseAdjustmentOutcome =
  | { ok: true; adjustment: Adjustment }
  | { ok: false; reason: ReverseAdjustmentFailureReason }

export interface ReverseAdjustmentDeps {
  adjustments: Adjustment[]
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ReverseAdjustmentDeps = {
  adjustments: adjustmentsJson as unknown as Adjustment[],
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function reverseAdjustment(
  args: ReverseAdjustmentArgs,
  deps: ReverseAdjustmentDeps = defaultDeps,
): Promise<ReverseAdjustmentOutcome> {
  const user = deps.users.find((u) => u.id === args.reversedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }

  const adj = deps.adjustments.find((a) => a.id === args.adjustmentId)
  if (!adj) return { ok: false, reason: 'adjustment-not-found' }
  if (adj.status === 'Reversed') return { ok: false, reason: 'already-reversed' }

  const ts = deps.now().toISOString()
  const reasonNotes = (args.reason ?? '').trim() || null

  const updated: Adjustment = { ...adj, status: 'Reversed' }

  await deps.enqueue({
    queuedBy: args.reversedBy,
    entity: 'adjustment',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  const mou = deps.mous.find((m) => m.id === adj.mouId)
  if (mou) {
    const audit: AuditEntry = {
      timestamp: ts,
      user: args.reversedBy,
      action: 'adjustment-reversed',
      before: { status: 'Active', amountDelta: adj.amountDelta },
      after: { status: 'Reversed', adjustmentId: adj.id },
      notes:
        reasonNotes !== null
          ? `Reversed adjustment ${adj.id} for Rs ${adj.amountDelta.toLocaleString('en-IN')}. ${reasonNotes}`
          : `Reversed adjustment ${adj.id} for Rs ${adj.amountDelta.toLocaleString('en-IN')}.`,
    }
    const updatedMou: MOU = {
      ...mou,
      auditLog: [...mou.auditLog, audit],
    }
    await deps.enqueue({
      queuedBy: args.reversedBy,
      entity: 'mou',
      operation: 'update',
      payload: updatedMou as unknown as Record<string, unknown>,
    })
  }

  return { ok: true, adjustment: updated }
}
