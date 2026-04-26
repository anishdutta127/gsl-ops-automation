/*
 * CcRule creation (Phase C5a-1).
 *
 * Admin-only for the first 30 days post-launch per step 10 Item 8.
 * The 'cc-rule:create' grant is scoped to Admin in permissions.ts;
 * the day-31 flip adds it to OpsHead. This lib defers to canPerform()
 * so the grant flip needs no change here.
 *
 * scopeValue accepts either a single string or string[] (mirrors the
 * heterogeneous shape in CcRule.scopeValue). The /admin/cc-rules/new
 * form parses comma-separated input into an array; single-token input
 * stays a string. The lib treats both as valid.
 *
 * id must follow the 'CCR-' prefix convention (see cc_rules.json
 * pre-seeded values e.g., 'CCR-SW-RAIPUR-PUNE-NAGPUR'). Auto-generation
 * is deferred (no deterministic encoding spec exists yet); reviewer
 * supplies the id during the Admin-only window.
 */

import type {
  AuditEntry,
  CcRule,
  CcRuleContext,
  CcRuleScope,
  SalesPerson,
  User,
} from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const VALID_SHEETS: ReadonlyArray<CcRule['sheet']> = [
  'South-West',
  'East',
  'North',
  'derived',
]

const VALID_SCOPES: ReadonlyArray<CcRuleScope> = [
  'region',
  'sub-region',
  'school',
  'training-mode',
  'sr-no-range',
]

const VALID_CONTEXTS: ReadonlyArray<CcRuleContext> = [
  'welcome-note',
  'three-ping-cadence',
  'dispatch-notification',
  'feedback-request',
  'closing-letter',
  'escalation-notification',
  'all-communications',
]

const ID_PATTERN = /^CCR-[A-Z0-9-]+$/

export interface CreateCcRuleArgs {
  id: string
  sheet: CcRule['sheet']
  scope: CcRuleScope
  scopeValue: string | string[]
  contexts: CcRuleContext[]
  ccUserIds: string[]
  sourceRuleText: string
  createdBy: string
  notes?: string
}

export type CreateCcRuleFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'duplicate-id'
  | 'invalid-id-format'
  | 'invalid-sheet'
  | 'invalid-scope'
  | 'invalid-contexts'
  | 'invalid-scope-value'
  | 'invalid-cc-user-ids'
  | 'missing-source-rule-text'

export type CreateCcRuleResult =
  | { ok: true; rule: CcRule }
  | { ok: false; reason: CreateCcRuleFailureReason }

export interface CreateCcRuleDeps {
  rules: CcRule[]
  users: User[]
  salesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: CreateCcRuleDeps = {
  rules: ccRulesJson as unknown as CcRule[],
  users: usersJson as unknown as User[],
  salesTeam: salesTeamJson as unknown as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function createCcRule(
  args: CreateCcRuleArgs,
  deps: CreateCcRuleDeps = defaultDeps,
): Promise<CreateCcRuleResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'cc-rule:create')) {
    return { ok: false, reason: 'permission' }
  }

  if (!ID_PATTERN.test(args.id)) {
    return { ok: false, reason: 'invalid-id-format' }
  }
  if (deps.rules.some((r) => r.id === args.id)) {
    return { ok: false, reason: 'duplicate-id' }
  }

  if (!VALID_SHEETS.includes(args.sheet)) {
    return { ok: false, reason: 'invalid-sheet' }
  }
  if (!VALID_SCOPES.includes(args.scope)) {
    return { ok: false, reason: 'invalid-scope' }
  }
  if (
    !Array.isArray(args.contexts) ||
    args.contexts.length === 0 ||
    args.contexts.some((c) => !VALID_CONTEXTS.includes(c))
  ) {
    return { ok: false, reason: 'invalid-contexts' }
  }

  if (Array.isArray(args.scopeValue)) {
    if (
      args.scopeValue.length === 0 ||
      args.scopeValue.some((v) => typeof v !== 'string' || v.trim() === '')
    ) {
      return { ok: false, reason: 'invalid-scope-value' }
    }
  } else {
    if (typeof args.scopeValue !== 'string' || args.scopeValue.trim() === '') {
      return { ok: false, reason: 'invalid-scope-value' }
    }
  }

  if (!Array.isArray(args.ccUserIds) || args.ccUserIds.length === 0) {
    return { ok: false, reason: 'invalid-cc-user-ids' }
  }
  const knownUserIds = new Set([
    ...deps.users.map((u) => u.id),
    ...deps.salesTeam.map((s) => s.id),
  ])
  if (args.ccUserIds.some((id) => !knownUserIds.has(id))) {
    return { ok: false, reason: 'invalid-cc-user-ids' }
  }

  if (typeof args.sourceRuleText !== 'string' || args.sourceRuleText.trim() === '') {
    return { ok: false, reason: 'missing-source-rule-text' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.createdBy,
    action: 'cc-rule-created',
    after: {
      sheet: args.sheet,
      scope: args.scope,
      scopeValue: args.scopeValue,
      contexts: args.contexts,
      ccUserIds: args.ccUserIds,
      enabled: true,
      sourceRuleText: args.sourceRuleText,
    },
    notes: args.notes,
  }

  const rule: CcRule = {
    id: args.id,
    sheet: args.sheet,
    scope: args.scope,
    scopeValue: args.scopeValue,
    contexts: args.contexts,
    ccUserIds: args.ccUserIds,
    enabled: true,
    sourceRuleText: args.sourceRuleText,
    createdAt: ts,
    createdBy: args.createdBy,
    disabledAt: null,
    disabledBy: null,
    disabledReason: null,
    auditLog: [auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'ccRule',
    operation: 'create',
    payload: rule as unknown as Record<string, unknown>,
  })

  return { ok: true, rule }
}
