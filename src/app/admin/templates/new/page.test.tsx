import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`) })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => { vi.clearAllMocks() })

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@x.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/admin/templates/new (W4-I.5 P3C3)', () => {
  it('Admin sees the create form', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="template-new-form"')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="useCase"')
    expect(html).toContain('name="defaultRecipient"')
    expect(html).toContain('name="subject"')
    expect(html).toContain('name="bodyMarkdown"')
    expect(html).toContain('data-testid="template-new-submit"')
  })

  it('SalesRep redirected to /admin/templates with ?error=permission', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-x'))
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow('REDIRECT:/admin/templates?error=permission')
  })

  it('?error=missing-name renders the inline alert', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'missing-name' }) }),
    )
    expect(html).toContain('data-testid="template-new-error"')
    expect(html).toContain('Name is required')
  })
})
