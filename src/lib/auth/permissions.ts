/*
 * Role-based permission matrix for GSL Ops Automation.
 *
 * Per step 10 Item 8 self-maintainability matrix and Week 1 fixture spec.
 * 8 base UserRole values; Misba's testingOverride pattern grants elevated
 * permissions while keeping audit-log attribution accurate (her base role
 * stays OpsEmployee; testingOverridePermissions: ['OpsHead'] adds OpsHead
 * grants on top).
 *
 * Audit-route visibility is enforced server-side. URL query-string filters
 * may narrow the user's allowed set but never widen it.
 *
 * L3 escalation routing (post-Update-2 + Week 1 option (a)): Ameet
 * (Leadership) is the L3 fallback for OPS, SALES, and ACADEMICS lanes.
 */

import type {
  AuditAction,
  AuditEntry,
  EscalationLane,
  EscalationLevel,
  User,
  UserRole,
} from '../types'

// ----------------------------------------------------------------------------
// Action enum: every gated write operation in the system
// ----------------------------------------------------------------------------

export type Action =
  // CcRule administration (step 6.5 Item H + step 7 Fix 5)
  | 'cc-rule:toggle'
  | 'cc-rule:create'
  | 'cc-rule:edit'
  // P2 dispatch override (Q-J)
  | 'dispatch:override-gate'
  | 'dispatch:acknowledge-override'
  // Drift approval (Sales Head queue per step 6.5 Item B)
  | 'drift:approve'
  // MOU lifecycle stage actions (Phase C4)
  | 'mou:confirm-actuals'
  | 'mou:generate-pi'
  | 'mou:raise-dispatch'
  | 'mou:send-feedback-request'
  | 'mou:upload-delivery-ack'
  // Finance flow (Q-B + step 8 acceptance criteria)
  | 'payment:reconcile'
  // MOU import review (Q-A)
  | 'mou-import-review:resolve'
  // Self-serve admin per step 10 Item 8
  | 'school:create'
  | 'school:edit'
  | 'spoc:create'
  | 'sales-rep:create'
  | 'school-group:create'
  | 'school-group:edit-members'
  // Escalation lifecycle
  | 'escalation:resolve'
  // System operations (Phase E manual-trigger pattern)
  // Admin + OpsHead can manually trigger MOU import + health check
  // from /admin. Phase 1.1 may add cron-based auto-trigger requiring
  // a separate 'system:cron-trigger' action with shared-secret auth.
  | 'system:trigger-sync'

// Sentinel: Admin role grants all actions. Represented as wildcard in the
// role map so we never have to enumerate the full action list for Admin.
const ADMIN_WILDCARD = Symbol('admin:all')

// ----------------------------------------------------------------------------
// Per-role base permissions
// ----------------------------------------------------------------------------

const ROLE_BASE_ACTIONS: Record<UserRole, Set<Action> | typeof ADMIN_WILDCARD> = {
  Admin: ADMIN_WILDCARD,
  Leadership: new Set<Action>([
    'dispatch:override-gate',
    'escalation:resolve',
  ]),
  SalesHead: new Set<Action>([
    'drift:approve',
    'mou:confirm-actuals',
    'escalation:resolve',
  ]),
  SalesRep: new Set<Action>([
    // Phase 1: scoped MOU view only; the only mutation a SalesRep can
    // perform is confirming actuals on their own assignments. Per
    // Item B "SalesRep gathers actuals; Sales Head signs off"; both
    // submit, SalesHead reviews queue when variance > 10%.
    'mou:confirm-actuals',
  ]),
  OpsHead: new Set<Action>([
    'cc-rule:toggle',
    'cc-rule:edit',
    // 'cc-rule:create' is Admin-only for the first 30 days post-launch
    // per step 10 Item 8 (Misba flips to OpsHead-allowed on day 31). Add
    // 'cc-rule:create' to this set when the flip lands.
    'mou-import-review:resolve',
    'mou:raise-dispatch',
    'mou:send-feedback-request',
    'mou:upload-delivery-ack',
    'school:create',
    'school:edit',
    'spoc:create',
    'sales-rep:create',
    'school-group:create',
    'school-group:edit-members',
    'escalation:resolve',
    'system:trigger-sync',
  ]),
  OpsEmployee: new Set<Action>([
    // Phase 1 base: no write actions on the matrix. Misba is OpsEmployee
    // by base role with testingOverride: ['OpsHead']; her elevated grants
    // come through effectiveRoles() below.
  ]),
  Finance: new Set<Action>([
    'mou:generate-pi',
    'payment:reconcile',
    'dispatch:acknowledge-override',
  ]),
  TrainerHead: new Set<Action>([
    // Academics-lane visibility (per canViewAuditEntry) plus escalation
    // resolution on training-quality and trainer-rapport feedback.
    'escalation:resolve',
  ]),
}

