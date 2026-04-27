import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => { vi.clearAllMocks() })

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('/mous/[mouId]/delivery-ack page (D4 manual-upload)', () => {
  it('OpsHead sees Print blank handover form + Record signed form for eligible dispatches', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('action="/api/delivery-ack/template"')
    expect(html).toContain('action="/api/delivery-ack/acknowledge"')
    expect(html).toContain('Print blank handover form')
    expect(html).toContain('Record signed form')
    expect(html).toContain('Signed form URL')
  })

  it('SalesRep on own MOU sees role-locked message (no forms)', async () => {
    // sp-roveena owns MOU-STEAM-2627-001 post Week 3 import
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toContain('action="/api/delivery-ack/template"')
    expect(html).not.toContain('action="/api/delivery-ack/acknowledge"')
    expect(html).toContain('requires the OpsHead or Admin role')
  })

  it('error=invalid-url surfaces a friendly message', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'invalid-url' }),
      }),
    )
    expect(html).toContain('URL is not valid')
  })

  it('acknowledged=DSP-... surfaces success message with the dispatch id', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ acknowledged: 'DSP-001' }),
      }),
    )
    expect(html).toContain('DSP-001')
    expect(html).toContain('recorded as acknowledged')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
