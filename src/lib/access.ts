/*
 * Department-aware access gating for the unified GSL Ops Platform.
 *
 * Two-layer access model (Gate 1 Step 2):
 *
 *   Layer 1 (this file): department-level gating. Answers "does this
 *     user belong to a workflow stage that lets them see / edit X?"
 *     Coarse-grained, surface-level checks for navigation visibility,
 *     page guards, and primary-action affordances.
 *
 *   Layer 2 (src/lib/auth/permissions.ts): action-level gating via
 *     canPerform(user, action). Fine-grained, per-mutation checks
 *     for specific write paths (cc-rule:toggle, dispatch-request:
 *     create, etc.). Layer 2 stays as the server-side defence in
 *     depth even when Layer 1 opens up in testing mode.
 *
 * TESTING_OPEN_ACCESS toggle:
 *   When unset or 'true' (the Phase 1 default), VIEW gates open up
 *   for every active user regardless of department. EDIT gates stay
 *   strict because role / department correctness is what the pilot
 *   is actually testing for: an Ops user must not be able to
 *   generate a PI even when discoverability is wide-open. When the
 *   env var is 'false' (production), every gate enforces the
 *   department-scoped rule.
 *
 *   The default lives in code (not env) so a missing env var fails
 *   open for testers, not closed.
 *
 * Department backfill on existing users follows docs/role-decisions.md
 * "2026-05-10: Gate 1 department backfill". Sales reps + heads to
 * 'sales'; Ops heads + employees + TrainerHead to 'ops'; Finance to
 * 'finance'; Admin + Leadership to null (the wildcard branches in
 * each gate read null as "sees all stages").
 */

import type { Department, User, UserRole } from './types'

// ----------------------------------------------------------------------------
// Testing-mode toggle
// ----------------------------------------------------------------------------

/**
 * Returns true when the env opens VIEW gates for every active user.
 * Default true: a missing env var fails open for testers, not closed.
 * Production lockdown is `TESTING_OPEN_ACCESS=false`.
 */
export function isTestingOpenAccess(): boolean {
  const raw = process.env.TESTING_OPEN_ACCESS
  if (raw === undefined || raw === '') return true
  return raw.toLowerCase() !== 'false'
}

// ----------------------------------------------------------------------------
// Role → default department resolver (used at user-seed time only)
// ----------------------------------------------------------------------------

/**
 * The default Department to set when a User is first created with a
 * given UserRole. This is the seed default only; after creation, the
 * department field is independent of role and may be edited per the
 * pilot's real-world function (e.g., Misba is Admin role with
 * department='ops' because she exercises Ops in the pilot).
 *
 * TrainerHead provisionally maps to 'ops' per docs/MERGE_PLAN.md §7.3
 * (academics is part of operational execution under Pradeep + Shashank
 * in the pilot). Re-visit at Gate 4 when training rollout becomes a
 * first-class module.
 */
export function defaultDepartmentForRole(role: UserRole): Department {
  switch (role) {
    case 'SalesHead':
    case 'SalesRep':
      return 'sales'
    case 'OpsHead':
    case 'OpsEmployee':
    case 'TrainerHead':
      return 'ops'
    case 'Finance':
      return 'finance'
    case 'Admin':
    case 'Leadership':
      return null
  }
}

/**
 * Resolves the user's effective department. Reads `user.department`
 * directly so post-seed overrides take effect (e.g., Misba Admin role
 * with 'ops' department). When the field is undefined (pre-Gate-1
 * test fixtures, or any User created before the field was added),
 * falls back to defaultDepartmentForRole(user.role) so the gate
 * helpers behave consistently. Inactive users still resolve so the
 * audit surfaces show their last-known department.
 */
export function getDepartment(user: User): Department {
  if (user.department !== undefined) return user.department
  return defaultDepartmentForRole(user.role)
}

// ----------------------------------------------------------------------------
// VIEW gates: relaxed in testing mode, strict in production
// ----------------------------------------------------------------------------

function activeOrFalse(user: User): boolean {
  return user.active === true
}

function isAdminOrLeadership(user: User): boolean {
  return user.role === 'Admin' || user.role === 'Leadership'
}

function viewGate(user: User, allowedDept: Exclude<Department, null>): boolean {
  if (!activeOrFalse(user)) return false
  if (isTestingOpenAccess()) return true
  if (isAdminOrLeadership(user)) return true
  return getDepartment(user) === allowedDept
}

export function canAccessSales(user: User): boolean {
  return viewGate(user, 'sales')
}

export function canAccessOps(user: User): boolean {
  return viewGate(user, 'ops')
}

export function canAccessFinance(user: User): boolean {
  return viewGate(user, 'finance')
}

