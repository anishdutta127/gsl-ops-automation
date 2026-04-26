import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
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

describe('/help page', () => {
  it('renders for any authenticated user (SalesRep)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-vikram'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Help')
    expect(html).toContain('What can I do?')
  })

  it('renders all four sections', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('What can I do?')
    expect(html).toContain('How do I do X?')
    expect(html).toContain('What does X mean?')
    expect(html).toContain('Something is broken or confusing')
  })

  it('renders capability rows for the documented roles', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Admin')
    expect(html).toContain('Leadership')
    expect(html).toContain('OpsHead')
    expect(html).toContain('SalesHead')
    expect(html).toContain('SalesRep')
    expect(html).toContain('Finance')
    expect(html).toContain('TrainerHead')
  })

  it('renders workflow steps for the common tasks', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Confirm actuals on a MOU')
    expect(html).toContain('Generate a proforma invoice')
    expect(html).toContain('Raise a dispatch')
    expect(html).toContain('Send a feedback request')
    expect(html).toContain('Record a signed delivery acknowledgement')
  })

  it('redirects unauthenticated viewers to /login with next preserved', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page()).rejects.toThrow('REDIRECT:/login?next=%2Fhelp')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
