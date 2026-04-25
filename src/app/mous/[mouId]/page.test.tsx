import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

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

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

function salesRep(id: string): User {
  return {
    id, name: 'R', email: `${id}@example.test`, role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/mous/[mouId] detail page', () => {
  it('renders MOU detail for Admin', { timeout: 15000 }, async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('MOU-STEAM-2627-001')
    expect(html).toContain('Lifecycle')
    expect(html).toContain('Instalments')
    expect(html).toContain('Audit log')
  })

  it('SalesRep sees own-assigned MOU detail', async () => {
    // sp-vikram is the salesPersonId on MOU-STEAM-2627-001
    getCurrentUserMock.mockResolvedValue(salesRep('sp-vikram'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('Greenfield Academy')
  })

  it('SalesRep accessing unassigned MOU triggers notFound (no leak)', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep('sp-other'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('unknown mouId triggers notFound', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'NOPE' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
