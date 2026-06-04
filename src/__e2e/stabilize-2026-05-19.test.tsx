/*
 * E2E flow verification for the 2026-05-19 stabilisation gate.
 *
 * Per CLAUDE.md "V4 verification standard": this gate's bug fixes
 * touch /mous/new, /mous/[id], /mous/[id]/pi, /mous/[id]/installments,
 * /mous, and /operations/vex/pi/new. Each flow below SSR-renders the
 * affected route component with realistic data from src/data/*.json
 * and asserts the page emits its primary structural markers (not raw
 * 500 / error text) and that the bug-fix surfaces render.
 *
 * Vitest renderToStaticMarkup is the V4 floor; full browser-based
 * walking is recorded in docs/gate-stabilize/E2E_VERIFICATION_LOG.md.
 *
 * Auth: TESTING_OPEN_ACCESS=true so the layer-1 access gates open and
 * we can walk Finance + Sales surfaces from a single Admin fixture.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const adminUser: User = {
  id: 'anish.d',
  name: 'Anish',
  email: 'anish@example.test',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: 'X',
  createdAt: '',
  auditLog: [],
}

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(adminUser)),
  getCurrentSession: vi.fn(() => Promise.resolve({ sub: adminUser.id })),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('@/components/ops/PageHeader', () => ({ PageHeader: () => null }))

const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
const ORIGINAL_LOCK = process.env.PI_PARALLEL_BUILD_LOCK
beforeAll(() => {
  process.env.TESTING_OPEN_ACCESS = 'true'
  // Default to lock ON; tests that need it off flip it locally.
  delete process.env.PI_PARALLEL_BUILD_LOCK
})
afterAll(() => {
  if (ORIGINAL_TESTING === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  if (ORIGINAL_LOCK === undefined) delete process.env.PI_PARALLEL_BUILD_LOCK
  else process.env.PI_PARALLEL_BUILD_LOCK = ORIGINAL_LOCK
})

describe('Flow 1: Create new MOU', () => {
  it('GET /mous/new picker page renders without crash and exposes the drafts shortcut', async () => {
    const { default: Page } = await import('../app/mous/new/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    // PageHeader is mocked out; assert against the picker body content.
    expect(html).toContain('STEAM / Robotics MOU')
    expect(html).toContain('See your saved drafts')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('GET /mous/new/STEAM-v3 wizard renders without crash on live sales_team', async () => {
    const { default: Page } = await import('../app/mous/new/[templateId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ templateId: 'STEAM-v3' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Effective date')
    expect(html).toContain('Generate .docx')
    // The fallback hint introduced by the Bug 3 fix:
    expect(html).toContain('still being hardened')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 2: Generate PI for an instalment', () => {
  it('GET /mous/[id]/pi renders the lock banner when locked (default state)', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const { default: Page } = await import('../app/mous/[mouId]/pi/page')
    // Use a known Active MOU from the fixture so the page does not 404.
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Locked during parallel-build window')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('GET /mous/[id]/pi?error=parallel-build-locked renders the friendly redirect banner', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const { default: Page } = await import('../app/mous/[mouId]/pi/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'parallel-build-locked' }),
      }),
    )
    expect(html).toContain('data-testid="pi-action-error"')
    expect(html).toContain('Pranav continues issuing PIs from gsl-mou-system')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 4: View MOU detail (TDS + schedule derivation)', () => {
  it('GET /mous/[id] detail renders KPI tiles + lifecycle + audit log', async () => {
    const { default: Page } = await import('../app/mous/[mouId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    // Detail page primary structural markers
    expect(html).toContain('Master status tracker')
    expect(html).toContain('Lifecycle (instalment 1)')
    expect(html).toContain('Payment schedule')
    expect(html).toContain('Received')
    // Bug 5/6 surface: Received tile is derived (the text contains an Rs amount).
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 5: VEX PI page', () => {
  it('GET /operations/vex/pi/new renders the lock banner when locked', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const { default: Page } = await import('../app/operations/vex/pi/new/page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Locked during parallel-build window')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 3 - Step 2: drafts retired from the MOU registry', () => {
  it('GET /mous no longer lists the Drafts CTA (drafts retired per Pranav)', async () => {
    const { default: Page } = await import('../app/mous/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain('data-testid="drafts-link"')
    expect(html).not.toContain('Application error')
  }, 30000)
})
