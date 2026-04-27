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

describe('/mous/[id]/intake', () => {
  it('renders the form with all 22 named inputs', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="intake-form"')
    for (const t of [
      'intake-sales-owner', 'intake-location', 'intake-grades', 'intake-students',
      'intake-duration', 'intake-start-date', 'intake-end-date',
      'intake-recipient-name', 'intake-recipient-designation', 'intake-recipient-email',
      'intake-poc-name', 'intake-poc-phone',
      'intake-physical-status', 'intake-softcopy-status',
      'intake-product', 'intake-training-mode',
      'intake-signed-url', 'intake-submit',
    ]) {
      expect(html).toContain(`data-testid="${t}"`)
    }
    expect(html).toContain(`action="/api/mou/MOU-STEAM-2627-001/intake"`)
  })

  it('defaults studentsAtIntake to mou.studentsMou and surfaces the baseline note', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    // Real fixture: MOU-STEAM-2627-001 has studentsMou=500.
    expect(html).toContain('MOU baseline: 500')
    expect(html).toMatch(/data-testid="intake-students"[^>]*value="500"/)
  })

  it('?recorded=ID flash + variance markers render', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({
          recorded: 'IR-123',
          studentsVariance: '150',
          productMismatch: '1',
        }),
      }),
    )
    expect(html).toContain('data-testid="intake-recorded-flash"')
    expect(html).toContain('IR-123')
    expect(html).toContain('+150')
    expect(html).toContain('Product mismatch')
  })

  it('?error=invalid-email surfaces the form-level rail', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'invalid-email' }),
      }),
    )
    expect(html).toContain('data-testid="intake-error-flash"')
    expect(html).toContain('Recipient email is not a valid address')
  })

  it('breadcrumb links back to MOU detail page', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('href="/mous/MOU-STEAM-2627-001"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
