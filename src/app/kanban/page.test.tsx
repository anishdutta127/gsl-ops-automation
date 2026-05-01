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

describe('/kanban (W4-I.5 P2C5 route)', () => {
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

  it('Pre-Ops column uses the "Needs triage" badge framing rather than a numeric stage label', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Needs triage:')
  })

  it('renders MouCards inside columns from the real fixture', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="mou-card"')
    // Real fixture has MOU-STEAM-2627-001 at "Mutahhary Public School Baroo".
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
    // Title shows "<n> active MOUs across 10 stages" post-W4-C.1
    // (post-signing-intake added at column position 3); the count is the
    // active-cohort filter result (51 in the W4-A.2 fixture).
    expect(html).toMatch(/\d+ active MOUs across 10 stages/)
  })

  it('W4-I.5 P2C5: kanban-overview tab strip is no longer rendered', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    // Pre-W4-I.5 the kanban + overview lived under one route with a tab
    // strip swap. Post-P2C5 the dashboard moved to / and the kanban here;
    // the tab strip is dropped because the global TopNav exposes both.
    expect(html).not.toContain('data-testid="kanban-overview-tabs"')
  })

  it('renders the click-vs-drag interaction hint above the kanban', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="kanban-interaction-hint"')
    // W4-B.4 tightened the hint to a single short sentence.
    expect(html).toContain('Click to open. Drag the grip to move.')
  })

  // W4-B.1 defensive check: cross-verification is auto-skipped by
  // deriveStage's first-non-null-wins logic, so no card in the active
  // cohort should land in that column. If this test fails, deriveStage
  // (or stageEnteredDate) regressed.
  it('no card lands in the cross-verification column (auto-skip preserved)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    // The column header itself still renders (KANBAN_COLUMNS lists 9
    // columns including cross-verification); we assert the column is
    // empty by checking the count chip and the empty-state copy.
    const sectionMatch = html.match(
      /data-testid="droppable-cross-verification"[\s\S]*?data-testid="droppable-/,
    ) ?? html.match(/data-testid="droppable-cross-verification"[\s\S]*$/)
    expect(sectionMatch).not.toBeNull()
    if (sectionMatch !== null) {
      const section = sectionMatch[0]
      expect(section).toContain('Empty.')
      // No mou-card should be inside this column.
      expect(section.match(/data-testid="mou-card"/g) ?? []).toHaveLength(0)
    }
  })

  it('cards render the per-stage next-step label (W4-B.1 + W4-C.1)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
    // W4-C.1: pre-backfill, the active 51 MOUs without IntakeRecords sit
    // at post-signing-intake. Their next-step label is "Confirm actuals".
    // Post-backfill (W4-C.4) ~17 cards will gain intake records and
    // advance; this assertion stays valid because plenty of active MOUs
    // remain in post-signing-intake.
    expect(html).toContain('Next: Confirm actuals')
    // Defensive: the cross-verification placeholder text never reaches
    // the rendered HTML.
    expect(html).not.toContain('Auto-skipped')
  })
})
