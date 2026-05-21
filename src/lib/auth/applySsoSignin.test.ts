/*
 * Tests for applySsoSignin (Phase 6G Part 2).
 *
 * Pure-lib tests; the route handler + Auth.js callback are tested
 * indirectly via the signIn path in route.test.ts (the deferred
 * playwright walk also covers this). Here we assert:
 *
 *   1. Existing user matched by email -> oid backfilled, audit
 *      entry appended, returns the existing user.
 *   2. Existing inactive user -> still gets the audit entry; result
 *      reports active=false.
 *   3. No existing user -> create with role=OpsEmployee, active=false,
 *      requiresAdminReview=true, azureAdObjectId set, audit entry.
 *   4. Re-sign-in by same Microsoft user is idempotent: oid is not
 *      re-written (no diff), audit entry is still appended (so we
 *      capture the new sign-in event).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySsoSignin } from './applySsoSignin'
import type { ApplySsoSigninDeps } from './applySsoSignin'
import type { PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-21T15:00:00.000Z'

const ORIGINAL_ALLOWLIST = process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS

beforeEach(() => {
  delete process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS
})

afterEach(() => {
  if (ORIGINAL_ALLOWLIST !== undefined) {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = ORIGINAL_ALLOWLIST
  } else {
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS
  }
})

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'anish.d',
    name: 'Anish Dutta',
    email: 'anish.d@getsetlearn.info',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: '$2b$12$X',
    createdAt: '2025-01-01T00:00:00Z',
    auditLog: [],
    azureAdObjectId: null,
    requiresAdminReview: false,
    ...overrides,
  }
}

function makeDeps(users: User[]): {
  deps: ApplySsoSigninDeps
  calls: Array<Record<string, unknown>>
} {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    return {
      id: 'p',
      queuedAt: FIXED_TS,
      queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>,
      retryCount: 0,
    } as PendingUpdate
  })
  return {
    deps: {
      users,
      enqueue: enqueue as unknown as ApplySsoSigninDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('applySsoSignin', () => {
  it('existing user matched by email: oid backfilled, audit entry appended, role + active preserved', async () => {
    const { deps, calls } = makeDeps([user({ id: 'anish.d', email: 'anish.d@getsetlearn.info', azureAdObjectId: null })])
    const r = await applySsoSignin(
      {
        email: 'anish.d@getsetlearn.info',
        azureAdObjectId: 'oid-anish-12345',
        userPrincipalName: 'anish.d@getsetlearn.info',
        displayName: 'Anish Dutta',
      },
      deps,
    )
    expect(r.userId).toBe('anish.d')
    expect(r.role).toBe('Admin')
    expect(r.created).toBe(false)
    expect(r.active).toBe(true)
    expect(calls).toHaveLength(1)
    const payload = calls[0]?.payload as User
    expect(payload.azureAdObjectId).toBe('oid-anish-12345')
    expect(payload.auditLog?.[payload.auditLog.length - 1]?.action).toBe('sso-signin')
  })

  it('inactive existing user: audit entry still appended; result.active reflects the user record', async () => {
    const inactive = user({
      id: 'misba.m',
      email: 'misba.m@getsetlearn.info',
      active: false,
      role: 'Admin',
      azureAdObjectId: null,
    })
    const { deps, calls } = makeDeps([inactive])
    const r = await applySsoSignin(
      {
        email: 'misba.m@getsetlearn.info',
        azureAdObjectId: 'oid-misba',
        userPrincipalName: 'misba.m@getsetlearn.info',
        displayName: 'Misba M',
      },
      deps,
    )
    expect(r.active).toBe(false)
    expect(r.created).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('no existing user: creates OpsEmployee with active=false + requiresAdminReview=true + oid set', async () => {
    const { deps, calls } = makeDeps([])
    const r = await applySsoSignin(
      {
        email: 'newuser@getsetlearn.info',
        azureAdObjectId: 'oid-newuser-99999',
        userPrincipalName: 'newuser@getsetlearn.info',
        displayName: 'New User',
      },
      deps,
    )
    expect(r.created).toBe(true)
    expect(r.active).toBe(false)
    expect(r.role).toBe('OpsEmployee')
    expect(calls).toHaveLength(1)
    const newRec = calls[0]?.payload as User
    expect(newRec.email).toBe('newuser@getsetlearn.info')
    expect(newRec.role).toBe('OpsEmployee')
    expect(newRec.active).toBe(false)
    expect(newRec.requiresAdminReview).toBe(true)
    expect(newRec.azureAdObjectId).toBe('oid-newuser-99999')
    expect(newRec.passwordHash).toBe('') // SSO-only; no legacy login
    expect(newRec.auditLog?.[0]?.action).toBe('sso-signin')
    expect((newRec.auditLog?.[0]?.after as Record<string, unknown>)?.created).toBe(true)
  })

  it('id derivation: drops the @domain.com tail; sanitises non-alphanumeric characters', async () => {
    const { deps, calls } = makeDeps([])
    await applySsoSignin(
      {
        email: 'jane+test@mafatlal.com',
        azureAdObjectId: 'oid-jane',
        userPrincipalName: 'jane+test@mafatlal.com',
        displayName: 'Jane Test',
      },
      deps,
    )
    const created = calls[0]?.payload as User
    // 'jane+test' -> 'jane-test' (the + is sanitised to a hyphen).
    expect(created.id).toBe('jane-test')
  })

  it('re-sign-in by same user: audit entry appended every time; oid not re-written when unchanged', async () => {
    const existing = user({
      id: 'anish.d',
      email: 'anish.d@getsetlearn.info',
      azureAdObjectId: 'oid-anish-12345',
      auditLog: [
        {
          timestamp: '2026-05-20T10:00:00Z',
          user: 'system',
          action: 'sso-signin',
          before: { azureAdObjectId: null },
          after: { azureAdObjectId: 'oid-anish-12345' },
          notes: 'First sign-in',
        },
      ],
    })
    const { deps, calls } = makeDeps([existing])
    await applySsoSignin(
      {
        email: 'anish.d@getsetlearn.info',
        azureAdObjectId: 'oid-anish-12345', // same as existing
        userPrincipalName: 'anish.d@getsetlearn.info',
        displayName: 'Anish Dutta',
      },
      deps,
    )
    expect(calls).toHaveLength(1)
    const payload = calls[0]?.payload as User
    // oid unchanged
    expect(payload.azureAdObjectId).toBe('oid-anish-12345')
    // audit log grew by 1
    expect(payload.auditLog?.length).toBe(2)
    expect(payload.auditLog?.[1]?.action).toBe('sso-signin')
  })

  it('case-insensitive email match: an existing user with capitalised email matches a lowercased SSO email', async () => {
    const { deps } = makeDeps([
      user({ id: 'anish.d', email: 'Anish.D@GetSetLearn.info' }),
    ])
    const r = await applySsoSignin(
      {
        email: 'anish.d@getsetlearn.info',
        azureAdObjectId: 'oid-anish',
        userPrincipalName: 'anish.d@getsetlearn.info',
        displayName: 'Anish',
      },
      deps,
    )
    expect(r.created).toBe(false)
    expect(r.userId).toBe('anish.d')
  })
})

describe('applySsoSignin - 3-branch dispatch (Anish 2026-05-21 follow-up GO)', () => {
  it('branch (a) in-tenant-existing: domain in allowlist, matched user', async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = 'getsetlearn.info'
    const { deps, calls } = makeDeps([user({ id: 'anish.d', email: 'anish.d@getsetlearn.info' })])
    const r = await applySsoSignin(
      {
        email: 'anish.d@getsetlearn.info',
        azureAdObjectId: 'oid-anish',
        userPrincipalName: 'anish.d@getsetlearn.info',
        displayName: 'Anish',
      },
      deps,
    )
    expect(r.outcome).toBe('in-tenant-existing')
    expect(r.userId).toBe('anish.d')
    expect(calls).toHaveLength(1)
  })

  it('branch (a) in-tenant-new: domain in allowlist, no matched user -> auto-create with pending review', async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = 'getsetlearn.info,mafatlal.com'
    const { deps, calls } = makeDeps([])
    const r = await applySsoSignin(
      {
        email: 'newjoiner@mafatlal.com',
        azureAdObjectId: 'oid-newjoiner',
        userPrincipalName: 'newjoiner@mafatlal.com',
        displayName: 'New Joiner',
      },
      deps,
    )
    expect(r.outcome).toBe('in-tenant-new')
    expect(r.created).toBe(true)
    expect(r.active).toBe(false)
    expect(calls).toHaveLength(1)
    const created = calls[0]?.payload as User
    expect(created.requiresAdminReview).toBe(true)
  })

  it('branch (b) external-existing: domain outside allowlist BUT pre-existing record -> proceed, preserve role', async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = 'getsetlearn.info'
    const preApproved: User = {
      ...user({
        id: 'partner.x',
        email: 'partner@externalvendor.com',
        role: 'Finance',
        active: true,
        requiresAdminReview: false,
      }),
    }
    const { deps, calls } = makeDeps([preApproved])
    const r = await applySsoSignin(
      {
        email: 'partner@externalvendor.com',
        azureAdObjectId: 'oid-partner',
        userPrincipalName: 'partner@externalvendor.com',
        displayName: 'External Partner',
      },
      deps,
    )
    expect(r.outcome).toBe('external-existing')
    expect(r.userId).toBe('partner.x')
    expect(r.role).toBe('Finance')
    expect(r.active).toBe(true)
    // Update enqueued to backfill oid; requiresAdminReview NOT set.
    const payload = calls[0]?.payload as User
    expect(payload.azureAdObjectId).toBe('oid-partner')
    expect(payload.requiresAdminReview).toBe(false)
  })

  it('branch (c) external-rejected: domain outside allowlist AND no matched record -> reject, no write', async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = 'getsetlearn.info'
    const { deps, calls } = makeDeps([])
    const r = await applySsoSignin(
      {
        email: 'random@stranger.com',
        azureAdObjectId: 'oid-stranger',
        userPrincipalName: 'random@stranger.com',
        displayName: 'Random Stranger',
      },
      deps,
    )
    expect(r.outcome).toBe('external-rejected')
    expect(r.userId).toBeNull()
    expect(r.role).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('empty allowlist treats EVERY email as in-tenant (defers to Microsoft single-tenant config alone)', async () => {
    // No allowlist env var set in this case.
    const { deps } = makeDeps([])
    const r = await applySsoSignin(
      {
        email: 'random@anywhere.com',
        azureAdObjectId: 'oid-random',
        userPrincipalName: 'random@anywhere.com',
        displayName: 'Random',
      },
      deps,
    )
    expect(r.outcome).toBe('in-tenant-new')
    expect(r.created).toBe(true)
  })
})
