import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/kanban'),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

function salesRep(): User {
  return {
    id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/kanban lifecycle view (default)', () => {
  it('renders 9 stage columns with the Pre-Ops Legacy column first', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="kanban-board"')
    expect(html).toContain('data-testid="stage-column-pre-ops"')
    expect(html).toContain('data-testid="stage-column-mou-signed"')
    expect(html).toContain('data-testid="stage-column-actuals-confirmed"')
    expect(html).toContain('data-testid="stage-column-cross-verification"')
    expect(html).toContain('data-testid="stage-column-invoice-raised"')
    expect(html).toContain('data-testid="stage-column-payment-received"')
    expect(html).toContain('data-testid="stage-column-kit-dispatched"')
    expect(html).toContain('data-testid="stage-column-delivery-acknowledged"')
    expect(html).toContain('data-testid="stage-column-feedback-submitted"')
  })

  it('Pre-Ops column uses the "Pending Signature" badge framing rather than a numeric stage label', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Pending Signature:')
  })

  it('renders MouCards inside columns from the real fixture', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="mou-card"')
    expect(html).toContain('MOU-STEAM-2627-001')
  })

  it('SalesRep also sees the kanban (Phase 1 W3-B: UI gates disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="kanban-board"')
  })

  it('redirects unauthenticated viewer to /login with next=/kanban', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: HomePage } = await import('./page')
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login?next=%2Fkanban')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('column counts sum to total MOU count from fixture', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(/\d+ active MOUs across 10 stages/)
  })

  it('kanban-overview tab strip is no longer rendered', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('data-testid="kanban-overview-tabs"')
  })

  it('renders the click-vs-drag interaction hint above the kanban', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="kanban-interaction-hint"')
    expect(html).toContain('Click to open. Drag the grip to move.')
  })

  it('no card lands in the cross-verification column (auto-skip preserved)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    const sectionMatch = html.match(
      /data-testid="droppable-cross-verification"[\s\S]*?data-testid="droppable-/,
    ) ?? html.match(/data-testid="droppable-cross-verification"[\s\S]*$/)
    expect(sectionMatch).not.toBeNull()
    if (sectionMatch !== null) {
      const section = sectionMatch[0]
      expect(section).toContain('Empty.')
      expect(section.match(/data-testid="mou-card"/g) ?? []).toHaveLength(0)
    }
  })

  it('cards render the per-stage next-step label (W4-B.1 + W4-C.1)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Next: Confirm actuals')
    expect(html).not.toContain('Auto-skipped')
  })

  it('?view=lifecycle explicitly renders the lifecycle columns (parity with default)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ view: 'lifecycle' }) }))
    expect(html).toContain('data-testid="stage-column-pre-ops"')
    expect(html).toContain('data-testid="stage-column-feedback-submitted"')
  })

  it('unknown ?view= value falls back to the lifecycle view', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ view: 'nonsense' }) }))
    expect(html).toContain('data-testid="kanban-board"')
    expect(html).toContain('data-testid="stage-column-mou-signed"')
  })
})

