import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SalesOpportunity, User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
  }
})

vi.mock('@/data/sales_opportunities.json', () => ({
  default: [
    opp('OPP-2627-001', 'vishwanath.g', 'sp-vikram', 'Test One', 'Pune', 'South-West', 'recce-scheduled'),
    opp('OPP-2627-002', 'vishwanath.g', 'sp-vikram', 'Test Two', 'Bangalore', 'South-West', 'awaiting-approval'),
    opp('OPP-2627-003', 'pratik.d', 'sp-rohan', 'Test Three', 'Kolkata', 'East', 'proposal-sent'),
  ],
}))

function opp(id: string, createdBy: string, salesRepId: string, schoolName: string, city: string, region: string, status: string): SalesOpportunity {
  return {
    id, schoolName, schoolId: null, city,
    state: region === 'South-West' ? 'Karnataka' : 'West Bengal',
    region, salesRepId, programmeProposed: 'STEAM',
    gslModel: null, commitmentsMade: null, outOfScopeRequirements: null,
    recceStatus: null, recceCompletedAt: null, status,
    approvalNotes: null, conversionMouId: null, lossReason: null,
    schoolMatchDismissed: false,
    createdAt: '2026-04-28T09:00:00Z', createdBy,
    auditLog: [{ timestamp: '2026-04-28T09:00:00Z', user: createdBy, action: 'opportunity-created' }],
  }
}

function user(id: string, role: User['role']): User {
  return {
    id, name: id, email: `${id}@getsetlearn.info`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/sales-pipeline list page', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('SalesRep sees only own opportunities by default (mine filter)', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="opp-row-OPP-2627-001"')
    expect(html).toContain('data-testid="opp-row-OPP-2627-002"')
    // OPP-2627-003 is created by pratik.d (not own)
    expect(html).not.toContain('data-testid="opp-row-OPP-2627-003"')
  })

  it('Admin sees all by default', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="opp-row-OPP-2627-001"')
    expect(html).toContain('data-testid="opp-row-OPP-2627-002"')
    expect(html).toContain('data-testid="opp-row-OPP-2627-003"')
  })

  it('?owner=all expands SalesRep view to full team', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ owner: 'all' }) }),
    )
    expect(html).toContain('data-testid="opp-row-OPP-2627-003"')
  })

  it('?region=East narrows to East-region rows', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ region: 'East' }) }),
    )
    expect(html).toContain('data-testid="opp-row-OPP-2627-003"')
    expect(html).not.toContain('data-testid="opp-row-OPP-2627-001"')
  })

  it('?q=approval matches the approval-status row', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ q: 'approval' }) }),
    )
    expect(html).toContain('data-testid="opp-row-OPP-2627-002"')
    expect(html).not.toContain('data-testid="opp-row-OPP-2627-001"')
  })

  it('"New opportunity" link visible only to roles with sales-opportunity:create', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="sales-pipeline-new-link"')

    getCurrentUserMock.mockResolvedValue(user('shubhangi.g', 'Finance'))
    const html2 = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html2).not.toContain('data-testid="sales-pipeline-new-link"')
  })

  it('renders the created flash when ?created=1', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ created: '1' }) }),
    )
    expect(html).toContain('data-testid="sales-pipeline-created-flash"')
  })
})
