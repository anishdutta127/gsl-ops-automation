/*
 * Gate 3.5 Step 7: Finance dashboard rebuild tests.
 *
 * Asserts the page renders + the three KPI tiles surface with correct
 * test ids + the two attention cards render + the Tally footer line
 * appears with a "never" fallback or a date.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'finance-test',
    name: 'Finance Test',
    email: 'finance@example.test',
    role: 'Finance',
    department: 'finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  })),
}))

describe('FinanceDashboard rebuild (Gate 3.5 Step 7)', () => {
  it('renders the page shell + header', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="finance-dashboard"')
    expect(html).toContain('Finance workspace')
  })

  it('renders the three KPI tiles', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="kpi-outstanding"')
    expect(html).toContain('data-testid="kpi-pis-issued"')
    expect(html).toContain('data-testid="kpi-adjustments"')
  })

  it('renders the two attention cards', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="payments-attention-card"')
    expect(html).toContain('data-testid="pis-awaiting-card"')
  })

  it('renders the Tally export footer CTA', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="tally-export-cta"')
    expect(html).toMatch(/Last Tally export:/)
  })

  it('renders the 4 age buckets on the payments card', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="age-bucket-today"')
    expect(html).toContain('data-testid="age-bucket-1-3-days"')
    expect(html).toContain('data-testid="age-bucket-3-7-days"')
    expect(html).toContain('data-testid="age-bucket--7-days"')
  })
})
