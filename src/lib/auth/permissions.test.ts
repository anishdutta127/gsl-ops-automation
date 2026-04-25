import { describe, it, expect } from 'vitest'
import type { AuditEntry, User } from '../types'
import {
  canPerform,
  canViewAuditEntry,
  effectiveRoles,
  escalationLevelDefault,
} from './permissions'

function makeUser(overrides: Partial<User> & Pick<User, 'id' | 'role'>): User {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    email: overrides.email ?? `${overrides.id}@getsetlearn.info`,
    role: overrides.role,
    testingOverride: overrides.testingOverride ?? false,
    testingOverridePermissions: overrides.testingOverridePermissions,
    active: overrides.active ?? true,
    passwordHash: overrides.passwordHash ?? 'bcrypt:placeholder',
    createdAt: overrides.createdAt ?? '2026-04-25T00:00:00Z',
    auditLog: overrides.auditLog ?? [],
  }
}

function makeEntry(action: AuditEntry['action']): AuditEntry {
  return {
    timestamp: '2026-04-25T12:00:00Z',
    user: 'someone',
    action,
  }
}

describe('permissions: testingOverride pattern', () => {
  it("(a) Misba's testingOverride grants OpsHead on cc-rule:toggle", () => {
    const misba = makeUser({
      id: 'misba.m',
      role: 'OpsEmployee',
      testingOverride: true,
      testingOverridePermissions: ['OpsHead'],
    })

    expect(canPerform(misba, 'cc-rule:toggle')).toBe(true)
    expect(effectiveRoles(misba)).toEqual(['OpsEmployee', 'OpsHead'])

    // Without the override, plain OpsEmployee cannot toggle.
    const misbaNoOverride = makeUser({
      id: 'misba.m',
      role: 'OpsEmployee',
      testingOverride: false,
    })
    expect(canPerform(misbaNoOverride, 'cc-rule:toggle')).toBe(false)
  })
})

describe('permissions: lane scoping on audit entries', () => {
  it('(b) Pratik (SalesHead) cannot access OPS-only audit entries', () => {
    const pratik = makeUser({ id: 'pratik.d', role: 'SalesHead' })

    // Direct OPS-lane entry
    expect(
      canViewAuditEntry(pratik, makeEntry('whatsapp-draft-copied'), {
        laneOfEntry: 'OPS',
      }),
    ).toBe(false)
    expect(
      canViewAuditEntry(pratik, makeEntry('cc-rule-toggle-off'), {
        laneOfEntry: 'OPS',
      }),
    ).toBe(false)
    expect(
      canViewAuditEntry(pratik, makeEntry('p2-override'), {
        laneOfEntry: 'OPS',
      }),
    ).toBe(false)

    // Sanity: SalesHead CAN see their own SALES-lane entries
    expect(
      canViewAuditEntry(pratik, makeEntry('reassignment'), {
        laneOfEntry: 'SALES',
      }),
    ).toBe(true)
  })
})

describe('permissions: Leadership unconditional audit visibility', () => {
  it('(c) Ameet sees all audit entries unconditionally', () => {
    const ameet = makeUser({ id: 'ameet.z', role: 'Leadership' })

    const samples: AuditEntry[] = [
      makeEntry('whatsapp-draft-copied'),
      makeEntry('cc-rule-toggle-off'),
      makeEntry('p2-override'),
      makeEntry('drift:approve' as AuditEntry['action']) as never, // even unknown shapes
      makeEntry('auto-create-from-feedback'),
      makeEntry('reassignment'),
      makeEntry('feedback-submitted'),
      makeEntry('pi-issued'),
      makeEntry('auto-link-exact-match'),
    ]

    for (const entry of samples) {
      expect(
        canViewAuditEntry(ameet, entry, { laneOfEntry: 'OPS' }),
        `OPS lane on action=${entry.action}`,
      ).toBe(true)
      expect(
        canViewAuditEntry(ameet, entry, { laneOfEntry: 'SALES' }),
        `SALES lane on action=${entry.action}`,
      ).toBe(true)
      expect(
        canViewAuditEntry(ameet, entry, { laneOfEntry: 'ACADEMICS' }),
        `ACADEMICS lane on action=${entry.action}`,
      ).toBe(true)
      expect(canViewAuditEntry(ameet, entry, {}), `no-lane on action=${entry.action}`).toBe(true)
    }
  })
})

describe('permissions: SalesRep cannot widen scope via URL query string', () => {
  it('(d) SalesRep gets zero entries even when URL query requests OPS-only actions', () => {
    const vishwanath = makeUser({ id: 'vishwanath.g', role: 'SalesRep' })

    // Simulate the audit-route flow: load entries, server-side filter via
    // canViewAuditEntry, THEN apply URL filter. URL filter cannot widen.
    const auditCorpus: AuditEntry[] = [
      makeEntry('p2-override'),
      makeEntry('cc-rule-toggle-off'),
      makeEntry('reassignment'),
      makeEntry('whatsapp-draft-copied'),
    ]

    // URL filter requests action=p2-override (OPS-only)
    const urlFilter = (e: AuditEntry) => e.action === 'p2-override'

    // Server-side step: pre-filter by what the user can see
    const visible = auditCorpus.filter((e) =>
      canViewAuditEntry(vishwanath, e, { laneOfEntry: 'OPS' }),
    )

    // Then apply the URL filter
    const result = visible.filter(urlFilter)

    expect(visible).toHaveLength(0)
    expect(result).toHaveLength(0)
  })
})

describe('permissions: L3 escalation routing per option (a)', () => {
  it('Ameet (Leadership) is L3 default for all three lanes', () => {
    expect(escalationLevelDefault('OPS', 'L3')).toBe('ameet.z')
    expect(escalationLevelDefault('SALES', 'L3')).toBe('ameet.z')
    expect(escalationLevelDefault('ACADEMICS', 'L3')).toBe('ameet.z')
  })

  it('L2 routes to lane heads per Misba intel A + new TrainerHead lane', () => {
    expect(escalationLevelDefault('OPS', 'L2')).toBe('misba.m')
    expect(escalationLevelDefault('SALES', 'L2')).toBe('pratik.d')
    expect(escalationLevelDefault('ACADEMICS', 'L2')).toBe('shashank.s')
  })

  it('L1 is dynamic and returns null', () => {
    expect(escalationLevelDefault('OPS', 'L1')).toBe(null)
    expect(escalationLevelDefault('SALES', 'L1')).toBe(null)
    expect(escalationLevelDefault('ACADEMICS', 'L1')).toBe(null)
  })
})

describe('permissions: Admin wildcard', () => {
  it('Admin can perform every action without enumeration', () => {
    const anish = makeUser({ id: 'anish.d', role: 'Admin' })

    expect(canPerform(anish, 'cc-rule:toggle')).toBe(true)
    expect(canPerform(anish, 'cc-rule:create')).toBe(true)
    expect(canPerform(anish, 'dispatch:override-gate')).toBe(true)
    expect(canPerform(anish, 'pi:generate')).toBe(true)
    expect(canPerform(anish, 'school-group:create')).toBe(true)
    expect(canPerform(anish, 'escalation:resolve')).toBe(true)
  })

  it('inactive Admin loses all permissions', () => {
    const anish = makeUser({ id: 'anish.d', role: 'Admin', active: false })
    expect(canPerform(anish, 'cc-rule:toggle')).toBe(false)
    expect(canViewAuditEntry(anish, makeEntry('whatsapp-draft-copied'))).toBe(false)
  })
})
