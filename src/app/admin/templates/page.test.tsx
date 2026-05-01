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

describe('/admin/templates list (W4-I.5 P3C3)', () => {
  it('Admin sees the list with all 5 seeded templates + New button', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('Communication Templates')
    expect(html).toContain('data-testid="template-list-create"')
    expect(html).toContain('data-testid="template-row-TPL-WELCOME-DEFAULT"')
    expect(html).toContain('data-testid="template-row-TPL-THANK-YOU-DEFAULT"')
    expect(html).toContain('data-testid="template-row-TPL-FOLLOW-UP-DEFAULT"')
    expect(html).toContain('data-testid="template-row-TPL-PAYMENT-REMINDER-DEFAULT"')
    expect(html).toContain('data-testid="template-row-TPL-DISPATCH-CONFIRMATION-DEFAULT"')
  })

  it('OpsHead can also see the list + New button', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="template-list-create"')
  })

  it('SalesRep sees the list (read-only) but no New button + no Edit links', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-x'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="template-row-TPL-WELCOME-DEFAULT"')
    expect(html).not.toContain('data-testid="template-list-create"')
    expect(html).not.toContain('data-testid="template-row-TPL-WELCOME-DEFAULT-edit"')
    expect(html).toContain('Read only')
  })

  it('useCase chip filter narrows the list', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ useCase: 'thank-you' }) }),
    )
    expect(html).toContain('data-testid="template-row-TPL-THANK-YOU-DEFAULT"')
    expect(html).not.toContain('data-testid="template-row-TPL-WELCOME-DEFAULT"')
  })

  it('?created= flash renders', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ created: 'TPL-X' }) }),
    )
    expect(html).toContain('data-testid="template-list-flash"')
    expect(html).toContain('TPL-X created')
  })

  it('?error=permission flash renders', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'permission' }) }),
    )
    expect(html).toContain('data-testid="template-list-error"')
  })

  it('redirects unauthenticated to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow('REDIRECT:/login?next=%2Fadmin%2Ftemplates')
  })
})
