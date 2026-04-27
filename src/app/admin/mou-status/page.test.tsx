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
    id: 'anish.d', name: 'Anish', email: 'anish.d@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}
function salesRep(): User {
  return {
    id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/admin/mou-status', () => {
  it('renders the cohort filter chips with counts (all / active / archived)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="cohort-filter-all"')
    expect(html).toContain('data-testid="cohort-filter-active"')
    expect(html).toContain('data-testid="cohort-filter-archived"')
  })

  it('default view shows all 143 fixture MOUs in the table', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    // 143 rows with data-testid="mou-status-row-..." across active + archived.
    const rowMatches = html.match(/data-testid="mou-status-row-/g) ?? []
    expect(rowMatches.length).toBe(143)
  })

  it('?cohort=active filters to the 51-MOU active cohort', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ cohort: 'active' }) }))
    const rowMatches = html.match(/data-testid="mou-status-row-/g) ?? []
    expect(rowMatches.length).toBe(51)
  })

  it('?cohort=archived filters to the 92-MOU archived cohort', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ cohort: 'archived' }) }))
    const rowMatches = html.match(/data-testid="mou-status-row-/g) ?? []
    expect(rowMatches.length).toBe(92)
  })

  it('every row has a checkbox + a flip button', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ cohort: 'active' }) }))
    const checkboxes = html.match(/data-testid="bulk-select-/g) ?? []
    const flipButtons = html.match(/data-testid="flip-/g) ?? []
    expect(checkboxes.length).toBe(51)
    expect(flipButtons.length).toBe(51)
  })

  it('bulk-action bar exposes "Mark selected active" + "Mark selected archived" buttons', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="bulk-mark-active"')
    expect(html).toContain('data-testid="bulk-mark-archived"')
    expect(html).toContain('action="/api/admin/mou-status/bulk"')
  })

  it('SalesRep also reaches the page (W3-B; UI gating off)', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ cohort: 'active' }) }))
    expect(html).toContain('MOU cohort status')
    expect(html).toContain('data-testid="bulk-mark-active"')
  })

  it('?error=permission renders the role-gating error flash', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ error: 'permission' }) }))
    expect(html).toContain('data-testid="mou-status-error-flash"')
    expect(html).toContain('Editing cohort status requires the Admin role')
  })

  it('?bulkCount=N&bulkTarget=archived renders the bulk success flash', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ bulkCount: '5', bulkTarget: 'archived' }) }),
    )
    expect(html).toContain('data-testid="mou-status-bulk-flash"')
    expect(html).toContain('5 MOUs flipped')
  })

  it('?q=tathastu narrows to a single match via search', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: 'tathastu' }) }))
    const rowMatches = html.match(/data-testid="mou-status-row-/g) ?? []
    expect(rowMatches.length).toBe(1)
    expect(html).toContain('MOU-STEAM-2627-016')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ cohort: 'active' }) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
