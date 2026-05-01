import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => { vi.clearAllMocks() })

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/mous/[mouId]/dispatch page (W4-D.4)', () => {
  it('OpsHead sees the direct-raise form', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('Raise direct dispatch')
    expect(html).toContain('data-testid="direct-raise-section"')
    expect(html).toContain('data-testid="direct-raise-submit"')
  })

  it('direct-raise form has installmentSeq dropdown (W3 form bug fix)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    // Wired: select element + named installmentSeq.
    expect(html).toMatch(/<select[^>]*name="installmentSeq"/)
    expect(html).toMatch(/<option[^>]*value="1"/)
  })

  it('shows existing dispatches list with gate status', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    // MOU-STEAM-2627-001 has DIS-001 (delivered, paid).
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('Existing dispatches')
    expect(html).toContain('gate open')
    expect(html).toContain('data-testid="dispatch-row-DIS-001"')
  })

  it('hides Pending requests section when no DRs are on file for the MOU', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    // MOU-STEAM-2627-002 has no fixture DR.
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-002' }), searchParams: noSp }),
    )
    expect(html).not.toContain('data-testid="pending-requests-section"')
  })

  it('shows Pending requests section when a DR is pending for the MOU', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    // MOU-STEAM-2627-001 has a fixture pending DR (workflow-state-aware Specific C).
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="pending-requests-section"')
    expect(html).toContain('Pending dispatch requests for this MOU')
    expect(html).toContain('/admin/dispatch-requests/DR-MOU-STEAM-2627-001-i1-20260427100000')
  })

  it('shows raisedFrom badge on the existing dispatches list', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    // DIS-001 is raisedFrom=pre-w4d.
    expect(html).toContain('pre-w4d')
  })

  it('?error=gate-locked renders the error banner', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'gate-locked' }),
      }),
    )
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain('Gate is blocked')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('W4-I.4 MM3: kit allocation section + edit + CSV links render', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="kit-allocation-section"')
    expect(html).toContain('data-testid="kit-allocation-edit-link"')
    expect(html).toContain('data-testid="kit-allocation-csv-link"')
    expect(html).toContain('href="/api/mou/MOU-STEAM-2627-001/kit-allocation"')
  })

  it('W4-I.4 MM1: header card surfaces trainer model, students, and location', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('Trainer model')
    expect(html).toContain('Students')
    expect(html).toContain('Location')
  })

  it('?error=wrong-status renders the closed-MOU error banner (W4-I.4 MM1)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'wrong-status' }),
      }),
    )
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain('MOU is closed')
  })

  it('W4-H.4: each existing dispatch row shows Worksheet + Note download links', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }), searchParams: noSp }),
    )
    expect(html).toContain('data-testid="handover-link-DIS-001"')
    expect(html).toContain('href="/api/dispatch/DIS-001/handover-worksheet"')
    expect(html).toContain('aria-label="Download handover worksheet for DIS-001"')
    expect(html).toContain('data-testid="dispatch-note-link-DIS-001"')
    expect(html).toContain('href="/api/dispatch/DIS-001/dispatch-note"')
    expect(html).toContain('aria-label="Download dispatch note for DIS-001"')
  })
})
