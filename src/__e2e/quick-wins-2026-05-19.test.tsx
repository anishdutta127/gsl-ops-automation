/*
 * E2E flow verification for the 2026-05-19 quick-wins gate.
 *
 * Per CLAUDE.md V4 standard: SSR component-tree walk with realistic
 * data when Playwright is unavailable. Covers the two workstreams:
 *   - WS1: instalment % display on /mous/[id]/instalments and on the
 *     MOU detail right-column collapsible card.
 *   - WS2: salesperson reassignment - school detail shows current
 *     rep + Reassign CTA, reassign form renders with current rep.
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
beforeAll(() => {
  process.env.TESTING_OPEN_ACCESS = 'true'
})
afterAll(() => {
  if (ORIGINAL_TESTING === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
})

describe('WS1 Flow 1: instalment % display', () => {
  it('/mous/[id]/instalments table renders the new % column header', async () => {
    const { default: Page } = await import(
      '../app/mous/[mouId]/installments/page'
    )
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    // The new column header.
    expect(html).toMatch(/<th[^>]*>%<\/th>/)
    // Each row contains a percent-shaped string (e.g. "25%") - sample
    // by greping for the percent suffix in the rendered HTML.
    expect(html).toMatch(/\d+(\.\d+)?%/)
    expect(html).not.toContain('Application error')
  }, 30000)

  it('/mous/[id] right-column Instalments card renders inline (N%) per row', async () => {
    const { default: Page } = await import('../app/mous/[mouId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    // The inline pattern is `(25%)` or `(12.5%)` inside a <span>.
    expect(html).toMatch(/\(\d+(\.\d+)?%\)/)
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('WS2 Flow 2: salesperson reassignment', () => {
  it('school detail header shows the Sales rep line + Reassign CTA when canEditMOU', async () => {
    const { default: Page } = await import('../app/schools/[schoolId]/page')
    // Pick any school from the fixture - use a known production-y id.
    // The test does not depend on a specific id beyond existing-ness.
    // Read schools fixture lazily to find one.
    const schools = (
      await import('../data/schools.json')
    ).default as unknown as { id: string }[]
    expect(schools.length).toBeGreaterThan(0)
    const someSchool = schools[0]!
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ schoolId: someSchool.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="school-sales-rep-line"')
    expect(html).toContain('Sales rep:')
    expect(html).toContain('data-testid="school-reassign-sales-rep-cta"')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('reassign form page renders with current rep + scope buttons + active reps in select', async () => {
    const { default: Page } = await import(
      '../app/schools/[schoolId]/reassign-sales-rep/page'
    )
    const schools = (
      await import('../data/schools.json')
    ).default as unknown as { id: string }[]
    const someSchool = schools[0]!
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ schoolId: someSchool.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="reassign-sales-rep-form"')
    expect(html).toContain('data-testid="current-sales-rep"')
    expect(html).toContain('data-testid="new-sales-rep-select"')
    expect(html).toContain('data-testid="submit-future-only"')
    expect(html).toContain('data-testid="submit-all-mous"')
    expect(html).toContain('Reassign for future MOUs only')
    expect(html).toContain('Reassign all')
    expect(html).not.toContain('Application error')
  }, 30000)
})
