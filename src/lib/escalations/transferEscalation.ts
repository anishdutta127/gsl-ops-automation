/*
 * Escalation transfer flow (Gate 1 Step 5 / MM5).
 *
 * Workflow per the brief:
 *   1. Sender (any active member of the current owning department, or
 *      Admin) calls transferEscalation with target department + reason.
 *   2. Status flips to 'Transferred'; ownedByDepartment switches to
 *      target; transferredFromDepartment + transferredToDepartment +
 *      transferredAt + transferReason capture the audit.
 *   3. assignedTo is cleared so the receiving dept must claim.
 *   4. claimEscalation lets a member of the receiving dept set
 *      assignedTo = self and flip status to 'WIP'.
 *
 * Notification fan-out is deferred to Gate 4 (the unified
 * notifications module). The audit log entry on transfer is the
 * primary signal for now.
 */

import type {
  AuditEntry,
  Department,
  Escalation,
  PendingUpdate,
  User,
} from '../types'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
import { canManageEscalations } from '../access'
import { getDepartment } from '../access'
import { enqueueUpdate } from '../pendingUpdates'

export interface TransferEscalationArgs {
  id: string
  targetDepartment: 'sales' | 'ops' | 'finance'
  reason: string
  transferredBy: string
  notes?: string | null
}

export type TransferEscalationFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'escalation-not-found'
  | 'invalid-target'
  | 'same-department'
  | 'already-closed'
  | 'missing-reason'

export type TransferEscalationResult =
  | { ok: true; escalation: Escalation }
  | { ok: false; reason: TransferEscalationFailureReason }

export interface TransferEscalationDeps {
  escalations: Escalation[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('../types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: TransferEscalationDeps = {
  escalations: escalationsJson as unknown as Escalation[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

const VALID_TARGETS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

export async function transferEscalation(
  args: TransferEscalationArgs,
  deps: TransferEscalationDeps = defaultDeps,
): Promise<TransferEscalationResult> {
  const user = deps.users.find((u) => u.id === args.transferredBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canManageEscalations(user)) return { ok: false, reason: 'permission' }
  if (!VALID_TARGETS.includes(args.targetDepartment)) {
    return { ok: false, reason: 'invalid-target' }
  }
  if (!args.reason || args.reason.trim() === '') {
    return { ok: false, reason: 'missing-reason' }
  }
  const existing = deps.escalations.find((e) => e.id === args.id)
  if (!existing) return { ok: false, reason: 'escalation-not-found' }
  if (existing.status === 'Closed') return { ok: false, reason: 'already-closed' }
  const currentOwner: Department = existing.ownedByDepartment ?? null
  if (currentOwner === args.targetDepartment) {
    return { ok: false, reason: 'same-department' }
  }

  const ts = deps.now().toISOString()
  const updated: Escalation = {
    ...existing,
    status: 'Transferred',
    ownedByDepartment: args.targetDepartment,
    transferredFromDepartment: currentOwner,
    transferredToDepartment: args.targetDepartment,
    transferredAt: ts,
    transferReason: args.reason.trim(),
    assignedTo: null,
    auditLog: [
      ...existing.auditLog,
      {
        timestamp: ts,
        user: args.transferredBy,
        action: 'update',
        before: {
          status: existing.status,
          ownedByDepartment: currentOwner,
          assignedTo: existing.assignedTo,
        },
        after: {
          status: 'Transferred',
          ownedByDepartment: args.targetDepartment,
          assignedTo: null,
        },
        notes:
          args.notes ??
          `Transferred from ${currentOwner ?? 'unassigned'} to ${args.targetDepartment}: ${args.reason.trim()}`,
      } satisfies AuditEntry,
    ],
  }

  await deps.enqueue({
    queuedBy: args.transferredBy,
    entity: 'escalation',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, escalation: updated }
}

export interface ClaimEscalationArgs {
  id: string
  claimedBy: string
}

export type ClaimEscalationFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'escalation-not-found'
  | 'not-transferred'
  | 'wrong-department'

export type ClaimEscalationResult =
  | { ok: true; escalation: Escalation }
  | { ok: false; reason: ClaimEscalationFailureReason }

export async function claimEscalation(
  args: ClaimEscalationArgs,
  deps: TransferEscalationDeps = defaultDeps,
): Promise<ClaimEscalationResult> {
  const user = deps.users.find((u) => u.id === args.claimedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canManageEscalations(user)) return { ok: false, reason: 'permission' }
  const existing = deps.escalations.find((e) => e.id === args.id)
  if (!existing) return { ok: false, reason: 'escalation-not-found' }
  if (existing.status !== 'Transferred') return { ok: false, reason: 'not-transferred' }

  const userDept = getDepartment(user)
  // Admin with null department is the cross-functional wildcard and
  // can claim regardless of the target department; non-Admin members
  // must belong to the receiving department.
  const isAdminWildcard = user.role === 'Admin' && userDept === null
  if (!isAdminWildcard && userDept !== existing.ownedByDepartment) {
    return { ok: false, reason: 'wrong-department' }
  }

  const ts = deps.now().toISOString()
  const updated: Escalation = {
    ...existing,
    status: 'WIP',
    assignedTo: args.claimedBy,
    auditLog: [
      ...existing.auditLog,
      {
        timestamp: ts,
        user: args.claimedBy,
        action: 'update',
        before: { status: 'Transferred', assignedTo: existing.assignedTo },
        after: { status: 'WIP', assignedTo: args.claimedBy },
        notes: `Claimed by ${user.name} (${existing.ownedByDepartment ?? 'no dept'} dept).`,
      } satisfies AuditEntry,
    ],
  }

  await deps.enqueue({
    queuedBy: args.claimedBy,
    entity: 'escalation',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, escalation: updated }
}
