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

describe('departmentAccents: dashboardPathForDepartment (Phase 1 role-aware landing)', () => {
  // Phase 1 platform redesign: department sets the default landing (it
  // does NOT hide sections). Finance -> Finance workspace, Ops -> Ops
  // workspace, sales + null (cross-functional Admin / Leadership) -> Home.
  it('routes finance to the Finance workspace', () => {
    expect(
      dashboardPathForDepartment({ department: 'finance', role: 'Admin' }),
    ).toBe('/finance')
  })

  it('routes ops to the Operations workspace', () => {
    expect(dashboardPathForDepartment({ department: 'ops', role: 'Admin' })).toBe(
      '/operations',
    )
  })

  it('routes sales to Home (no dedicated workspace yet)', () => {
    expect(dashboardPathForDepartment({ department: 'sales', role: 'Admin' })).toBe('/')
  })

  it('routes Leadership (department null) to Home', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'Leadership' }),
    ).toBe('/')
  })

  it('routes Admin (department null) to Home', () => {
    expect(dashboardPathForDepartment({ department: null, role: 'Admin' })).toBe('/')
  })

  it('routes other roles with department null to Home', () => {
    expect(
      dashboardPathForDepartment({ department: null, role: 'SalesRep' }),
    ).toBe('/')
  })
})
