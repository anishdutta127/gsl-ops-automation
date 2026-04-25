import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/dashboard/exceptions page', () => {
  it('renders title and breadcrumb', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: ExceptionsPage } = await import('./page')
    const html = renderToStaticMarkup(await ExceptionsPage())
    expect(html).toContain('All exceptions')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('aria-current="page"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: ExceptionsPage } = await import('./page')
    const html = renderToStaticMarkup(await ExceptionsPage())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
