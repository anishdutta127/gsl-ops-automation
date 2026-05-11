import { describe, it, expect } from 'vitest'
import type { User } from '@/lib/types'
import { canAccessReport, visibleReports, isReportSlug } from './access'

function user(over: Partial<User> = {}): User {
  return {
    id: 'u',
    name: 'U',
    email: 'u@example.test',
    role: 'SalesRep',
    department: 'sales',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
    ...over,
  }
}

describe('reports/access canAccessReport', () => {
  it('blocks null user', () => {
    expect(canAccessReport(null, 'fy-summary')).toBe(false)
  })

  it('blocks inactive users', () => {
    expect(canAccessReport(user({ active: false }), 'fy-summary')).toBe(false)
  })

  it('Admin sees every report', () => {
    const u = user({ role: 'Admin', department: null })
    for (const slug of [
      'fy-summary',
      'sales-performance',
      'dispatch-performance',
      'payment-aging',
      'escalations',
    ] as const) {
      expect(canAccessReport(u, slug)).toBe(true)
    }
  })

  it('Leadership sees every report', () => {
    const u = user({ role: 'Leadership', department: null })
    expect(canAccessReport(u, 'sales-performance')).toBe(true)
    expect(canAccessReport(u, 'payment-aging')).toBe(true)
  })

  it('Sales sees sales-performance + cross-functional reports only', () => {
    const u = user({ role: 'SalesRep', department: 'sales' })
    expect(canAccessReport(u, 'sales-performance')).toBe(true)
    expect(canAccessReport(u, 'fy-summary')).toBe(true)
    expect(canAccessReport(u, 'escalations')).toBe(true)
    expect(canAccessReport(u, 'payment-aging')).toBe(false)
    expect(canAccessReport(u, 'dispatch-performance')).toBe(false)
  })

  it('Ops sees dispatch-performance + cross-functional reports only', () => {
    const u = user({ role: 'OpsHead', department: 'ops' })
    expect(canAccessReport(u, 'dispatch-performance')).toBe(true)
    expect(canAccessReport(u, 'fy-summary')).toBe(true)
    expect(canAccessReport(u, 'escalations')).toBe(true)
    expect(canAccessReport(u, 'sales-performance')).toBe(false)
    expect(canAccessReport(u, 'payment-aging')).toBe(false)
  })

  it('Finance sees payment-aging + cross-functional reports only', () => {
    const u = user({ role: 'Finance', department: 'finance' })
    expect(canAccessReport(u, 'payment-aging')).toBe(true)
    expect(canAccessReport(u, 'fy-summary')).toBe(true)
    expect(canAccessReport(u, 'escalations')).toBe(true)
    expect(canAccessReport(u, 'sales-performance')).toBe(false)
    expect(canAccessReport(u, 'dispatch-performance')).toBe(false)
  })

  it('Admin with explicit ops department still wildcards', () => {
    // Admin role is the wildcard regardless of department field; the
    // department field gates EDIT actions, not report VIEW.
    const u = user({ role: 'Admin', department: 'ops' })
    expect(canAccessReport(u, 'payment-aging')).toBe(true)
    expect(canAccessReport(u, 'sales-performance')).toBe(true)
  })

  it('visibleReports returns 5 for Admin', () => {
    const u = user({ role: 'Admin', department: null })
    expect(visibleReports(u)).toHaveLength(5)
  })

  it('visibleReports returns 3 for a Sales department user', () => {
    const u = user({ role: 'SalesRep', department: 'sales' })
    const vis = visibleReports(u)
    expect(vis.sort()).toEqual(['escalations', 'fy-summary', 'sales-performance'])
  })

  it('isReportSlug guard rejects unknown slugs', () => {
    expect(isReportSlug('fy-summary')).toBe(true)
    expect(isReportSlug('nope')).toBe(false)
  })
})
