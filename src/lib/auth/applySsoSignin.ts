/*
 * applySsoSignin (Phase 6G Part 2).
 *
 * Pure lookup-or-create lib for SSO sign-in. Called from the
 * NextAuth signIn callback. Per Anish 2026-05-21 follow-up GO,
 * authentication branches on the email's domain against the
 * configurable allowlist:
 *
 *   (a) In-tenant email (domain matches allowlist, or allowlist is
 *       empty): proceed normally. Existing user -> link oid. No
 *       existing user -> create with active=false +
 *       requiresAdminReview=true so Anish promotes them.
 *   (b) Outside-tenant email + existing pre-created user: proceed,
 *       link oid, preserve the user's existing role + permissions.
 *       requiresAdminReview is NOT set (admin already created the
 *       record).
 *   (c) Outside-tenant email + no existing user: REJECT. The
 *       caller surfaces a "contact your administrator" message.
 *
 * The result.outcome field tells the caller which branch fired so
 * the NextAuth signIn callback can either return true (a/b) or a
 * redirect URL (c).
 *
 * Writes go through enqueueUpdate so the change drains via the
 * GitHub Contents API queue + the 5-min cron. The lib NEVER writes
 * to disk directly (Vercel runtime is read-only).
 */

import usersJson from '@/data/users.json'
import type { AuditEntry, User, UserRole } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { isEmailDomainAllowed, parseAllowedDomains } from './ssoEnv'

const allUsers = usersJson as unknown as User[]

export interface ApplySsoSigninInput {
  email: string
  azureAdObjectId: string | null
  userPrincipalName: string
  displayName: string
}

export interface ApplySsoSigninResult {
  /**
   * 'in-tenant-existing': branch (a), domain in allowlist, matched user.
   * 'in-tenant-new':      branch (a), domain in allowlist, user auto-created (pending review).
   * 'external-existing':  branch (b), domain outside allowlist, matched pre-created user.
   * 'external-rejected':  branch (c), domain outside allowlist, no pre-created user. Caller must reject.
   */
  outcome:
    | 'in-tenant-existing'
    | 'in-tenant-new'
    | 'external-existing'
    | 'external-rejected'
  userId: string | null
  role: UserRole | null
  created: boolean
  active: boolean
}

export interface ApplySsoSigninDeps {
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ApplySsoSigninDeps = {
  users: allUsers,
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

/**
 * Derive a stable User.id from the email's local-part. The legacy
 * users all carry ids like 'anish.d' (the dot-prefix); we follow the
 * same shape so id readability + audit-trail consistency hold across
 * legacy + SSO users.
 */
function deriveUserId(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.toLowerCase().replace(/[^a-z0-9._-]/g, '-')
}

export async function applySsoSignin(
  input: ApplySsoSigninInput,
  deps: ApplySsoSigninDeps = defaultDeps,
): Promise<ApplySsoSigninResult> {
  const lowered = input.email.toLowerCase()
  const existing = deps.users.find((u) => u.email.toLowerCase() === lowered)
  const ts = deps.now().toISOString()

  // Branch dispatch (Anish 2026-05-21 follow-up GO):
  //   (a) email domain is in the allowlist (or allowlist empty) -> proceed.
  //   (b) email outside allowlist but existing user record -> proceed (external stakeholder).
  //   (c) email outside allowlist and no existing user -> REJECT.
  const allowedDomains = parseAllowedDomains()
  const inTenant = allowedDomains.length === 0 || isEmailDomainAllowed(lowered, allowedDomains)

  if (!inTenant && !existing) {
    // Branch (c). No write, no audit; caller surfaces a friendly rejection.
    return {
      outcome: 'external-rejected',
      userId: null,
      role: null,
      created: false,
      active: false,
    }
  }

  if (existing) {
    // Idempotent oid backfill + audit entry.
    const oidChanged =
      input.azureAdObjectId !== null &&
      existing.azureAdObjectId !== input.azureAdObjectId
    const audit: AuditEntry = {
      timestamp: ts,
      user: 'system',
      action: 'sso-signin',
      before: { azureAdObjectId: existing.azureAdObjectId ?? null },
      after: { azureAdObjectId: input.azureAdObjectId },
      notes: `Phase 6G SSO sign-in for existing user (${input.userPrincipalName}).`,
    }
    if (oidChanged || (existing.auditLog ?? []).length === 0) {
      await deps.enqueue({
        queuedBy: existing.id,
        entity: 'user',
        operation: 'update',
        payload: {
          ...existing,
          azureAdObjectId: input.azureAdObjectId,
          auditLog: [...(existing.auditLog ?? []), audit],
        } as unknown as Record<string, unknown>,
      })
    } else {
      // Still append the audit entry for the sign-in event itself,
      // even if oid is unchanged. The first branch above already
      // handles the unconditional-enqueue case; this else handles
      // the common return-trip when nothing changes shape but the
      // sign-in event must still be recorded.
      await deps.enqueue({
        queuedBy: existing.id,
        entity: 'user',
        operation: 'update',
        payload: {
          ...existing,
          auditLog: [...(existing.auditLog ?? []), audit],
        } as unknown as Record<string, unknown>,
      })
    }
    return {
      outcome: inTenant ? 'in-tenant-existing' : 'external-existing',
      userId: existing.id,
      role: existing.role,
      created: false,
      active: existing.active,
    }
  }

  // Lookup-by-email missed. Create a new pending user.
  const newId = deriveUserId(lowered)
  const audit: AuditEntry = {
    timestamp: ts,
    user: 'system',
    action: 'sso-signin',
    before: {},
    after: {
      created: true,
      azureAdObjectId: input.azureAdObjectId,
      role: 'OpsEmployee',
      active: false,
      requiresAdminReview: true,
    },
    notes: `Phase 6G first SSO sign-in for unknown email (${input.userPrincipalName}). User auto-created in pending state.`,
  }
  const newUser: User = {
    id: newId,
    name: input.displayName || lowered,
    email: lowered,
    role: 'OpsEmployee',
    department: null,
    testingOverride: false,
    active: false,
    passwordHash: '',
    createdAt: ts,
    auditLog: [audit],
    azureAdObjectId: input.azureAdObjectId,
    requiresAdminReview: true,
  }
  await deps.enqueue({
    queuedBy: newId,
    entity: 'user',
    operation: 'create',
    payload: newUser as unknown as Record<string, unknown>,
  })
  return {
    outcome: 'in-tenant-new',
    userId: newId,
    role: 'OpsEmployee',
    created: true,
    active: false,
  }
}
