/*
 * Page-wiring tests for /admin/mou-import-review (Phase C5a-2).
 *
 * Concerns:
 *  - Role gate (Admin or OpsHead, others redirected)
 *  - Quarantined items render with reject form (action + hidden fields)
 *  - Import button is present but disabled with the Phase D note
 *  - Resolved items render in the resolved section
 *  - error param surfaces a friendly message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookiesMock = vi.fn()
const verifyMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: verifyMock,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/mou_import_review.json', () => ({
  default: [
    {
      queuedAt: '2026-04-22T13:45:00Z',
      rawRecord: { id: 'MOU-VEX-2627-XX1', schoolName: 'Stonebridge Academy', programme: 'VEX' },
      validationFailed: 'tax_inversion',
      quarantineReason: 'Tax-inverted pricing',
      candidates: null,
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      rejectionReason: null,
      rejectionNotes: null,
    },
    {
      queuedAt: '2026-04-21T10:00:00Z',
      rawRecord: { id: 'MOU-OLD-2526-002', schoolName: 'OldSchool', programme: 'STEAM' },
      validationFailed: null,
      quarantineReason: 'Already imported',
      candidates: null,
      resolvedAt: '2026-04-23T11:00:00Z',
      resolvedBy: 'misba.m',
      resolution: 'rejected',
      rejectionReason: 'duplicate-of-existing',
      rejectionNotes: null,
    },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/mou-import-review', () => {
  it('OpsHead sees unresolved + resolved sections with the right counts', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('1 unresolved, 1 resolved')
    expect(html).toContain('MOU-VEX-2627-XX1')
    expect(html).toContain('Stonebridge Academy')
    expect(html).toContain('Tax-inverted pricing')
  })

  it('quarantined item renders the Reject form with hidden fields + reason select', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('action="/api/mou/import-review/reject"')
    expect(html).toContain('name="queuedAt" value="2026-04-22T13:45:00Z"')
    expect(html).toContain('name="rawRecordId" value="MOU-VEX-2627-XX1"')
    expect(html).toContain('name="rejectionReason"')
    expect(html).toContain('value="data-quality-issue"')
    expect(html).toContain('value="other"')
  })

  it('Import button is present but disabled with Phase D note', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Import (wired in Phase D)')
    expect(html).toContain('school-groups')
    expect(html).toContain('aria-disabled="true"')
  })

  it('resolved section displays rejected item with reason', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('MOU-OLD-2526-002')
    expect(html).toContain('rejected')
    expect(html).toContain('duplicate-of-existing')
  })

  it('error=notes-required surfaces a friendly message', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'notes-required' }) }),
    )
    expect(html).toContain('Notes are required')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('MOU-VEX-2627-XX1')
  })
})
