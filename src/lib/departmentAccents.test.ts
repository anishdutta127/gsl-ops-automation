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

describe('departmentAccents: dashboardPathForDepartment', () => {
  it('routes sales to /dashboard/sales', () => {
    expect(dashboardPathForDepartment({ department: 'sales', role: 'Admin' })).toBe(
      '/dashboard/sales',
    )
  })

  it('routes ops to /dashboard/ops', () => {
    expect(dashboardPathForDepartment({ department: 'ops', role: 'Admin' })).toBe(
      '/dashboard/ops',
    )
  })

  it('routes finance to /dashboard/finance', () => {
    expect(
      dashboardPathForDepartment({ department: 'finance', role: 'Admin' }),
    ).toBe('/dashboard/finance')
  })

  it('routes Leadership (department null) to /dashboard/leadership', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'Leadership' }),
    ).toBe('/dashboard/leadership')
  })

  it('routes Admin (department null) to /', () => {
    expect(dashboardPathForDepartment({ department: null, role: 'Admin' })).toBe(
      '/',
    )
  })

  it('routes other roles with department null to /', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'SalesRep' }),
    ).toBe('/')
  })
})
