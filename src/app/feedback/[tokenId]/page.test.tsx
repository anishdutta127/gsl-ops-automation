/*
 * /feedback/[tokenId] page-wiring tests (Phase C6).
 *
 * Verifies HMAC-gated redirect logic. Uses real signMagicLink with a
 * test signing key so the verification round-trip is genuinely
 * exercised on the pass path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const TEST_KEY = 'unit-test-magic-link-key-32-bytes-of-entropy'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

const mockTokens = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/data/magic_link_tokens.json', () => ({
  get default() { return mockTokens.value },
}))

vi.mock('@/data/mous.json', () => ({
  default: [
    {
      id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Greenfield Academy',
      programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
      schoolGroupId: null, status: 'Active', academicYear: '2026-27',
      startDate: '2026-04-01', endDate: '2027-03-31',
      studentsMou: 200, studentsActual: null, studentsVariance: null,
      studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
      contractValue: 1000000, received: 0, tds: 0, balance: 1000000,
      receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
      salesPersonId: null, templateVersion: null, generatedAt: null,
      notes: null, daysToExpiry: null, auditLog: [],
    },
  ],
}))

import { signMagicLink } from '@/lib/magicLink'

const validToken = {
  id: 'MLT-FB-001',
  purpose: 'feedback-submit' as const,
  mouId: 'MOU-X',
  installmentSeq: 1,
  spocEmail: 'spoc@example.test',
  issuedAt: '2026-04-25T10:00:00Z',
  expiresAt: '2099-04-27T10:00:00Z',
  usedAt: null, usedByIp: null, lastViewedAt: null, viewCount: 0,
  communicationId: 'COM-X',
}

let originalKey: string | undefined

beforeAll(() => {
  originalKey = process.env.GSL_SNAPSHOT_SIGNING_KEY
  process.env.GSL_SNAPSHOT_SIGNING_KEY = TEST_KEY
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.GSL_SNAPSHOT_SIGNING_KEY
  else process.env.GSL_SNAPSHOT_SIGNING_KEY = originalKey
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockTokens.value = [validToken]
})

async function loadPage() {
  return (await import('./page')).default
}

function validHmac(): string {
  return signMagicLink({
    purpose: validToken.purpose,
    mouId: validToken.mouId,
    installmentSeq: validToken.installmentSeq,
    spocEmail: validToken.spocEmail,
    issuedAt: validToken.issuedAt,
  })
}

describe('/feedback/[tokenId] page', () => {
  it('renders the form when HMAC verifies and token is fresh', async () => {
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    )
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('STEAM')
    expect(html).toContain('Instalment 1')
    expect(html).toContain('spoc@example.test')
    expect(html).toContain('Submit feedback')
  })

  it('redirects to /feedback/link-expired when HMAC missing', async () => {
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })

  it('redirects to link-expired when HMAC tampered', async () => {
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({ h: '0'.repeat(64) }),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })

  it('redirects to link-expired when token expired', async () => {
    mockTokens.value = [{ ...validToken, expiresAt: '2020-01-01T00:00:00Z' }]
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })

  it('redirects to link-expired when token already used', async () => {
    mockTokens.value = [{ ...validToken, usedAt: '2026-04-26T00:00:00Z' }]
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })

  it('redirects to link-expired when token unknown', async () => {
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-DOES-NOT-EXIST' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })

  it('redirects to link-expired when token purpose is status-view (wrong route)', async () => {
    mockTokens.value = [{ ...validToken, purpose: 'status-view' }]
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-FB-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/feedback/link-expired')
  })
})