// ----------------------------------------------------------------------------
// Effective roles (base + testingOverride grants)
// ----------------------------------------------------------------------------

export function effectiveRoles(user: User): UserRole[] {
  const roles: UserRole[] = [user.role]
  if (user.testingOverride && user.testingOverridePermissions) {
    for (const overrideRole of user.testingOverridePermissions) {
      if (!roles.includes(overrideRole)) {
        roles.push(overrideRole)
      }
    }
  }
  return roles
}

// ----------------------------------------------------------------------------
// canPerform(user, action): the central permission gate
// ----------------------------------------------------------------------------

export function canPerform(user: User, action: Action): boolean {
  if (!user.active) return false
  for (const role of effectiveRoles(user)) {
    const grants = ROLE_BASE_ACTIONS[role]
    if (grants === ADMIN_WILDCARD) return true
    if (grants.has(action)) return true
  }
  return false
}

// ----------------------------------------------------------------------------
// Audit-entry visibility (per step 10 Item 5 permissions matrix)
// ----------------------------------------------------------------------------

/**
 * Server-side audit-entry visibility check. Called for every entry in the
 * audit-route result set; entries returning false are stripped before the
 * client receives the response. URL query-string filters may narrow what
 * remains but never widen it (the URL filter applies AFTER this check).
 *
 * The `context` parameter carries supplementary scope info (the lane of
 * the entry's source entity, the salesPersonId of the source MOU, the
 * SPOC's school ownership). For Phase 1, only `laneOfEntry` is used; the
 * salesPersonId and SPOC ownership checks are tracked as a Phase 1.1
 * refinement when SalesRep / OpsEmployee scoped MOU views land.
 */
export function canViewAuditEntry(
  user: User,
  entry: AuditEntry,
  context: { laneOfEntry?: EscalationLane } = {},
): boolean {
  if (!user.active) return false
  const roles = effectiveRoles(user)

  // Admin and Leadership see everything.
  if (roles.includes('Admin') || roles.includes('Leadership')) return true

  const action = entry.action

  // OpsHead: OPS-lane events plus shared infrastructure events.
  if (roles.includes('OpsHead')) {
    if (context.laneOfEntry === 'OPS') return true
    if (action === 'whatsapp-draft-copied') return true
    if (
      action === 'cc-rule-toggle-on' ||
      action === 'cc-rule-toggle-off' ||
      action === 'cc-rule-created'
    ) return true
    if (action === 'dispatch-raised' || action === 'delivery-acknowledged') return true
    if (action === 'p2-override' || action === 'p2-override-acknowledged') return true
    if (action === 'auto-link-exact-match' || action === 'manual-relink') return true
    if (action === 'gslt-cretile-normalisation') return true
    return false
  }

  // SalesHead: SALES-lane events plus drift approvals and reassignments.
  if (roles.includes('SalesHead')) {
    if (context.laneOfEntry === 'SALES') return true
    if (action === 'reassignment') return true
    if (action === 'actuals-confirmed') return true
    return false
  }

  // TrainerHead: ACADEMICS-lane events (feedback escalations).
  if (roles.includes('TrainerHead')) {
    if (context.laneOfEntry === 'ACADEMICS') return true
    if (action === 'auto-create-from-feedback') return true
    if (action === 'feedback-submitted') return true
    return false
  }

  // Finance: their own write actions plus shared lifecycle markers.
  if (roles.includes('Finance')) {
    if (action === 'pi-issued' || action === 'p2-override-acknowledged') return true
    return false
  }

  // SalesRep / OpsEmployee: Phase 1 ships with no audit-route visibility
  // for these roles. Phase 1.1 may add per-MOU ownership scoping (the
  // caller would pass salesPersonIdOfMou or spocUserIdOfSchool in the
  // context arg and this branch would gate on user.id matching). For now
  // they cannot see the audit route at all.
  return false
}

// ----------------------------------------------------------------------------
// L3 escalation routing (option (a) post-Update-2: Ameet as L3 fallback)
// ----------------------------------------------------------------------------

/**
 * Returns the User.id for the default assignee at a given (lane, level).
 * L1 is dynamic and depends on case context (assigned ops user, SalesRep
 * for the MOU, etc.); the caller computes it. L2 is the lane head per
 * Misba intel A. L3 is Ameet for all three lanes per Week 1 option (a).
 */
export function escalationLevelDefault(
  lane: EscalationLane,
  level: EscalationLevel,
): string | null {
  if (level === 'L1') return null
  if (level === 'L2') {
    if (lane === 'OPS') return 'misba.m'
    if (lane === 'SALES') return 'pratik.d'
    if (lane === 'ACADEMICS') return 'shashank.s'
  }
  if (level === 'L3') return 'ameet.z'
  return null
}
