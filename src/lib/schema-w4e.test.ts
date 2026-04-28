/*
 * W4-E.1 schema sanity. Verifies the SchoolSPOC + Notification entity
 * shapes compile, the seed JSON files are well-formed empty arrays,
 * the new permission Actions are wired into the matrix, and the new
 * PendingUpdateEntity values are queue-reachable.
 *
 * Heavier behavioural tests land in:
 *   src/lib/spocs/<lib>.test.ts        (W4-E.2 import + W4-E.3 audit)
 *   src/lib/communications/composeReminder.test.ts (W4-E.4)
 *   src/lib/notifications/<lib>.test.ts (W4-E.5)
 */

import { describe, expect, it } from 'vitest'
import type {
  Notification,
  NotificationKind,
  PendingUpdateEntity,
  SchoolSPOC,
  SchoolSpocRole,
} from '@/lib/types'
import schoolSpocsJson from '@/data/school_spocs.json'
import notificationsJson from '@/data/notifications.json'
import { canPerform } from '@/lib/auth/permissions'

const VALID_ROLES: ReadonlySet<SchoolSpocRole> = new Set<SchoolSpocRole>([
  'primary',
  'secondary',
])

const VALID_NOTIFICATION_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  'dispatch-request-created',
  'dispatch-request-approved',
  'dispatch-request-rejected',
  'intake-completed',
  'payment-recorded',
  'escalation-assigned',
])

describe('W4-E.1 SchoolSPOC schema', () => {
  it('school_spocs.json seeds as an empty array; W4-E.2 backfill populates it', () => {
    const rows = schoolSpocsJson as unknown as SchoolSPOC[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBe(0)
  })

  it('SchoolSPOC.role is the primary | secondary discriminator', () => {
    const sample: SchoolSPOC = {
      id: 'SSP-EXAMPLE',
      schoolId: 'SCH-EXAMPLE',
      name: 'Jane Doe',
      designation: 'Principal',
      email: 'jane@example.in',
      phone: '+91 98765 43210',
      role: 'primary',
      active: true,
      sourceSheet: 'East',
      sourceRow: 7,
      createdAt: '2026-04-28T00:00:00Z',
      createdBy: 'system-w4e-import',
      auditLog: [],
    }
    expect(VALID_ROLES.has(sample.role)).toBe(true)
    expect(sample.email).not.toBeNull()
  })
})

describe('W4-E.1 Notification schema', () => {
  it('notifications.json seeds as an empty array; W4-E.5 trigger wiring populates it', () => {
    const rows = notificationsJson as unknown as Notification[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBe(0)
  })

  it('NotificationKind covers the 6 Phase 1 trigger sources', () => {
    expect(VALID_NOTIFICATION_KINDS.size).toBe(6)
    for (const kind of [
      'dispatch-request-created',
      'dispatch-request-approved',
      'dispatch-request-rejected',
      'intake-completed',
      'payment-recorded',
      'escalation-assigned',
    ] as const) {
      expect(VALID_NOTIFICATION_KINDS.has(kind)).toBe(true)
    }
  })
})

describe('W4-E.1 permission Actions wired into the matrix', () => {
  function user(
    id: string,
    role: 'Admin' | 'OpsHead' | 'SalesRep' | 'OpsEmployee',
  ): import('@/lib/types').User {
    return {
      id,
      name: id,
      email: `${id}@getsetlearn.info`,
      role,
      testingOverride: false,
      active: true,
      passwordHash: 'bcrypt:placeholder',
      createdAt: '2026-04-28T00:00:00Z',
      auditLog: [],
    }
  }

  it('Admin wildcard grants the new W4-E actions; baseline grants for non-Admin', () => {
    const admin = user('anish.d', 'Admin')
    expect(canPerform(admin, 'spoc:import')).toBe(true)
    expect(canPerform(admin, 'reminder:create')).toBe(true)
    expect(canPerform(admin, 'reminder:view-all')).toBe(true)
    expect(canPerform(admin, 'notification:read')).toBe(true)
    expect(canPerform(admin, 'notification:mark-read')).toBe(true)

    // OpsEmployee baseline: notification feed yes; spoc:import no.
    const opsEmployee = user('test.ops', 'OpsEmployee')
    expect(canPerform(opsEmployee, 'notification:read')).toBe(true)
    expect(canPerform(opsEmployee, 'notification:mark-read')).toBe(true)
    expect(canPerform(opsEmployee, 'spoc:import')).toBe(false)
    expect(canPerform(opsEmployee, 'reminder:create')).toBe(false)
    expect(canPerform(opsEmployee, 'reminder:view-all')).toBe(false)

    // SalesRep can compose reminders but not view-all.
    const rep = user('vishwanath.g', 'SalesRep')
    expect(canPerform(rep, 'reminder:create')).toBe(true)
    expect(canPerform(rep, 'reminder:view-all')).toBe(false)
  })
})

describe('W4-E.1 PendingUpdateEntity reaches the new entities', () => {
  it('schoolSpoc + notification are valid queue entity values', () => {
    const valid: PendingUpdateEntity[] = ['schoolSpoc', 'notification']
    for (const v of valid) {
      // Re-assigning into the union proves TypeScript accepts the literal at compile time;
      // the runtime check sanity-tests the string surface.
      const entity: PendingUpdateEntity = v
      expect(typeof entity).toBe('string')
      expect(entity.length).toBeGreaterThan(0)
    }
  })
})
