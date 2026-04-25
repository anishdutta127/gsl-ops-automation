import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

function salesRep(id: string): User {
  return {
    id, name: 'Rep', email: `${id}@example.test`, role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/mous list page', () => {
  it('renders MOU rows from fixture data with no filters', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: MousPage } = await import('./page')
    const html = renderToStaticMarkup(await MousPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('Springwood')
    expect(html).toContain('MOU-STEAM-2627-001')
  })

  it('SalesRep scoping reduces visible MOUs to own-assigned only', async () => {
    // sp-vikram is the salesPersonId on MOU-STEAM-2627-001 (Greenfield) only
    getCurrentUserMock.mockResolvedValue(salesRep('sp-vikram'))
    const { default: MousPage } = await import('./page')
    const html = renderToStaticMarkup(await MousPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Greenfield Academy')
    expect(html).not.toContain('Springwood International')
    expect(html).not.toContain('Narayana Group')
  })

  it('status filter narrows the list', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: MousPage } = await import('./page')
    const html = renderToStaticMarkup(
      await MousPage({ searchParams: Promise.resolve({ status: 'Completed' }) }),
    )
    expect(html).toContain('No MOUs match the current filters.')
  })

  it('search filters by school name substring', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: MousPage } = await import('./page')
    const html = renderToStaticMarkup(
      await MousPage({ searchParams: Promise.resolve({ q: 'narayana' }) }),
    )
    expect(html).toContain('Narayana')
    expect(html).not.toContain('Greenfield Academy')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: MousPage } = await import('./page')
    const html = renderToStaticMarkup(await MousPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
