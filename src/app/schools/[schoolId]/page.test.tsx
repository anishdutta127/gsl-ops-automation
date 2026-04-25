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
      await Page({ params: Promise.resolve({ schoolId: 'SCH-GREENFIELD-PUNE' }) }),
    )
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('Pune')
    expect(html).toContain('href="/schools/SCH-GREENFIELD-PUNE/edit"')
  })

  it('hides Edit action for SalesRep (read-only)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-GREENFIELD-PUNE' }) }),
    )
    expect(html).not.toContain('href="/schools/SCH-GREENFIELD-PUNE/edit"')
    expect(html).toContain('Greenfield Academy')
  })

  it('shows GSTIN missing alert when school.gstNumber is null', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MAPLELEAF-BLR' }) }),
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
      await Page({ params: Promise.resolve({ schoolId: 'SCH-GREENFIELD-PUNE' }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
