/*
 * CcRule edit (Phase C5a-1).
 *
 * Edits a subset of CcRule fields: sheet, scope, scopeValue, contexts,
 * ccUserIds, sourceRuleText, plus toggle (enabled + disabled metadata).
 * id, createdAt, createdBy are immutable. enabled toggling has its own
 * audit action ('cc-rule-toggle-on' / 'cc-rule-toggle-off') to keep
 * toggle history queryable; full edits use the generic 'update' action.
 *
 * Permission gate: 'cc-rule:edit' (Admin + OpsHead per permissions.ts).
 *
 * Returns the updated rule with a diffed audit entry. Validation
 * mirrors createCcRule for the editable fields.
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
import { ccRuleRepo } from '@/lib/db/repos/leafRepos'
import { currentBackend } from '@/lib/db/backend'
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

export interface EditCcRuleArgs {
  ruleId: string
  editedBy: string
  patch: {
    sheet?: CcRule['sheet']
    scope?: CcRuleScope
    scopeValue?: string | string[]
    contexts?: CcRuleContext[]
    ccUserIds?: string[]
    sourceRuleText?: string
  }
  notes?: string
  /**
   * P2b.X OCC: the version the operator's browser loaded. Required for
   * the OCC write path; if it mismatches the stored version, the route
   * returns 409 with the current conflictVersion so the UI can prompt
   * reload. Omit only for test/legacy paths that opt out (in which case
   * the lib falls back to reading the row's current version - this is
   * NOT race-safe and exists only for backward-compat with json-mode
   * tests).
   */
  expectedVersion?: number
}

export type EditCcRuleFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'rule-not-found'
  | 'invalid-sheet'
  | 'invalid-scope'
  | 'invalid-contexts'
  | 'invalid-scope-value'
  | 'invalid-cc-user-ids'
  | 'missing-source-rule-text'
  | 'no-change'
  | 'version-conflict'

export type EditCcRuleResult =
  | { ok: true; rule: CcRule }
  | { ok: false; reason: EditCcRuleFailureReason; conflictVersion?: number }

export interface EditCcRuleDeps {
  rules: CcRule[]
  users: User[]
  salesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
  /**
   * P2b.X OCC: override-able atomic update + audit for tests. Defaults
   * to ccRuleRepo.updateWithAuditOCC which performs an atomic UPDATE
   * with version check. Tests can pass a stub.
   */
  updateWithAuditOCC?: typeof ccRuleRepo.updateWithAuditOCC
}

