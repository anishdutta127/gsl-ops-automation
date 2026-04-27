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
function rep(): User {
  return {
    id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/mous/[id]/payment-receipt', () => {
  it('renders the form with instalment dropdown + 4 inputs (date / amount / mode / reference)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="payment-receipt-form"')
    expect(html).toContain('data-testid="payment-instalment-select"')
    expect(html).toContain('data-testid="payment-date-input"')
    expect(html).toContain('data-testid="payment-amount-input"')
    expect(html).toContain('data-testid="payment-mode-select"')
    expect(html).toContain('data-testid="payment-reference-input"')
    expect(html).toContain('data-testid="payment-submit"')
    expect(html).toContain('action="/api/payment/record"')
  })

  it('breadcrumb links back to MOU detail page', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('href="/mous/MOU-STEAM-2526-002"')
  })

  it('SalesRep accessing a MOU not assigned to them gets notFound', async () => {
    getCurrentUserMock.mockResolvedValue(rep())
    const { default: Page } = await import('./page')
    // notFound() throws NEXT_NOT_FOUND inside Server Components
    await expect(
      Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow()
  })

  it('?error=permission renders the role-gate error flash', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({ error: 'permission' }),
      }),
    )
    expect(html).toContain('data-testid="payment-error-flash"')
    expect(html).toContain('Recording a payment receipt requires the Finance role')
  })

  it('?recorded=<id> renders the success flash', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({ recorded: 'MOU-STEAM-2627-001-i1' }),
      }),
    )
    expect(html).toContain('data-testid="payment-recorded-flash"')
    expect(html).toContain('Payment recorded')
  })

  it('?recorded + ?variance surfaces the variance amount in the flash', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({
          recorded: 'MOU-STEAM-2627-001-i1',
          variance: '-50000',
        }),
      }),
    )
    expect(html).toContain('Variance Rs')
    expect(html).toContain('-50,000')
  })

  it('payment mode dropdown lists all 7 modes', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({}),
      }),
    )
    for (const mode of ['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Zoho', 'Razorpay', 'Other']) {
      expect(html).toContain(`>${mode}<`)
    }
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2526-002' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
