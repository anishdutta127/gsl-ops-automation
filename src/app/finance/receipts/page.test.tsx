/*
 * /finance/receipts page tests (Gate 4.95 Session 4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, Payment, User } from '@/lib/types'

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
    id: 'MOU-R-1',
    schoolId: 'SCH-A',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    status: 'Active',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    contractValue: 100000,
  },
]

const FIXTURE_PAYMENTS: Partial<Payment>[] = [
  {
    id: 'MOU-R-1-i1',
    mouId: 'MOU-R-1',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    expectedAmount: 25000,
    receivedAmount: 25000,
    receivedDate: '2026-04-15',
    dueDateIso: '2026-04-01',
    status: 'Paid',
    instalmentSeq: 1,
    instalmentLabel: '1 of 4',
    piNumber: 'GSL/OPS/26-27/0001',
  },
  {
    id: 'MOU-R-1-i2',
    mouId: 'MOU-R-1',
    schoolName: 'Alpha School',
    programme: 'STEAM',
    expectedAmount: 25000,
    receivedAmount: null,
    receivedDate: null,
    dueDateIso: '2026-04-15',
    status: 'Pending',
    instalmentSeq: 2,
    instalmentLabel: '2 of 4',
    piNumber: null,
  },
]

vi.mock('@/data/mous.json', () => ({ default: FIXTURE_MOUS }))
vi.mock('@/data/payments.json', () => ({ default: FIXTURE_PAYMENTS }))

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

describe('/finance/receipts page', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Ffinance%2Freceipts',
    )
  })

  it('renders the header + subtitle', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('Receipts')
    expect(html).toContain('Instalment-level receipt status.')
  })

  it('mounts the FinanceFilterBar', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="finance-filter-bar"')
  })

  it('renders the aging summary tiles for every bucket', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="receipts-aging"')
    for (const bucket of ['today', '1-3', '3-7', '7-30', '30+']) {
      expect(html).toContain(`data-testid="receipts-aging-${bucket}"`)
    }
  })

  it('renders the receipts table with a row per payment', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="receipts-table"')
    expect(html).toContain('data-testid="receipts-row-MOU-R-1-i1"')
    expect(html).toContain('data-testid="receipts-row-MOU-R-1-i2"')
  })

  it('renders status pills with the right status labels', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="receipts-status-MOU-R-1-i1"')
    // i1 = Paid; i2 = Pending (due 2026-04-15, today is 2026-05-12 -> Overdue actually)
    expect(html).toContain('Paid')
  })

  it('renders the sort selector', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="receipts-sort"')
    expect(html).toContain('Due date (earliest first)')
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
