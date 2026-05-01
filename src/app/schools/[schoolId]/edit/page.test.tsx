import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (path: string) => redirectMock(path),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function makeUser(role: User['role']): User {
  return {
    id: 'x', name: 'X', email: 'x@example.test', role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/schools/[schoolId]/edit page', () => {
  it('renders form for Admin (with GSTIN field)', { timeout: 15000 }, async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="region"')
    expect(html).toContain('name="gstNumber"')
    expect(html).toContain('Save changes')
    expect(html).toContain('Cancel')
  })

  it('renders form for Finance (with GSTIN field)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Finance'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('name="gstNumber"')
  })

  it('W4-I.4 MM4: OpsHead renders form WITHOUT the GSTIN field', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('OpsHead'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).not.toContain('name="gstNumber"')
  })

  it('W4-I.4 MM4: SalesRep renders form WITHOUT the GSTIN field', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).not.toContain('name="gstNumber"')
  })

  it('W4-I.4 MM4: Misba (OpsEmployee + OpsHead override) renders form WITHOUT the GSTIN field', async () => {
    const misba: User = {
      id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsEmployee',
      testingOverride: true, testingOverridePermissions: ['OpsHead'],
      active: true, passwordHash: 'X', createdAt: '', auditLog: [],
    }
    getCurrentUserMock.mockResolvedValue(misba)
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).toContain('<form')
    expect(html).not.toContain('name="gstNumber"')
  })

  it('W4-I.4 MM4: stale Phase 1 stub note no longer renders', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).not.toContain('Phase 1 note')
    expect(html).not.toContain('501 stub')
  })

  it('W4-I.4 MM4: ?error= renders the error banner', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }),
        searchParams: Promise.resolve({ error: 'invalid-gst' }),
      }),
    )
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain('GSTIN')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser('Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH' }), searchParams: noSp }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