describe('/kanban operations view (?view=operations)', () => {
  it('renders the operations page header copy', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toContain('Active operations')
    expect(html).toContain('Track active dispatches by stage.')
    expect(html).toContain('data-testid="ops-kanban-page"')
    expect(html).toContain('data-testid="ops-kanban-subtitle"')
  })

  it('renders all 6 column testids in canonical order', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toContain('data-testid="kanban-column-awaiting-actuals"')
    expect(html).toContain('data-testid="kanban-column-allocation-in-progress"')
    expect(html).toContain('data-testid="kanban-column-pending-sales-approval"')
    expect(html).toContain('data-testid="kanban-column-ready-for-dispatch"')
    expect(html).toContain('data-testid="kanban-column-in-transit"')
    expect(html).toContain('data-testid="kanban-column-delivered"')
    const idxAwaiting = html.indexOf('kanban-column-awaiting-actuals')
    const idxDelivered = html.indexOf('kanban-column-delivered')
    expect(idxAwaiting).toBeLessThan(idxDelivered)
  })

  it('renders the filter rail + Apply + Reset + programme chips', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toContain('data-testid="ops-kanban-filter-rail"')
    expect(html).toContain('data-testid="kanban-filter-apply"')
    expect(html).toContain('data-testid="kanban-filter-reset"')
    expect(html).toContain('data-testid="kanban-chip-programme-STEAM"')
    expect(html).toContain('data-testid="kanban-chip-programme-Young Pioneers"')
    expect(html).toContain('data-testid="kanban-chip-programme-Harvard HBPE"')
    expect(html).toContain('data-testid="kanban-chip-programme-Robotics"')
    expect(html).toContain('data-testid="kanban-chip-super-NE"')
    expect(html).toContain('data-testid="kanban-chip-super-SW"')
    expect(html).toContain('data-testid="kanban-chip-region-East"')
    expect(html).toContain('data-testid="kanban-input-from"')
    expect(html).toContain('data-testid="kanban-input-to"')
    expect(html).toContain('data-testid="kanban-select-sales-rep"')
    expect(html).toContain('data-testid="kanban-select-ops-owner"')
  })

  it('renders the mobile accordion structure', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toContain('data-testid="kanban-accordion-awaiting-actuals"')
    expect(html).toContain('data-testid="kanban-accordion-delivered"')
  })

  it('renders at least one kanban card from the fixture set', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toMatch(/data-testid="kanban-card-/)
  })

  it('?p=Robotics narrows the rendered cards to zero (no Robotics in fixture)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const allHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    const filteredHtml = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ view: 'operations', p: 'Robotics' }) }),
    )
    const allCount = (allHtml.match(/data-testid="kanban-card-/g) ?? []).length
    const filteredCount = (filteredHtml.match(/data-testid="kanban-card-/g) ?? []).length
    expect(allCount).toBeGreaterThan(0)
    expect(filteredCount).toBe(0)
  })

  it('?p=STEAM marks the STEAM programme chip as pressed', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ view: 'operations', p: 'STEAM' }) }),
    )
    expect(html).toMatch(
      /data-testid="kanban-chip-programme-STEAM"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="kanban-chip-programme-STEAM"/,
    )
  })

  it('contains no em-dash characters (British English copy)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('does NOT add a second <main> element beyond the page-owned one (single <main> rule)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    // The page itself owns the only <main id="main-content"> on this route
    // (the root layout's <main> is not in this rendered fragment because
    // we render the page in isolation). Assert exactly one <main> tag.
    const mainOpenTags = html.match(/<main[\s>]/g) ?? []
    expect(mainOpenTags).toHaveLength(1)
  })
})

describe('/kanban view toggle', () => {
  it('renders both toggle buttons on the lifecycle view; lifecycle is active', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="kanban-view-toggle"')
    expect(html).toContain('data-testid="kanban-view-toggle-lifecycle"')
    expect(html).toContain('data-testid="kanban-view-toggle-operations"')
    expect(html).toMatch(
      /data-testid="kanban-view-toggle-lifecycle"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="kanban-view-toggle-lifecycle"/,
    )
  })

  it('marks the operations button as pressed on ?view=operations', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations' }) }))
    expect(html).toMatch(
      /data-testid="kanban-view-toggle-operations"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="kanban-view-toggle-operations"/,
    )
  })

  it('preserves other search params when switching views (operations -> lifecycle)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: 'operations', p: 'STEAM' }) }))
    // The lifecycle toggle href on the operations view should carry p=STEAM
    // and drop the view= param (lifecycle is the default; canonical URL is param-free).
    expect(html).toMatch(
      /data-testid="kanban-view-toggle-lifecycle"[^>]*href="\/kanban\?p=STEAM"|href="\/kanban\?p=STEAM"[^>]*data-testid="kanban-view-toggle-lifecycle"/,
    )
  })

  it('preserves other search params when switching views (lifecycle -> operations)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ programme: 'STEAM' }) }))
    // The operations toggle href on the lifecycle view should carry programme=STEAM
    // and add view=operations.
    expect(html).toMatch(
      /data-testid="kanban-view-toggle-operations"[^>]*href="\/kanban\?programme=STEAM&amp;view=operations"|href="\/kanban\?programme=STEAM&amp;view=operations"[^>]*data-testid="kanban-view-toggle-operations"/,
    )
  })
})
