import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
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
  // BackButton (rendered by the installments page) calls useRouter();
  // provide a stub so the client component renders under renderToStaticMarkup.
  useRouter: () => ({ back: () => {}, push: () => {}, replace: () => {}, refresh: () => {} }),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

// Strict-gate tests: force production-mode so canEditMOU enforces
// Sales-only on the Ops-hidden case below. Testing-open default would
// open the gate for every active user.
const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeEach(() => {
  vi.clearAllMocks()
  process.env.TESTING_OPEN_ACCESS = 'false'
})
afterEach(() => {
  if (ORIGINAL_TESTING === undefined) {
    delete process.env.TESTING_OPEN_ACCESS
  } else {
    process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  }
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
      // The schedule-edit route is not yet built; the empty-state block
      // points editors at the (forthcoming) schedule editor rather than
      // linking out. Assert the current copy, not a dead href.
      expect(html).toContain('Use the schedule editor')
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

  it(
    'surfaces a friendly PI-failure banner on ?error= and hides it otherwise',
    { timeout: 30000 },
    async () => {
      getCurrentUserMock.mockResolvedValue(userWith('Finance', 'finance', 'finance-user'))
      const { default: Page } = await import('./page')
      const withError = renderToStaticMarkup(
        await Page({
          params: Promise.resolve({ mouId: MOU_SIGNED_WITH_INSTALLMENTS }),
          searchParams: Promise.resolve({ error: 'parallel-build-locked' }),
        }),
      )
      expect(withError).toContain('data-testid="installment-pi-error"')
      expect(withError).toContain('PI generation is locked during the parallel-build window.')

      const noError = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ mouId: MOU_SIGNED_WITH_INSTALLMENTS }) }),
      )
      expect(noError).not.toContain('data-testid="installment-pi-error"')
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
