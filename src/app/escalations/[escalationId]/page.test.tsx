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

// Pick a known fixture id (ESC-001 from escalations.json)
const ESC_ID = 'ESC-001'

describe('/escalations/[escalationId] detail page', () => {
  it('renders detail for Admin (full visibility)', { timeout: 15000 }, async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: ESC_ID }) }),
    )
    expect(html).toContain(ESC_ID)
    expect(html).toContain('Notified emails')
    expect(html).toContain('Audit log')
  })

  it('OpsHead sees an OPS-lane escalation', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('OpsHead'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: ESC_ID }) }),
    )
    expect(html).toContain(ESC_ID)
  })

  it('SalesRep accessing OPS-lane escalation triggers notFound (no leak)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('SalesRep'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ escalationId: ESC_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('unknown escalationId triggers notFound', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ escalationId: 'NOPE' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: ESC_ID }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
