/*
 * Edit lifecycle rule (W3-D).
 *
 * Validates input, enforces 'lifecycle-rule:edit' permission, builds
 * the updated rule with a fresh audit entry capturing the before /
 * after defaultDays + the operator's optional changeNotes, and
 * enqueues a 'lifecycleRule' update through the existing
 * pendingUpdates queue. Returns a discriminated result.
 *
 * Retroactive shift: changing defaultDays affects which MOUs render
 * as overdue on the kanban's NEXT render. The substantive shift is
 * just the kanban Server Component re-reading lifecycle_rules.json
 * via getStageDurationDays. Documented at the page level so
 * operators understand the cross-cutting effect.
 *
 * Bounds: defaultDays must be a positive integer in [1, 365]. Zero
 * and negative values are rejected to avoid trivially-overdue
 * cards; the 365 ceiling is a sanity check (no stage should
 * realistically span a year).
 */

import type { AuditEntry, LifecycleRule, User } from '@/lib/types'
import lifecycleRulesJson from '@/data/lifecycle_rules.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const MIN_DAYS = 1
const MAX_DAYS = 365

export interface EditLifecycleRuleArgs {
  stageFromKey: string
  defaultDays: number
  changeNotes?: string
  editedBy: string  // User.id
}

export type EditLifecycleRuleFailureReason =
  | 'rule-not-found'
  | 'invalid-days'           // not finite, < 1, > 365, not integer
  | 'no-change'              // submitted value matches current
  | 'permission'
  | 'unknown-user'

export type EditLifecycleRuleResult =
  | { ok: true; rule: LifecycleRule }
  | { ok: false; reason: EditLifecycleRuleFailureReason }

export interface EditLifecycleRuleDeps {
  rules: LifecycleRule[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: EditLifecycleRuleDeps = {
  rules: lifecycleRulesJson as unknown as LifecycleRule[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function editLifecycleRule(
  args: EditLifecycleRuleArgs,
  deps: EditLifecycleRuleDeps = defaultDeps,
): Promise<EditLifecycleRuleResult> {
  if (
    typeof args.defaultDays !== 'number' ||
    !Number.isFinite(args.defaultDays) ||
    !Number.isInteger(args.defaultDays) ||
    args.defaultDays < MIN_DAYS ||
    args.defaultDays > MAX_DAYS
  ) {
    return { ok: false, reason: 'invalid-days' }
  }

  const rule = deps.rules.find((r) => r.stageFromKey === args.stageFromKey)
  if (!rule) return { ok: false, reason: 'rule-not-found' }

  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'lifecycle-rule:edit')) {
    return { ok: false, reason: 'permission' }
  }

  if (rule.defaultDays === args.defaultDays) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'lifecycle-rule-edited',
    before: { defaultDays: rule.defaultDays },
    after: { defaultDays: args.defaultDays },
    notes: (args.changeNotes ?? '').trim() || undefined,
  }

  const updated: LifecycleRule = {
    ...rule,
    defaultDays: args.defaultDays,
    updatedAt: ts,
    updatedBy: args.editedBy,
    auditLog: [...rule.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'lifecycleRule',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, rule: updated }
}
