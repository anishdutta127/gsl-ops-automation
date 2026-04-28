/*
 * Page-wiring tests for /admin/inventory/[id] (W4-G.6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookiesMock = vi.fn()
const verifyMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('next/headers', () => ({ cookies: cookiesMock }))

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: verifyMock,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  notFound: notFoundMock,
}))

vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'misba.m', name: 'Misba', email: 'm@x.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'pratik.d', name: 'Pratik', email: 'p@x.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/inventory_items.json', () => ({
  default: [
    {
      id: 'INV-PYTHON', skuName: 'Tinkrpython', category: 'TinkRworks',
      cretileGrade: null, mastersheetSourceName: 'Tinkrpython',
      currentStock: 923, reorderThreshold: 100,
      notes: 'cycle count due Apr-30', active: true,
      lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-w4g-import',
      auditLog: [
        {
          timestamp: '2026-04-26T10:00:00Z', user: 'system-w4g-import',
          action: 'inventory-imported-from-mastersheet',
          before: null, after: { currentStock: 923 },
          notes: 'Imported from Mastersheet',
        },
        {
          timestamp: '2026-04-27T11:00:00Z', user: 'misba.m',
          action: 'inventory-decremented-by-dispatch',
          before: { currentStock: 950 },
          after: { currentStock: 923, dispatchId: 'DSP-MOU-X-i1' },
          notes: 'Decremented 27 unit(s) of Tinkrpython via DSP-MOU-X-i1.',
        },
      ],
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

describe('/admin/inventory/[id] detail', () => {
  it('OpsHead sees the edit form (inventory:edit granted)', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Tinkrpython')
    expect(html).toContain('action="/api/inventory/INV-PYTHON/edit"')
    expect(html).toContain('name="currentStock"')
    expect(html).toContain('name="reorderThreshold"')
    expect(html).toContain('name="active"')
    expect(html).toContain('Save changes')
  })

  it('SalesRep sees read-only fields (no form)', async () => {
    verifyMock.mockResolvedValue({ sub: 'pratik.d', email: 'p@x.test', name: 'Pratik', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Tinkrpython')
    expect(html).not.toContain('action="/api/inventory/INV-PYTHON/edit"')
    expect(html).not.toContain('Save changes')
    expect(html).toContain('923')
  })

  it('renders ?saved=1 confirmation banner', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({ saved: '1' }),
      }),
    )
    expect(html).toContain('Saved.')
  })

  it('renders error banner from ?error= param', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({ error: 'invalid-stock' }),
      }),
    )
    expect(html).toContain('Stock must be a non-negative integer.')
  })

  it('decrement history surfaces recent dispatches', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('DSP-MOU-X-i1')
    expect(html).toContain('Recent dispatch decrements')
    expect(html).toMatch(/Stock\s+950\s*→\s*923/)
  })

  it('full audit log lists every entry', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('inventory-imported-from-mastersheet')
    expect(html).toContain('inventory-decremented-by-dispatch')
  })

  it('item-not-found triggers notFound()', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ id: 'INV-NOPE' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('immutable identity fields render as read-only', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: 'INV-PYTHON' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('These fields are immutable.')
    expect(html).not.toContain('name="skuName"')
    expect(html).not.toContain('name="category"')
    expect(html).not.toContain('name="id"')
  })
})