/**
 * Leadership reports surface aggregate metrics across all stages.
 * Visible to Leadership + Admin always; in testing mode every active
 * user can see them. Other roles cannot reach the report routes when
 * production lockdown is in place.
 */
export function canAccessLeadershipReports(user: User): boolean {
  if (!activeOrFalse(user)) return false
  if (isTestingOpenAccess()) return true
  return isAdminOrLeadership(user)
}

// ----------------------------------------------------------------------------
// EDIT gates: strict regardless of testing mode
// ----------------------------------------------------------------------------

function editGate(
  user: User,
  allowedDepartments: Array<Exclude<Department, null>>,
): boolean {
  if (!activeOrFalse(user)) return false
  const dept = getDepartment(user)
  // Admin with null department is the cross-functional wildcard
  // (Anish, Ameet pre-promotion intent). Admin with an explicit
  // department is department-scoped per docs/role-decisions.md
  // 2026-04-27 trusted-core-team pattern: Misba is Admin role with
  // department='ops' so her PI-gen attempts hit the Misba MM2 gate
  // even though she carries the Admin role.
  if (user.role === 'Admin' && dept === null) return true
  return dept !== null && allowedDepartments.includes(dept)
}

/**
 * MOU drafting / signing / lifecycle edits. Sales department + Admin.
 */
export function canEditMOU(user: User): boolean {
  return editGate(user, ['sales'])
}

/**
 * Finance-owned data: GSTIN, PAN, billing block, payment matching,
 * adjustment management. Finance + Admin.
 */
export function canEditFinanceData(user: User): boolean {
  return editGate(user, ['finance'])
}

/**
 * PI generation. Finance + Admin (per Misba MM2: Ops user must not
 * see this route, must not have the action button).
 */
export function canGeneratePI(user: User): boolean {
  return editGate(user, ['finance'])
}

/**
 * Raise a kits-dispatch request. Ops + Admin. The dispatch lifecycle
 * splits into request-raise (Ops, this gate), approve (Sales, see
 * canApproveDispatch), and execute (Finance, see canExecuteDispatch).
 */
export function canRaiseDispatch(user: User): boolean {
  return editGate(user, ['ops'])
}

/**
 * Approve a kits-dispatch request before payment (Misba MM1 early-
 * approval flow: Sales authorises Ops to proceed without an active
 * MOU). Sales + Admin.
 */
export function canApproveDispatch(user: User): boolean {
  return editGate(user, ['sales'])
}

/**
 * Execute the kits-dispatch (Misba doc Step 7 post-payment release
 * authorisation). Finance + Admin.
 */
export function canExecuteDispatch(user: User): boolean {
  return editGate(user, ['finance'])
}

/**
 * Manage warehouse inventory stock + thresholds (Misba doc Step 9
 * suggested inventory module). Finance + Admin per the brief.
 *
 * Note: the existing W4-G `inventory:edit` Action gate in
 * lib/auth/permissions.ts is OpsHead + Admin. The two co-exist:
 * canManageInventory is the new outward-facing department gate
 * (Misba spec); the Action gate is the server-side defence in
 * depth. When the role-design conversation post-pilot revisits
 * separation-of-duties, the two gates can be reconciled.
 */
export function canManageInventory(user: User): boolean {
  return editGate(user, ['finance'])
}

/**
 * Edit School master data (name, contact, billing block). Sales +
 * Admin. Per Misba kits-dispatch Step 5: if Sales edits any field
 * during the dispatch flow, the system also writes to School Master.
 * The dual-write logic lives in src/lib/schools/editSchool.ts;
 * this gate decides whether the edit form is reachable at all.
 */
export function canEditSchoolMaster(user: User): boolean {
  return editGate(user, ['sales'])
}

/**
 * Manage escalations (create, transition, transfer, claim). Any of
 * Sales / Ops / Finance + Admin. Department-scoped: an Ops user
 * cannot transition a Sales-owned escalation; the data layer enforces
 * that via the escalation's `ownedByDepartment` field. This gate
 * grants the menu visibility.
 */
export function canManageEscalations(user: User): boolean {
  return editGate(user, ['sales', 'ops', 'finance'])
}

/**
 * View all audit-log entries across every department. Leadership +
 * Admin. Existing audit-route lane scoping in
 * lib/auth/permissions.ts canViewAuditEntry remains the per-entry
 * authority; this gate is for the dashboard surface that aggregates
 * across lanes.
 */
export function canViewAllAuditLogs(user: User): boolean {
  if (!activeOrFalse(user)) return false
  return isAdminOrLeadership(user)
}

/**
 * User-management surface: provision new users, edit roles +
 * departments, deactivate. Admin only.
 */
export function canManageUsers(user: User): boolean {
  if (!activeOrFalse(user)) return false
  return user.role === 'Admin'
}
