import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
  }
})

function user(id: string, role: User['role'], email?: string): User {
  return {
    id, name: id, email: email ?? `${id}@getsetlearn.info`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/sales-pipeline/new create form', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('redirects Finance (no create permission) to /sales-pipeline?error=permission', async () => {
    getCurrentUserMock.mockResolvedValue(user('shubhangi.g', 'Finance'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/sales-pipeline\?error=permission/)
  })

  it('renders the 12 form fields for a SalesRep', async () => {
    getCurrentUserMock.mockResolvedValue(
      user('vishwanath.g', 'SalesRep', 'vishwanath.g@getsetlearn.info'),
    )
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="form-schoolName"')
    expect(html).toContain('data-testid="form-city"')
    expect(html).toContain('data-testid="form-state"')
    expect(html).toContain('data-testid="form-region"')
    expect(html).toContain('data-testid="form-programme"')
    expect(html).toContain('data-testid="form-gslModel"')
    expect(html).toContain('data-testid="form-status"')
    expect(html).toContain('data-testid="form-recceStatus"')
    expect(html).toContain('data-testid="form-recceCompletedAt"')
    expect(html).toContain('data-testid="form-commitmentsMade"')
    expect(html).toContain('data-testid="form-outOfScopeRequirements"')
    expect(html).toContain('data-testid="form-approvalNotes"')
    expect(html).toContain('data-testid="form-submit"')
  })

  it('SalesRep with email matching a SalesPerson sees their rep id pre-filled (hidden field)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user('vishwanath.g', 'SalesRep', 'vishwanath.g@getsetlearn.info'),
    )
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="form-salesRepId-hidden"')
    expect(html).toContain('value="sp-vishwanath"')
  })

  it('Admin sees a sales-rep dropdown (no email match in users.json)', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="form-salesRepId"')
    // Non-hidden select carries multiple sp-... options
    expect(html).toContain('value="sp-vikram"')
    expect(html).toContain('value="sp-rohan"')
  })

  it('renders error flash from ?error=missing-status', async () => {
    getCurrentUserMock.mockResolvedValue(
      user('vishwanath.g', 'SalesRep', 'vishwanath.g@getsetlearn.info'),
    )
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'missing-status' }) }),
    )
    expect(html).toContain('data-testid="sales-pipeline-new-error"')
    expect(html).toContain('Status is required')
  })

  it('Status field carries the round-2 formalisation help text', async () => {
    getCurrentUserMock.mockResolvedValue(
      user('vishwanath.g', 'SalesRep', 'vishwanath.g@getsetlearn.info'),
    )
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('formalise standard statuses after round 2')
  })
})
