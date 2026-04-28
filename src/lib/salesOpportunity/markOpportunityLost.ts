/*
 * W4-F.3 markOpportunityLost.
 *
 * Sets lossReason on a SalesOpportunity. Does NOT delete the row;
 * preserves history for the round-2 review of "what made
 * opportunities fall out of the pipeline?". Audit captures the
 * lossReason verbatim.
 *
 * Permission gate: 'sales-opportunity:mark-lost'. Lib enforces own-
 * row vs any-row via createdBy comparison: SalesRep on own only;
 * SalesHead + Admin on any row.
 *
 * Idempotency: if lossReason is already set, returns 'already-lost'
 * without writing. Operators correcting the reason use
 * editOpportunity instead.
 */

import type {
  AuditEntry,
  PendingUpdate,
  SalesOpportunity,
  User,
} from '@/lib/types'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export interface MarkOpportunityLostArgs {
  id: string
  lossReason: string
  markedBy: string
  notes?: string | null
}

export type MarkOpportunityLostFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'opportunity-not-found'
  | 'not-creator-and-not-lead'
  | 'missing-loss-reason'
  | 'already-lost'

export type MarkOpportunityLostResult =
  | { ok: true; opportunity: SalesOpportunity }
  | { ok: false; reason: MarkOpportunityLostFailureReason }

export interface MarkOpportunityLostDeps {
  opportunities: SalesOpportunity[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: MarkOpportunityLostDeps = {
  opportunities: salesOpportunitiesJson as unknown as SalesOpportunity[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function canMarkAnyRow(user: User): boolean {
  return user.role === 'Admin' || user.role === 'SalesHead'
}

export async function markOpportunityLost(
  args: MarkOpportunityLostArgs,
  deps: MarkOpportunityLostDeps = defaultDeps,
): Promise<MarkOpportunityLostResult> {
  const user = deps.users.find((u) => u.id === args.markedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'sales-opportunity:mark-lost')) {
    return { ok: false, reason: 'permission' }
  }
  const reason = args.lossReason.trim()
  if (reason === '') return { ok: false, reason: 'missing-loss-reason' }

  const existing = deps.opportunities.find((o) => o.id === args.id)
  if (!existing) return { ok: false, reason: 'opportunity-not-found' }
  if (!canMarkAnyRow(user) && existing.createdBy !== args.markedBy) {
    return { ok: false, reason: 'not-creator-and-not-lead' }
  }
  if (existing.lossReason !== null) {
    return { ok: false, reason: 'already-lost' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.markedBy,
    action: 'opportunity-marked-lost',
    before: { lossReason: null },
    after: { lossReason: reason },
    notes: args.notes ? `${args.notes} | Loss reason: ${reason}` : `Loss reason: ${reason}`,
  }

  const updated: SalesOpportunity = {
    ...existing,
    lossReason: reason,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.markedBy,
    entity: 'salesOpportunity',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, opportunity: updated }
}
