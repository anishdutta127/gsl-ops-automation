/*
 * CcRule toggle (Phase C5a-2).
 *
 * Flips CcRule.enabled, recording 'cc-rule-toggle-on' or
 * 'cc-rule-toggle-off' in the rule's auditLog (the toggle-specific
 * actions are intentional: queries like "how many rules were toggled
 * off this week" read from these actions, not generic 'update').
 *
 * Disabling sets disabledAt, disabledBy, disabledReason.
 * Re-enabling clears all three. The reason is required when
 * disabling so the audit anchor is legible without forcing reviewers
 * to dig through Slack history.
 *
 * Permission gate: 'cc-rule:toggle' (Admin via wildcard, OpsHead via
 * explicit grant). Distinct from 'cc-rule:edit' even though the role
 * sets currently overlap; future grant changes can diverge without
 * code changes here.
 */

import type {
  AuditEntry,
  CcRule,
  User,
} from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

export interface ToggleCcRuleArgs {
  ruleId: string
  enabled: boolean
  toggledBy: string
  reason?: string
}

export type ToggleCcRuleFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'rule-not-found'
  | 'already-in-state'
  | 'reason-required'

export type ToggleCcRuleResult =
  | { ok: true; rule: CcRule }
  | { ok: false; reason: ToggleCcRuleFailureReason }

export interface ToggleCcRuleDeps {
  rules: CcRule[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ToggleCcRuleDeps = {
  rules: ccRulesJson as unknown as CcRule[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function toggleCcRule(
  args: ToggleCcRuleArgs,
  deps: ToggleCcRuleDeps = defaultDeps,
): Promise<ToggleCcRuleResult> {
  const user = deps.users.find((u) => u.id === args.toggledBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'cc-rule:toggle')) {
    return { ok: false, reason: 'permission' }
  }

  const rule = deps.rules.find((r) => r.id === args.ruleId)
  if (!rule) return { ok: false, reason: 'rule-not-found' }

  if (rule.enabled === args.enabled) {
    return { ok: false, reason: 'already-in-state' }
  }

  const trimmedReason = (args.reason ?? '').trim()
  if (!args.enabled && trimmedReason === '') {
    return { ok: false, reason: 'reason-required' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.toggledBy,
    action: args.enabled ? 'cc-rule-toggle-on' : 'cc-rule-toggle-off',
    before: { enabled: rule.enabled },
    after: { enabled: args.enabled },
    notes: !args.enabled ? trimmedReason : undefined,
  }

  const next: CcRule = {
    ...rule,
    enabled: args.enabled,
    disabledAt: args.enabled ? null : ts,
    disabledBy: args.enabled ? null : args.toggledBy,
    disabledReason: args.enabled ? null : trimmedReason,
    auditLog: [...rule.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.toggledBy,
    entity: 'ccRule',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  return { ok: true, rule: next }
}
