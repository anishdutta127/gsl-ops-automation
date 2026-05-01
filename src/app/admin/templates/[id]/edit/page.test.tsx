import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const redirectMock = vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`) })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (p: string) => redirectMock(p),
}))
beforeEach(() => { vi.clearAllMocks() })

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@x.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/admin/templates/[id]/edit (W4-I.5 P3C3)', () => {
  it('Admin sees pre-filled edit form for the seeded Welcome template', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ id: 'TPL-WELCOME-DEFAULT' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="template-edit-form"')
    expect(html).toContain('value="TPL-WELCOME-DEFAULT"')
    expect(html).toContain('Welcome Note')
    expect(html).toContain('data-testid="template-edit-submit"')
  })

  it('SalesRep redirected with permission error', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-x'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ id: 'TPL-WELCOME-DEFAULT' }), searchParams: noSp }),
    ).rejects.toThrow('REDIRECT:/admin/templates?error=permission')
  })

  it('unknown template id triggers notFound', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ id: 'TPL-NOPE' }), searchParams: noSp }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('?error=invalid-recipient renders inline alert', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'TPL-WELCOME-DEFAULT' }),
        searchParams: Promise.resolve({ error: 'invalid-recipient' }),
      }),
    )
    expect(html).toContain('data-testid="template-edit-error"')
    expect(html).toContain('valid default recipient')
  })
})
