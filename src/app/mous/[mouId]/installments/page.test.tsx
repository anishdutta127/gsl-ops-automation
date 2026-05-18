import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function userWith(role: User['role'], department: User['department'], id: string): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    role,
    department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

const MOU_SIGNED_WITH_INSTALLMENTS = 'MOU-STEAM-2627-001'
const MOU_SIGNED_NO_INSTALLMENTS = 'MOU-STEAM-2526-028'
const MOU_UNSIGNED = 'MOU-STEAM-2627-042'

describe('/mous/[mouId]/installments - schedule entry-point CTA (Gate 5A.9 Step 1)', () => {
  it(
    'shows Set payment schedule CTA when Signed + Finance + zero instalments',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('Finance', 'finance', 'finance-user'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_NO_INSTALLMENTS }) }),
      )
      expect(html).toContain('data-testid="empty-state-set-schedule"')
      expect(html).toMatch(
        new RegExp(`href="/mous/${MOU_SIGNED_NO_INSTALLMENTS}/installments/schedule-edit"`),
      )
      expect(html).toContain('Set payment schedule')
    },
  )

  it(
    'shows Set payment schedule CTA for Sales department (canEditMOU)',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('SalesHead', 'sales', 'sales-user'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_NO_INSTALLMENTS }) }),
      )
      expect(html).toContain('data-testid="empty-state-set-schedule"')
    },
  )

  it(
    'hides Set payment schedule CTA for Ops department (no canEdit gate)',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('OpsEmployee', 'ops', 'ops-user'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_NO_INSTALLMENTS }) }),
      )
      expect(html).not.toContain('data-testid="empty-state-set-schedule"')
    },
  )

  it(
    'shows unsigned hint instead of CTA when MOU is Pending Signature',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('Finance', 'finance', 'finance-user'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_UNSIGNED }) }),
      )
      expect(html).not.toContain('data-testid="empty-state-set-schedule"')
      expect(html).toContain('data-testid="empty-state-unsigned-hint"')
      expect(html).toContain('Sign the MOU first')
      expect(html).toMatch(new RegExp(`href="/mous/${MOU_UNSIGNED}"`))
    },
  )

  it(
    'hides the empty state entirely when instalments exist',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('Finance', 'finance', 'finance-user'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_WITH_INSTALLMENTS }) }),
      )
      expect(html).not.toContain('data-testid="no-installments"')
      expect(html).not.toContain('data-testid="empty-state-set-schedule"')
    },
  )

  it('contains no raw hex codes (token discipline)', { timeout: 30000 }, async () => {
    getCurrentUserMock.mockResolvedValue(userWith('Finance', 'finance', 'finance-user'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_NO_INSTALLMENTS }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
