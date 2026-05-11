import { describe, expect, it } from 'vitest'
import { accentFor, dashboardPathForDepartment } from './departmentAccents'

describe('departmentAccents: accentFor', () => {
  it('returns brand-teal underline for sales', () => {
    const accent = accentFor('sales')
    expect(accent.navUnderlineClass).toContain('brand-teal')
    expect(accent.label).toBe('Sales')
  })

  it('returns orange underline for ops', () => {
    const accent = accentFor('ops')
    expect(accent.navUnderlineClass).toContain('orange')
    expect(accent.label).toBe('Operations')
  })

  it('returns violet underline for finance', () => {
    const accent = accentFor('finance')
    expect(accent.navUnderlineClass).toContain('violet')
    expect(accent.label).toBe('Finance')
  })

  it('cross-functional uses white underline for navy bar visibility', () => {
    const accent = accentFor('cross-functional')
    expect(accent.navUnderlineClass).toContain('white')
  })

  it('null department normalises to cross-functional accent', () => {
    const accent = accentFor(null)
    expect(accent.label).toBe('Cross-functional')
  })
})

describe('departmentAccents: dashboardPathForDepartment (Gate 3.6 universal landing)', () => {
  // Every role + department now routes to / during testing. The
  // consolidated landing serves Sales / Ops / Finance / Leadership /
  // Admin from the same surface; drill-down tiles route to the
  // dedicated dept dashboards one click away.
  it('routes sales to /', () => {
    expect(dashboardPathForDepartment({ department: 'sales', role: 'Admin' })).toBe('/')
  })

  it('routes ops to /', () => {
    expect(dashboardPathForDepartment({ department: 'ops', role: 'Admin' })).toBe('/')
  })

  it('routes finance to /', () => {
    expect(
      dashboardPathForDepartment({ department: 'finance', role: 'Admin' }),
    ).toBe('/')
  })

  it('routes Leadership (department null) to /', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'Leadership' }),
    ).toBe('/')
  })

  it('routes Admin (department null) to /', () => {
    expect(dashboardPathForDepartment({ department: null, role: 'Admin' })).toBe('/')
  })

  it('routes other roles with department null to /', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'SalesRep' }),
    ).toBe('/')
  })
})
