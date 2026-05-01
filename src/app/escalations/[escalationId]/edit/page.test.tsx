import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })

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

describe('/escalations/[escalationId]/edit page (W4-I.4 MM5)', () => {
  it('Admin sees edit form pre-filled for ESC-001', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: 'ESC-001' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('data-testid="edit-status"')
    expect(html).toContain('data-testid="edit-category"')
    expect(html).toContain('data-testid="edit-type"')
    expect(html).toContain('data-testid="edit-description"')
  })

  it('shows all 6 status options', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: 'ESC-001' }), searchParams: noSp }),
    )
    expect(html).toContain('value="Open"')
    expect(html).toContain('value="WIP"')
    expect(html).toContain('value="Closed"')
    expect(html).toContain('value="Transfer to Other Department"')
    expect(html).toContain('value="Dispatched"')
    expect(html).toContain('value="In Transit"')
  })

  it('OpsHead can edit ESC-001 (OPS lane)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ escalationId: 'ESC-001' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="edit-status"')
  })

  it('SalesRep redirected with permission error (no escalation:resolve grant)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-x'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ escalationId: 'ESC-001' }), searchParams: noSp }),
    ).rejects.toThrow('REDIRECT:/escalations/ESC-001?error=permission')
  })

  it('OpsHead accessing SALES-lane escalation 404s (lane scoping preserved)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    // ESC-003 is SALES lane.
    await expect(
      Page({ params: Promise.resolve({ escalationId: 'ESC-003' }), searchParams: noSp }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('?error=invalid-status renders the error banner', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ escalationId: 'ESC-001' }),
        searchParams: Promise.resolve({ error: 'invalid-status' }),
      }),
    )
    expect(html).toContain('data-testid="esc-edit-error"')
    expect(html).toContain('Status is not one of the allowed values')
  })
})
