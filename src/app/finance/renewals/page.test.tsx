/*
 * /finance/renewals page tests (Gate 4.95 Session 4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, Payment, SalesPerson, User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

vi.mock('@/components/dashboard/FinanceFilterBar', () => ({
  // Stub keeps the data-testid so the page test can verify the bar
  // is mounted without pulling in the client-side useRouter hook.
  FinanceFilterBar: () => <section data-testid="finance-filter-bar" />,
}))

// Stable fixture: one expired MOU, one due in 10 days, one beyond.
const FIXTURE_MOUS: Partial<MOU>[] = [
  {
    id: 'MOU-RENEW-EXP',
    schoolId: 'SCH-A',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    endDate: '2026-04-01',
    status: 'Active',
    contractValue: 100000,
    salesPersonId: 'sp-vikram',
    auditLog: [],
  },
  {
    id: 'MOU-RENEW-WK',
    schoolId: 'SCH-B',
    schoolName: 'Bravo School',
    programme: 'Robotics',
    endDate: '2026-05-15',
    status: 'Active',
    contractValue: 50000,
    salesPersonId: null,
    auditLog: [],
  },
  {
    id: 'MOU-RENEW-BEYOND',
    schoolId: 'SCH-C',
    schoolName: 'Charlie School',
    programme: 'Young Pioneers',
    endDate: '2027-04-01',
    status: 'Active',
    contractValue: 200000,
    salesPersonId: null,
    auditLog: [],
  },
]

vi.mock('@/data/mous.json', () => ({
  default: FIXTURE_MOUS,
}))

vi.mock('@/data/payments.json', () => ({
  default: [] as Partial<Payment>[],
}))

vi.mock('@/data/sales_team.json', () => ({
  default: [
    {
      id: 'sp-vikram',
      name: 'Vikram T.',
      email: 'v@x',
      phone: null,
      territories: [],
      programmes: ['STEAM'],
      active: true,
      joinedDate: '2025-01-01',
    },
  ] as SalesPerson[],
}))

function finance(): User {
  return {
    id: 'pranav.p',
    name: 'Pranav',
    email: 'p@example.test',
    role: 'Finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/finance/renewals page', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Ffinance%2Frenewals',
    )
  })

  it('renders the header + subtitle copy', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('Renewal needed')
    expect(html).toContain('Renewals are owned by sales')
    expect(html).toContain('accounts-team early warning')
  })

  it('mounts the FinanceFilterBar', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="finance-filter-bar"')
  })

  it('mounts the renewals-specific extra filter form', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="renewals-extra-filters"')
    expect(html).toContain('data-testid="renewals-filter-rep"')
    expect(html).toContain('data-testid="renewals-filter-status"')
  })

  it('renders all five bucket sections', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    for (const bucket of ['expired', 'week', 'month', 'ninety', 'beyond']) {
      expect(html).toContain(`data-testid="renewals-bucket-${bucket}"`)
    }
  })

  it('renders the per-row Mark as Renewed form action', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain(
      'action="/api/mou/MOU-RENEW-EXP/mark-renewed"',
    )
    expect(html).toContain('Mark as Renewed')
  })

  it('renders the per-row Decline to renew form action', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain(
      'action="/api/mou/MOU-RENEW-EXP/decline-renewal"',
    )
    expect(html).toContain('Decline to renew')
  })

  it('renders the disabled Schedule follow-up button with Phase 1.1 title', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="renewals-row-followup-MOU-RENEW-EXP"')
    expect(html).toContain('Coming in Phase 1.1')
  })

  it('shows the empty-bucket line for buckets with no rows', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    // The "ninety" bucket has no MOUs in the fixture.
    expect(html).toContain('data-testid="renewals-bucket-empty-ninety"')
    expect(html).toContain('No MOUs in this bucket.')
  })

  it('narrows by programme filter from the URL', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: { p: 'Robotics' } }),
    )
    // Bravo School is the Robotics MOU; Alpha (STEAM) should be filtered out.
    expect(html).toContain('Bravo School')
    expect(html).not.toContain('Alpha School')
  })

  it('contains no em-dashes (U+2014)', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    const emDash = String.fromCharCode(0x2014)
    expect(html.includes(emDash)).toBe(false)
  })

  it('contains no raw hex colour codes', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    // Style attributes would expose hex. Catch #[0-9a-f]{3,6} sequences
    // inside style="..." attributes (the rest of the page uses Tailwind
    // tokens, so raw hex outside style would also fail).
    expect(/style="[^"]*#[0-9a-fA-F]{3,6}/.test(html)).toBe(false)
  })
})
