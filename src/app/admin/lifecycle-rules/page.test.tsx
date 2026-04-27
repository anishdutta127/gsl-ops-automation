import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

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

describe('/admin/lifecycle-rules', () => {
  it('renders all 7 rule rows with from-stage / to-stage labels and current defaultDays', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="rule-mou-signed"')
    expect(html).toContain('data-testid="rule-actuals-confirmed"')
    expect(html).toContain('data-testid="rule-invoice-raised"')
    expect(html).toContain('data-testid="rule-payment-received"')
    expect(html).toContain('data-testid="rule-kit-dispatched"')
    expect(html).toContain('data-testid="rule-delivery-acknowledged"')
    expect(html).toContain('data-testid="rule-feedback-submitted"')
    expect(html).toContain('MOU signed')
    expect(html).toContain('Actuals confirmed')
    expect(html).toContain('MOU closed')
    expect(html).toContain('14 days')
    expect(html).toContain('30 days')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Lifecycle rules')
    expect(html).toContain('data-testid="rule-mou-signed-form"')
  })

  it('header copy explains retroactive recompute semantic', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('retroactively recomputes overdue badges')
    expect(html).toContain('audit log records')
  })

  it('?saved=<stage> surfaces a green flash referencing the saved rule', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ saved: 'invoice-raised' }) }),
    )
    expect(html).toContain('data-testid="rules-saved-flash"')
    expect(html).toContain('Invoice raised')
  })

  it('?error=invalid-days&stage=<key> surfaces inline error on the right rule row only', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'invalid-days', stage: 'invoice-raised' }) }),
    )
    expect(html).toContain('data-testid="rule-invoice-raised-error"')
    expect(html).toContain('Default days must be a whole number')
    // Other rules do NOT carry the error
    expect(html).not.toContain('data-testid="rule-mou-signed-error"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
