import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const redirectMock = vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`) })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (p: string) => redirectMock(p),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/mous/[mouId]/intake/edit page (W4-I.4 MM3)', () => {
  it('Admin sees the edit form for a MOU with an intake record', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    // MOU-STEAM-2627-027 has IR-W4C-001 in fixture.
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-027' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="intake-edit-form"')
    expect(html).toContain('data-testid="edit-poc-name"')
    expect(html).toContain('data-testid="edit-batteries"')
    for (let g = 1; g <= 10; g++) {
      expect(html).toContain(`data-testid="edit-grade-${g}"`)
    }
  })

  it('OpsHead can also see the form', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-027' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="intake-edit-form"')
  })

  it('redirects to /mous/[id]/intake when no intake record exists yet', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    // MOU-STEAM-2627-002 has no intake record per fixture.
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-002' }), searchParams: noSp }),
    ).rejects.toThrow(/REDIRECT:\/mous\/MOU-STEAM-2627-002\/intake$/)
  })

  it('SalesRep accessing unassigned MOU triggers notFound (no leak)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-other'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-027' }), searchParams: noSp }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('?error= renders the inline alert', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-027' }),
        searchParams: Promise.resolve({ error: 'invalid-batteries' }),
      }),
    )
    expect(html).toContain('data-testid="intake-edit-error"')
    expect(html).toContain('cannot be negative')
  })
})
