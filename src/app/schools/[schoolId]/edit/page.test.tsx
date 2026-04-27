import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (path: string) => redirectMock(path),
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

describe('/schools/[schoolId]/edit page', () => {
  it('renders form for Admin', { timeout: 15000 }, async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="region"')
    expect(html).toContain('name="gstNumber"')
    expect(html).toContain('Save changes')
    expect(html).toContain('Cancel')
  })

  it('renders form for OpsHead', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('OpsHead'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('<form')
  })

  it('renders form for OpsEmployee+OpsHead testingOverride (Misba)', async () => {
    const misba: User = {
      id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsEmployee',
      testingOverride: true, testingOverridePermissions: ['OpsHead'],
      active: true, passwordHash: 'X', createdAt: '', auditLog: [],
    }
    getCurrentUserMock.mockResolvedValue(misba)
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('<form')
  })

  it('SalesRep also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('<form')
  })

  it('Finance also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Finance'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }) }),
    )
    expect(html).toContain('<form')
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
