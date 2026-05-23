/*
 * User repo (Phase 7).
 *
 * Read/write surface for the `users` entity that mirrors the existing
 * JSON-access shape so call-site migration is a one-import swap.
 *
 * Backends:
 *   - DATA_BACKEND=json (default): reads from src/data/users.json
 *     directly; writes enqueueUpdate (current production path).
 *   - DATA_BACKEND=postgres: reads from public.users; writes synchronous
 *     INSERT/UPDATE.
 *
 * Parity tests at src/lib/db/repos/__tests__/user.parity.test.ts assert
 * that both backends agree on read-shape for the seeded staging data.
 */

import type { User, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import usersJson from '@/data/users.json'

const jsonUsers = usersJson as unknown as User[]

interface UserRow {
  id: string
  name: string
  email: string | null
  role: User['role']
  department?: string | null
  active: boolean
  password_hash: string | null
  testing_override: boolean
  testing_override_permissions: unknown
  azure_ad_object_id: string | null
  requires_admin_review: boolean
  audit_log: AuditEntry[]
  created_at: string
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    role: r.role,
    department: (r.department ?? null) as User['department'],
    testingOverride: !!r.testing_override,
    testingOverridePermissions: Array.isArray(r.testing_override_permissions)
      ? (r.testing_override_permissions as string[])
      : undefined,
    active: !!r.active,
    passwordHash: r.password_hash ?? '',
    azureAdObjectId: r.azure_ad_object_id ?? undefined,
    requiresAdminReview: !!r.requires_admin_review,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as User
}

export const userRepo = {
  async findAll(): Promise<User[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<UserRow[]>`SELECT * FROM users ORDER BY id`
      return rows.map(rowToUser)
    }
    return jsonUsers
  },

  async findById(id: string): Promise<User | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${id}`
      return rows[0] ? rowToUser(rows[0]) : null
    }
    return jsonUsers.find((u) => u.id === id) ?? null
  },

  async findByEmail(email: string): Promise<User | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<UserRow[]>`SELECT * FROM users WHERE email = ${email}`
      return rows[0] ? rowToUser(rows[0]) : null
    }
    return jsonUsers.find((u) => u.email === email) ?? null
  },

  async findByAzureAdObjectId(oid: string): Promise<User | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<UserRow[]>`
        SELECT * FROM users WHERE azure_ad_object_id = ${oid}
      `
      return rows[0] ? rowToUser(rows[0]) : null
    }
    return jsonUsers.find((u) => u.azureAdObjectId === oid) ?? null
  },

  async update(user: User, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE users SET
          name = ${user.name},
          email = ${user.email && user.email !== '' ? user.email : null},
          role = ${user.role},
          department = ${user.department ?? null},
          active = ${!!user.active},
          password_hash = ${user.passwordHash || null},
          testing_override = ${!!user.testingOverride},
          testing_override_permissions = ${sql.json((user.testingOverridePermissions ?? []) as never)}::jsonb,
          azure_ad_object_id = ${user.azureAdObjectId ?? null},
          requires_admin_review = ${!!user.requiresAdminReview},
          audit_log = ${sql.json((user.auditLog ?? []) as never)}::jsonb
        WHERE id = ${user.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'user',
      operation: 'update',
      payload: user as unknown as Record<string, unknown>,
    })
  },

  async create(user: User): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO users (id, name, email, role, department, active, password_hash,
                           testing_override, testing_override_permissions,
                           azure_ad_object_id, requires_admin_review, audit_log, created_at)
        VALUES (
          ${user.id}, ${user.name},
          ${user.email && user.email !== '' ? user.email : null},
          ${user.role}, ${user.department ?? null},
          ${!!user.active}, ${user.passwordHash || null},
          ${!!user.testingOverride},
          ${sql.json((user.testingOverridePermissions ?? []) as never)}::jsonb,
          ${user.azureAdObjectId ?? null},
          ${!!user.requiresAdminReview},
          ${sql.json((user.auditLog ?? []) as never)}::jsonb,
          ${user.createdAt || sql`NOW()`}
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'user',
      operation: 'create',
      payload: user as unknown as Record<string, unknown>,
    })
  },

  /**
   * Append an audit entry to the user's audit_log. Race-safe on
   * postgres (server-side JSONB concat). Falls back to the
   * read-modify-write queue on json mode (legacy behaviour;
   * the Phase 6H bug class lives here pre-cutover).
   */
  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE users
        SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const u = jsonUsers.find((x) => x.id === id)
    if (!u) return
    const updated: User = { ...u, auditLog: [...(u.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'user',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
