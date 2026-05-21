/*
 * applySsoSignin (Phase 6G Part 2).
 *
 * Pure lookup-or-create lib for SSO sign-in. Called from the
 * NextAuth signIn callback after the domain allowlist check. Three
 * outcomes:
 *   1. Existing user matched by email -> set azureAdObjectId if
 *      missing, append 'sso-signin' audit entry, return the user.
 *   2. No existing user -> create a new User with role=OpsEmployee,
 *      active=false, requiresAdminReview=true, azureAdObjectId=oid.
 *      Append the audit entry on the new record.
 *   3. Inactive user matched by email -> still set the oid and
 *      append the audit entry; the session token will be issued but
 *      page-level guards block them until Anish flips active=true.
 *
 * Writes go through enqueueUpdate so the change drains via the
 * GitHub Contents API queue + the 5-min cron. The lib NEVER writes
 * to disk directly (Vercel runtime is read-only).
 */

import usersJson from '@/data/users.json'
import type { AuditEntry, User, UserRole } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const allUsers = usersJson as unknown as User[]

export interface ApplySsoSigninInput {
  email: string
  azureAdObjectId: string | null
  userPrincipalName: string
  displayName: string
}

export interface ApplySsoSigninResult {
  userId: string
  role: UserRole
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
    userId: newId,
    role: 'OpsEmployee',
    created: true,
    active: false,
  }
}