const defaultDeps: EditCcRuleDeps = {
  rules: ccRulesJson as unknown as CcRule[],
  users: usersJson as unknown as User[],
  salesTeam: salesTeamJson as unknown as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function editCcRule(
  args: EditCcRuleArgs,
  deps: EditCcRuleDeps = defaultDeps,
): Promise<EditCcRuleResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'cc-rule:edit')) {
    return { ok: false, reason: 'permission' }
  }

  const rule = deps.rules.find((r) => r.id === args.ruleId)
  if (!rule) return { ok: false, reason: 'rule-not-found' }

  const { patch } = args
  const next: CcRule = { ...rule }
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  if (patch.sheet !== undefined) {
    if (!VALID_SHEETS.includes(patch.sheet)) {
      return { ok: false, reason: 'invalid-sheet' }
    }
    if (patch.sheet !== rule.sheet) {
      before.sheet = rule.sheet
      after.sheet = patch.sheet
      next.sheet = patch.sheet
    }
  }

  if (patch.scope !== undefined) {
    if (!VALID_SCOPES.includes(patch.scope)) {
      return { ok: false, reason: 'invalid-scope' }
    }
    if (patch.scope !== rule.scope) {
      before.scope = rule.scope
      after.scope = patch.scope
      next.scope = patch.scope
    }
  }

  if (patch.scopeValue !== undefined) {
    if (Array.isArray(patch.scopeValue)) {
      if (
        patch.scopeValue.length === 0 ||
        patch.scopeValue.some((v) => typeof v !== 'string' || v.trim() === '')
      ) {
        return { ok: false, reason: 'invalid-scope-value' }
      }
    } else {
      if (typeof patch.scopeValue !== 'string' || patch.scopeValue.trim() === '') {
        return { ok: false, reason: 'invalid-scope-value' }
      }
    }
    if (!scopeValueEqual(rule.scopeValue, patch.scopeValue)) {
      before.scopeValue = rule.scopeValue
      after.scopeValue = patch.scopeValue
      next.scopeValue = patch.scopeValue
    }
  }

  if (patch.contexts !== undefined) {
    if (
      !Array.isArray(patch.contexts) ||
      patch.contexts.length === 0 ||
      patch.contexts.some((c) => !VALID_CONTEXTS.includes(c))
    ) {
      return { ok: false, reason: 'invalid-contexts' }
    }
    if (!arraysEqual(rule.contexts, patch.contexts)) {
      before.contexts = rule.contexts
      after.contexts = patch.contexts
      next.contexts = patch.contexts
    }
  }

  if (patch.ccUserIds !== undefined) {
    if (!Array.isArray(patch.ccUserIds) || patch.ccUserIds.length === 0) {
      return { ok: false, reason: 'invalid-cc-user-ids' }
    }
    const knownIds = new Set([
      ...deps.users.map((u) => u.id),
      ...deps.salesTeam.map((s) => s.id),
    ])
    if (patch.ccUserIds.some((id) => !knownIds.has(id))) {
      return { ok: false, reason: 'invalid-cc-user-ids' }
    }
    if (!arraysEqual(rule.ccUserIds, patch.ccUserIds)) {
      before.ccUserIds = rule.ccUserIds
      after.ccUserIds = patch.ccUserIds
      next.ccUserIds = patch.ccUserIds
    }
  }

  if (patch.sourceRuleText !== undefined) {
    if (typeof patch.sourceRuleText !== 'string' || patch.sourceRuleText.trim() === '') {
      return { ok: false, reason: 'missing-source-rule-text' }
    }
    if (patch.sourceRuleText !== rule.sourceRuleText) {
      before.sourceRuleText = rule.sourceRuleText
      after.sourceRuleText = patch.sourceRuleText
      next.sourceRuleText = patch.sourceRuleText
    }
  }

  if (Object.keys(after).length === 0) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'update',
    before,
    after,
    notes: args.notes,
  }
  next.auditLog = [...rule.auditLog, auditEntry]

  // P2b.X OCC: route through the version-checked atomic update so two
  // wildcard admins editing the same rule can't silently clobber each
  // other. The expected version is the one the operator's browser
  // loaded; missing => fall back to the read snapshot's version (NOT
  // race-safe but matches the pre-OCC contract for json-mode tests).
  const expectedVersion = args.expectedVersion ?? rule.version ?? 1
  // Build the scalar patch (omit id / auditLog / version - the OCC
  // method handles audit_log || jsonb + version bump).
  const scalarPatch: Partial<CcRule> = {}
  if (after.sheet !== undefined) scalarPatch.sheet = next.sheet
  if (after.scope !== undefined) scalarPatch.scope = next.scope
  if (after.scopeValue !== undefined) scalarPatch.scopeValue = next.scopeValue
  if (after.contexts !== undefined) scalarPatch.contexts = next.contexts
  if (after.ccUserIds !== undefined) scalarPatch.ccUserIds = next.ccUserIds
  if (after.sourceRuleText !== undefined) scalarPatch.sourceRuleText = next.sourceRuleText
  if (deps.updateWithAuditOCC || currentBackend() === 'postgres') {
    const occ = deps.updateWithAuditOCC
      ?? ccRuleRepo.updateWithAuditOCC.bind(ccRuleRepo)
    const r = await occ(args.ruleId, expectedVersion, scalarPatch, auditEntry, { queuedBy: args.editedBy })
    if (!r.ok) {
      return { ok: false, reason: 'version-conflict', conflictVersion: r.conflictVersion }
    }
    return { ok: true, rule: { ...next, version: r.newVersion } }
  }
  // Json mode fallback: full-row enqueue with version bumped manually.
  // The queue drainer serialises so order is deterministic; production
  // never lands here (DATA_BACKEND=postgres flips currentBackend()).
  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'ccRule',
    operation: 'update',
    payload: { ...next, version: expectedVersion + 1 } as unknown as Record<string, unknown>,
  })
  return { ok: true, rule: { ...next, version: expectedVersion + 1 } }
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function scopeValueEqual(
  a: string | string[],
  b: string | string[],
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b)
  if (!Array.isArray(a) && !Array.isArray(b)) return a === b
  return false
}
