/*
 * Page-wiring tests for /admin/pi-counter (Phase C5a-2).
 *
 * Concerns:
 *  - Role gate (Admin or OpsHead, others redirected)
 *  - Counter values render: prefix, fiscalYear, next, formatted next PI
 *  - Monotonicity OK indicator renders for strictly increasing seqs
 *  - Monotonicity violation indicator renders for duplicates
 *  - Last-issued PI section reflects latest queuedAt
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

vi.mock('@/data/pi_counter.json', () => ({
  default: { fiscalYear: '26-27', next: 6, prefix: 'GSL/OPS' },
}))

const mockComms = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/data/communications.json', () => ({
  get default() {
    return mockComms.value
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
  verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/pi-counter', () => {
  it('renders the next PI number formatted from prefix/fiscalYear/seq', async () => {
    mockComms.value = []
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('GSL/OPS/26-27/0006')
    expect(html).toContain('Counter 6')
  })

  it('monotonicity OK with strictly increasing seqs (gaps allowed)', async () => {
    mockComms.value = [
      {
        id: 'COM-1', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0001',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-15T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
      {
        id: 'COM-5', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0005',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-20T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
    ]
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('OK')
    expect(html).toContain('2 issued')
    expect(html).toContain('Highest seq 5')
  })

  it('monotonicity violation when a duplicate seq appears', async () => {
    mockComms.value = [
      {
        id: 'COM-1', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0001',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-15T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
      {
        id: 'COM-1-DUP', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0001',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-16T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
    ]
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Violation')
    expect(html).toContain('COM-1-DUP')
  })

  it('last-issued PI section reflects the most recent queuedAt', async () => {
    mockComms.value = [
      {
        id: 'COM-OLD', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0001',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-10T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
      {
        id: 'COM-NEW', type: 'pi-sent', schoolId: 'X', mouId: 'X',
        installmentSeq: 1, channel: 'email',
        subject: 'PI GSL/OPS/26-27/0005',
        bodyEmail: null, bodyWhatsApp: null,
        toEmail: null, toPhone: null, ccEmails: [],
        queuedAt: '2026-04-20T10:00:00Z', queuedBy: 's',
        sentAt: null, copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
    ]
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('PI GSL/OPS/26-27/0005')
    expect(html).toContain('Queued 2026-04-20')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    mockComms.value = []
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('GSL/OPS/26-27/0006')
  })
})
