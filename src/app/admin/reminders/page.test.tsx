import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d',
    name: 'Anish',
    email: 'anish.d@getsetlearn.info',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: '',
    createdAt: '',
    auditLog: [],
  }
}

describe('/admin/reminders list page', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('renders all 5 kind filters (all + 4 reminder kinds)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="rem-filter-all"')
    expect(html).toContain('data-testid="rem-filter-intake"')
    expect(html).toContain('data-testid="rem-filter-payment"')
    expect(html).toContain('data-testid="rem-filter-delivery-ack"')
    expect(html).toContain('data-testid="rem-filter-feedback-chase"')
  })

  it('renders the empty-state placeholder OR the reminder list', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    // One of the two render paths must match (empty or list)
    const hasList = html.includes('data-testid="reminders-list"')
    const hasEmpty = html.includes('data-testid="reminders-empty"')
    expect(hasList || hasEmpty).toBe(true)
  })

  it('renders the error-flash banner when ?error=permission', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'permission' }) }),
    )
    expect(html).toContain('data-testid="reminders-error"')
    expect(html).toContain('do not have permission')
  })
})
