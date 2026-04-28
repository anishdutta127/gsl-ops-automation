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
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND')
    },
  }
})

vi.mock('@/data/sales_opportunities.json', () => ({
  default: [
    opp('OPP-2627-001', 'vishwanath.g', { schoolName: 'Frank Public School' }),
    opp('OPP-2627-002', 'pratik.d', { schoolName: 'Definitely Not A Real Place 9000' }),
    opp('OPP-2627-003', 'vishwanath.g', { lossReason: 'School chose competitor' }),
  ],
}))

function opp(id: string, createdBy: string, overrides: Partial<SalesOpportunity> = {}): SalesOpportunity {
  return {
    id, schoolName: 'Test School', schoolId: null, city: 'Pune',
    state: 'Maharashtra', region: 'South-West', salesRepId: 'sp-vikram',
    programmeProposed: 'STEAM', gslModel: null, commitmentsMade: null,
    outOfScopeRequirements: null, recceStatus: null, recceCompletedAt: null,
    status: 'recce-needed', approvalNotes: null, conversionMouId: null,
    lossReason: null, schoolMatchDismissed: false,
    createdAt: '2026-04-28T09:00:00Z', createdBy,
    auditLog: [
      { timestamp: '2026-04-28T09:00:00Z', user: createdBy, action: 'opportunity-created' },
    ],
    ...overrides,
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

describe('/sales-pipeline/[id] detail page', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({
        params: Promise.resolve({ id: 'OPP-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('returns notFound for unknown opportunity id', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    await expect(
      Page({
        params: Promise.resolve({ id: 'OPP-DOES-NOT-EXIST' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('renders the audit log + edit + mark-lost links for own opportunity', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'OPP-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="opp-detail-audit-log"')
    expect(html).toContain('data-testid="opp-detail-edit-link"')
    expect(html).toContain('data-testid="opp-detail-mark-lost-link"')
  })

  it('did-you-mean panel surfaces when token-match crosses threshold', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'OPP-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    // Frank Public School token-matches the existing schools.json
    // entry; the suggestion panel must render with both action forms.
    expect(html).toContain('data-testid="opp-detail-school-suggestion"')
    expect(html).toContain('data-testid="opp-link-existing-school"')
    expect(html).toContain('data-testid="opp-dismiss-school-match"')
  })

  it('did-you-mean panel does NOT surface when name has no plausible match', async () => {
    getCurrentUserMock.mockResolvedValue(user('anish.d', 'Admin'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'OPP-2627-002' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toContain('data-testid="opp-detail-school-suggestion"')
  })

  it('lost opportunity renders the Lost pill and hides edit / mark-lost', async () => {
    getCurrentUserMock.mockResolvedValue(user('vishwanath.g', 'SalesRep'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'OPP-2627-003' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="opp-detail-lost-pill"')
    expect(html).not.toContain('data-testid="opp-detail-edit-link"')
    expect(html).not.toContain('data-testid="opp-detail-mark-lost-link"')
  })
})
