import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function makeUser(role: User['role']): User {
  return {
    id: 'x', name: 'X', email: 'x@example.test', role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('/schools/[schoolId] detail page', () => {
  it('renders school detail with Edit action for Admin', { timeout: 15000 }, async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('Mutahhary Public School Baroo')
    expect(html).toContain('Kargil')
    expect(html).toContain('href="/schools/SCH-MUTAHHARY_PUBLIC_SCH/edit"')
  })

  it('hides Edit action for SalesRep (read-only)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).not.toContain('href="/schools/SCH-MUTAHHARY_PUBLIC_SCH/edit"')
    expect(html).toContain('Mutahhary Public School Baroo')
  })

  it('shows GSTIN missing alert when school.gstNumber is null', async () => {
    // All 124 upstream-imported schools have gstNumber=null per the
    // Week 3 backfill (W3-A.1 anomaly: GSTIN backfill is a pilot-time
    // operational task), so any imported school surfaces the alert.
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('PI generation blocked')
  })

  it('unknown schoolId triggers notFound', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ schoolId: 'NOPE' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
