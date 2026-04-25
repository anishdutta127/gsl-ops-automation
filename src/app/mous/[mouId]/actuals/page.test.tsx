/*
 * /mous/[mouId]/actuals page tests.
 *
 * Coverage:
 *   - Renders form for SalesRep on own MOU
 *   - Hides form for non-permitted role (OpsHead) with inline message
 *   - SalesRep on unassigned MOU triggers notFound
 *   - Drift badge appears at >10% variance, absent at exactly 10%
 *   - Error param renders inline message
 *   - No raw hex
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

// Stub the JSON import so we can inject MOUs with controlled variance
const fixtureMou: MOU = {
  id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
  programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
  status: 'Active', academicYear: '2026-27',
  startDate: '2026-04-01', endDate: '2027-03-31',
  studentsMou: 100, studentsActual: null, studentsVariance: null,
  studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
  contractValue: 500000, received: 0, tds: 0, balance: 500000,
  receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
  salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null,
  notes: null, daysToExpiry: null, auditLog: [],
}

vi.mock('@/data/mous.json', () => ({
  default: [
    fixtureMou,
    { ...fixtureMou, id: 'MOU-EXACT-10', studentsActual: 110, studentsVariance: 10, studentsVariancePct: 0.10 },
    { ...fixtureMou, id: 'MOU-OVER-10', studentsActual: 121, studentsVariance: 21, studentsVariancePct: 0.21 },
    { ...fixtureMou, id: 'MOU-UNDER-NEG', studentsActual: 95, studentsVariance: -5, studentsVariancePct: -0.05 },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function user(role: User['role'], id = 'u', overrides: Partial<User> = {}): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [], ...overrides,
  }
}

describe('/mous/[mouId]/actuals page', () => {
  it('renders form for SalesRep on own MOU', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-vikram'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-X' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('action="/api/mou/actuals/confirm"')
    expect(html).toContain('name="studentsActual"')
    expect(html).toContain('Confirm actuals')
  })

  it('renders form for SalesHead', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesHead', 'pratik.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-X' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('<form')
  })

  it('hides form for non-permitted role (OpsHead) with inline message', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-X' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain('<form')
    expect(html).toContain('requires the SalesRep, SalesHead, or Admin role')
  })

  it('SalesRep accessing unassigned MOU triggers notFound (no leak)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-other'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-X' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('drift badge ABSENT when variance is exactly 10% (boundary strict)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-EXACT-10' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain('data-testid="drift-badge"')
    expect(html).not.toContain('Needs Sales Head review')
  })

  it('drift badge PRESENT when variance > 10%', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-OVER-10' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('data-testid="drift-badge"')
    expect(html).toContain('Needs Sales Head review')
  })

  it('drift badge ABSENT when |variance| < 10% (negative side)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-UNDER-NEG' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain('data-testid="drift-badge"')
  })

  it('error=invalid-students renders inline error message', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-X' }),
        searchParams: Promise.resolve({ error: 'invalid-students' }),
      }),
    )
    expect(html).toContain('Student count must be between')
    expect(html).toContain('role="alert"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-OVER-10' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
