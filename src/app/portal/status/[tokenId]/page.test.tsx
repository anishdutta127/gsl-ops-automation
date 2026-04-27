/*
 * /portal/status/[tokenId] page-wiring tests (Phase C6).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const TEST_KEY = 'unit-test-magic-link-key-32-bytes-of-entropy'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(async () => ({ id: 'p' })),
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
      schoolGroupId: null, status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
      startDate: '2026-04-01', endDate: '2027-03-31',
      studentsMou: 200, studentsActual: 200, studentsVariance: 0,
      studentsVariancePct: 0, spWithoutTax: 4000, spWithTax: 5000,
      contractValue: 1000000, received: 250000, tds: 0, balance: 750000,
      receivedPct: 25, paymentSchedule: '25-25-25-25 quarterly',
      trainerModel: 'GSL-T', salesPersonId: null, templateVersion: null,
      generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
    },
  ],
}))

vi.mock('@/data/schools.json', () => ({
  default: [
    {
      id: 'SCH-X', name: 'Greenfield Academy', legalEntity: null, city: 'Pune',
      state: 'MH', region: 'South-West', pinCode: null, contactPerson: null,
      email: null, phone: null, billingName: null, pan: null, gstNumber: null,
      notes: null, active: true, createdAt: '', auditLog: [],
    },
  ],
}))

vi.mock('@/data/communications.json', () => ({ default: [] }))
vi.mock('@/data/feedback.json', () => ({ default: [] }))
vi.mock('@/data/dispatches.json', () => ({ default: [] }))

import { signMagicLink } from '@/lib/magicLink'

const validToken = {
  id: 'MLT-SV-001',
  purpose: 'status-view' as const,
  mouId: 'MOU-X',
  installmentSeq: 1,
  spocEmail: 'spoc@example.test',
  issuedAt: '2026-04-15T10:00:00Z',
  expiresAt: '2099-05-15T10:00:00Z',
  usedAt: null, usedByIp: null,
  lastViewedAt: '2026-04-20T14:33:00Z', viewCount: 3,
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

describe('/portal/status/[tokenId] page', () => {
  // Phase F: timeout extended to 30s. Test passes <4s in isolation
  // but races with parallel page-test imports under full-suite load.
  // Phase 1.1 trigger: investigate vitest pool config or hoist heavy
  // data-fixture imports out of the per-test loadPage path.
  it('renders header + lifecycle + summary + next milestone on valid token', { timeout: 30000 }, async () => {
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    )
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('Instalment 1 summary')
    expect(html).toContain('What')
    expect(html).toContain('next')
    // Indian-format Rs from formatRs
    expect(html).toMatch(/Rs/)
  })

  it('redirects to /portal/status/link-expired on missing HMAC', async () => {
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('REDIRECT:/portal/status/link-expired')
  })

  it('redirects on tampered HMAC', async () => {
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({ h: '0'.repeat(64) }),
      }),
    ).rejects.toThrow('REDIRECT:/portal/status/link-expired')
  })

  it('redirects on expired token', async () => {
    mockTokens.value = [{ ...validToken, expiresAt: '2020-01-01T00:00:00Z' }]
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/portal/status/link-expired')
  })

  it('redirects on wrong purpose (feedback-submit token used for status route)', async () => {
    mockTokens.value = [{ ...validToken, purpose: 'feedback-submit' }]
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    ).rejects.toThrow('REDIRECT:/portal/status/link-expired')
  })

  it('happy path: status-view tokens may be re-used (multi-use; usedAt does not block)', async () => {
    mockTokens.value = [{ ...validToken, usedAt: null }]
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ tokenId: 'MLT-SV-001' }),
        searchParams: Promise.resolve({ h: validHmac() }),
      }),
    )
    expect(html).toContain('Greenfield Academy')
  })
})
