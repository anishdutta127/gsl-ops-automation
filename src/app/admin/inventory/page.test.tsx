/*
 * Page-wiring tests for /admin/inventory list (W4-G.6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookiesMock = vi.fn()
const verifyMock = vi.fn()

vi.mock('next/headers', () => ({ cookies: cookiesMock }))

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
    { id: 'anish.d', name: 'Anish', email: 'a@x.test', role: 'Admin', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'misba.m', name: 'Misba', email: 'm@x.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'pratik.d', name: 'Pratik', email: 'p@x.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/inventory_items.json', () => ({
  default: [
    {
      id: 'INV-PYTHON', skuName: 'Tinkrpython', category: 'TinkRworks',
      cretileGrade: null, mastersheetSourceName: 'Tinkrpython',
      currentStock: 923, reorderThreshold: 100, notes: null, active: true,
      lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
    },
    {
      id: 'INV-SYNTH', skuName: 'Tinkrsynth', category: 'TinkRworks',
      cretileGrade: null, mastersheetSourceName: 'Tinkrsynth',
      currentStock: 3, reorderThreshold: null, notes: 'sunset', active: false,
      lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
    },
    {
      id: 'INV-CRETILE-G5', skuName: 'Cretile Grade-band kit', category: 'Cretile',
      cretileGrade: 5, mastersheetSourceName: 'Cretile G5',
      currentStock: 5, reorderThreshold: 10, notes: null, active: true,
      lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
    },
    {
      id: 'INV-MIXER', skuName: 'Mixer PCB', category: 'TinkRworks',
      cretileGrade: null, mastersheetSourceName: null,
      currentStock: 0, reorderThreshold: null,
      notes: null, active: true,
      lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-w4g-import',
      auditLog: [],
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

describe('/admin/inventory list', () => {
  it('Admin sees all active rows + Edit links by default (status=active)', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@x.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('Tinkrpython')
    expect(html).toContain('Cretile Grade-band kit')
    expect(html).not.toContain('Tinkrsynth')
    expect(html).toContain('>Edit<')
  })

  it('SalesRep gets View links (no inventory:edit)', async () => {
    verifyMock.mockResolvedValue({ sub: 'pratik.d', email: 'p@x.test', name: 'Pratik', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('Tinkrpython')
    expect(html).toContain('>View<')
    expect(html).not.toContain('>Edit<')
  })

  it('low-stock SKU renders Low chip + threshold context', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toMatch(/data-testid="inventory-status-INV-CRETILE-G5"[^>]*>Low</)
  })

  it('out-of-stock SKU renders Out chip', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toMatch(/data-testid="inventory-status-INV-MIXER"[^>]*>Out</)
  })

  it('status=sunset filter shows sunset rows only', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ status: 'sunset' }) }),
    )
    expect(html).toContain('Tinkrsynth')
    expect(html).not.toContain('Tinkrpython')
  })

  it('category=Cretile filter shows Cretile rows only', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ category: 'Cretile' }) }),
    )
    expect(html).toContain('Cretile Grade-band kit')
    expect(html).not.toContain('Tinkrpython')
    expect(html).not.toContain('Mixer PCB')
  })

  it('empty filter result shows empty-state copy', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ category: 'Other' }) }),
    )
    expect(html).toContain('No inventory items match the current filters.')
  })

  it('uses CSS variables, no raw hex (DESIGN.md guard)', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toMatch(/style="[^"]*#[0-9a-fA-F]{6}/)
    expect(html).not.toMatch(/style="[^"]*#[0-9a-fA-F]{3}\b/)
  })
})
