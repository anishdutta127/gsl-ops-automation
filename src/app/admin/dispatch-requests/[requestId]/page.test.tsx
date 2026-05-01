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
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND')
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@gsl.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: '', createdAt: '', auditLog: [],
  }
}

const PENDING_DR_ID = 'DR-MOU-STEAM-2627-001-i1-20260427100000'

describe('/admin/dispatch-requests/[requestId] detail', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ requestId: PENDING_DR_ID }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('notFound when requestId does not match a DR', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ requestId: 'DR-DOES-NOT-EXIST' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('renders pending DR with all 3 action sections + audit log', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ requestId: PENDING_DR_ID }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('Approve &amp; convert to Dispatch')
    expect(html).toContain('Reject')
    expect(html).toContain('Cancel')
    expect(html).toContain('Audit log')
    expect(html).toContain('data-testid="dr-approve-submit"')
    expect(html).toContain('data-testid="dr-reject-submit"')
    expect(html).toContain('data-testid="dr-cancel-submit"')
    expect(html).toContain('Mutahhary')
    expect(html).toContain('STEAM kit set')
  })

  it('per-grade line items render their grade allocations', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ requestId: 'DR-MOU-STEAM-2627-009-i1-20260426093000' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('per-grade')
    expect(html).toContain('Grade 1: 25')
    expect(html).toContain('Grade 2: 25')
  })

  it('?error=permission renders the error banner', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ requestId: PENDING_DR_ID }), searchParams: Promise.resolve({ error: 'permission' }) }),
    )
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain('do not have permission')
  })

  it('?ok=approved renders the success banner', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ requestId: PENDING_DR_ID }), searchParams: Promise.resolve({ ok: 'approved' }) }),
    )
    expect(html).toMatch(/role="status"/)
    expect(html).toContain('Approved and converted')
  })
})
