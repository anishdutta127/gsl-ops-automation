/*
 * /finance/schools-receipts page tests (Gate 4.95 Session 4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, Payment, School, User } from '@/lib/types'

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
  FinanceFilterBar: () => <section data-testid="finance-filter-bar" />,
}))

const FIXTURE_MOUS: Partial<MOU>[] = [
  {
    id: 'MOU-SR-A',
    schoolId: 'SCH-A',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    status: 'Active',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    contractValue: 100000,
    salesChannel: 'School Programs (Course)',
  },
  {
    id: 'MOU-SR-B',
    schoolId: 'SCH-B',
    schoolName: 'Bravo School',
    programme: 'Robotics',
    status: 'Completed',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    contractValue: 50000,
    salesChannel: 'Bootcamps',
  },
]

const FIXTURE_PAYMENTS: Partial<Payment>[] = [
  {
    id: 'MOU-SR-A-i1',
    mouId: 'MOU-SR-A',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    expectedAmount: 50000,
    receivedAmount: 30000,
    receivedDate: '2026-04-10',
    dueDateIso: '2026-04-01',
    status: 'Partial',
    instalmentSeq: 1,
    instalmentLabel: '1 of 2',
  },
]

const FIXTURE_SCHOOLS: Partial<School>[] = [
  { id: 'SCH-A', name: 'Alpha School', region: 'West' },
  { id: 'SCH-B', name: 'Bravo School', region: 'East' },
]

vi.mock('@/data/mous.json', () => ({ default: FIXTURE_MOUS }))
vi.mock('@/data/payments.json', () => ({ default: FIXTURE_PAYMENTS }))
vi.mock('@/data/schools.json', () => ({ default: FIXTURE_SCHOOLS }))

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

describe('/finance/schools-receipts page', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Ffinance%2Fschools-receipts',
    )
  })

  it('renders the header + subtitle', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('Schools and receipts')
    expect(html).toContain('Receipt status by school')
  })

  it('mounts the FinanceFilterBar', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="finance-filter-bar"')
  })

  it('renders the sort selector with the documented sort options', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="schools-receipts-sort"')
    expect(html).toContain('Contract value (high to low)')
    expect(html).toContain('Outstanding (high to low)')
    expect(html).toContain('Percent received (low to high)')
  })

  it('renders the desktop table with one row per school', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="schools-receipts-table"')
    expect(html).toContain('data-testid="schools-receipts-row-SCH-A"')
    expect(html).toContain('data-testid="schools-receipts-row-SCH-B"')
  })

  it('renders status pills for each row', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="schools-receipts-status-SCH-A"')
    // SCH-B has only Completed MOUs -> Closed pill.
    expect(html).toContain('data-testid="schools-receipts-status-SCH-B"')
    expect(html).toContain('Closed')
  })

  it('shows the empty state when nothing matches the filter', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: { p: 'Harvard HBPE' } }),
    )
    expect(html).toContain('data-testid="schools-receipts-empty"')
  })

  it('contains no em-dashes (U+2014)', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    const emDash = String.fromCharCode(0x2014)
    expect(html.includes(emDash)).toBe(false)
  })

  it('contains no raw hex colour codes in style attributes', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(/style="[^"]*#[0-9a-fA-F]{3,6}/.test(html)).toBe(false)
  })
})
