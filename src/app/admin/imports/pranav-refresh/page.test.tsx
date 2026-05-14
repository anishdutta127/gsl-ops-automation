/*
 * Page-wiring tests for /admin/imports/pranav-refresh (Gate 5A.8 Step 4).
 *
 * Three concerns:
 *  - Admin role gate: non-Admin users redirect to /dashboard.
 *  - No-diff state: the upload form renders alone with a clear placeholder.
 *  - Diff loaded: tabs render with counts; the active tab lists its rows.
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
  ],
}))

const findLatestMock = vi.fn()
vi.mock('./actions', () => ({
  uploadRefreshAction: vi.fn(),
  applyRefreshAction: vi.fn(),
  findLatestRefreshTag: findLatestMock,
}))

const fsMock = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    default: { ...(actual.default as object), readFile: fsMock.readFile },
    readFile: fsMock.readFile,
  }
})

const sampleDiffJson = JSON.stringify({
  generatedAt: '2026-05-14T02:27:45.209Z',
  summary: { NEW: 1, UPDATE: 1, UNCHANGED: 0, CONFLICT: 1, AMBIGUOUS: 0 },
  classified: [
    {
      classification: 'NEW',
      refreshRow: {
        rowNum: 9,
        srNo: 3,
        schoolName: 'Vijaya English Primary School',
        schoolSlug: 'vijaya-english-primary-school',
        acquisitionStatus: 'New',
        salesRepName: 'Balachandra',
        physicalCopyScanned: false,
        mouSigned: false,
        kitsSent: null,
        modelRaw: 'GSL-T',
        trainerModel: 'GSL-T',
        duration: { start: '2026-04-01', end: '2027-03-31', fallback: false },
        city: 'Bengaluru',
        state: 'Karnataka',
        studentsMou: 250,
        contractValue: 375000,
        studentsActual: null,
        spWithoutTax: null,
        spWithTax: null,
        received: null,
        tds: null,
        installments: [],
        needsReview: false,
        isContinuationRow: false,
        productLineKey: 'GSL-T|250|375000',
        rowWarnings: [],
      },
      matchedMouId: null,
      candidateMatchIds: [],
      mouDiffs: [],
      installmentDiffs: [],
    },
    {
      classification: 'UPDATE',
      refreshRow: {
        rowNum: 10,
        srNo: 4,
        schoolName: 'Existing School',
        schoolSlug: 'existing-school',
        acquisitionStatus: 'Renewal',
        salesRepName: 'Balachandra',
        physicalCopyScanned: true,
        mouSigned: true,
        kitsSent: null,
        modelRaw: 'TT',
        trainerModel: 'TT',
        duration: { start: '2026-04-01', end: '2027-03-31', fallback: false },
        city: 'Bengaluru',
        state: 'Karnataka',
        studentsMou: 200,
        contractValue: 200000,
        studentsActual: null,
        spWithoutTax: null,
        spWithTax: null,
        received: 50000,
        tds: null,
        installments: [],
        needsReview: false,
        isContinuationRow: false,
        productLineKey: 'TT|200|200000',
        rowWarnings: [],
      },
      matchedMouId: 'MOU-STEAM-2627-099',
      candidateMatchIds: ['MOU-STEAM-2627-099'],
      mouDiffs: [
        { field: 'studentsMou', current: 0, refresh: 200, kind: 'fill' },
      ],
      installmentDiffs: [],
    },
    {
      classification: 'CONFLICT',
      refreshRow: {
        rowNum: 11,
        srNo: 5,
        schoolName: 'Conflict School',
        schoolSlug: 'conflict-school',
        acquisitionStatus: 'New',
        salesRepName: 'Balachandra',
        physicalCopyScanned: true,
        mouSigned: true,
        kitsSent: null,
        modelRaw: 'TT',
        trainerModel: 'TT',
        duration: { start: '2026-04-01', end: '2027-03-31', fallback: false },
        city: 'Pune',
        state: 'Maharashtra',
        studentsMou: 150,
        contractValue: 300000,
        studentsActual: 100,
        spWithoutTax: null,
        spWithTax: null,
        received: 50000,
        tds: 0,
        installments: [],
        needsReview: false,
        isContinuationRow: false,
        productLineKey: 'TT|150|300000',
        rowWarnings: [],
      },
      matchedMouId: 'MOU-STEAM-2627-100',
      candidateMatchIds: ['MOU-STEAM-2627-100'],
      mouDiffs: [
        { field: 'studentsActual', current: 400, refresh: 100, kind: 'overwrite' },
      ],
      installmentDiffs: [],
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
  findLatestMock.mockResolvedValue(null)
  fsMock.readFile.mockImplementation(async (p: string) => {
    if (p.endsWith('diff-report.json')) return sampleDiffJson
    throw new Error('unexpected read: ' + p)
  })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/imports/pranav-refresh', () => {
  it('renders the upload form when no diff exists', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    findLatestMock.mockResolvedValue(null)
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Upload a refresh file')
    expect(html).toContain('No diff loaded')
    expect(html).toContain('accept=".xlsx,.xlsm"')
  })

  it('renders tabbed view with correct counts when a diff exists', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    findLatestMock.mockResolvedValue('pranav-refresh-2026-05-14')
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Diff classification')
    expect(html).toContain('Vijaya English Primary School')
    // Active tab is 'new' by default; counts render on tab labels.
    expect(html).toMatch(/New\s*<span[^>]*>1<\/span>/)
    expect(html).toMatch(/Updates\s*<span[^>]*>1<\/span>/)
    expect(html).toMatch(/Conflicts\s*<span[^>]*>1<\/span>/)
  })

  it('switching to conflicts tab renders conflict resolution radios', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    findLatestMock.mockResolvedValue('pranav-refresh-2026-05-14')
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ tab: 'conflicts' }) }),
    )
    expect(html).toContain('Conflict School')
    expect(html).toContain('Keep current values')
    expect(html).toContain('Apply refresh values')
    expect(html).toContain('Keep both as separate MOUs')
    expect(html).toContain('name="resolution-11"')
  })

  it('non-Admin users are redirected', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/REDIRECT:\/dashboard/)
  })

  it('unauthenticated users redirect to /login with next preserved', async () => {
    verifyMock.mockResolvedValue(null)
    const Page = await loadPage()
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/REDIRECT:\/login\?next=/)
  })
})
