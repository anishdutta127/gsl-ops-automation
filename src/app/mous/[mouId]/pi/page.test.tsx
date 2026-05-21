import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const redirectMock = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

// Gate 2 housekeeping A: most tests assume the route is ACTIVE; toggle
// the parallel-build lock OFF in beforeEach. The lock-on case has its
// own describe block below. MM2 strict-gate cases also need
// TESTING_OPEN_ACCESS=false so the department-scoped redirect fires
// (the testing-open default opens EDIT gates for every active user;
// the redirect is a production-mode invariant).
const ORIGINAL_LOCK = process.env.PI_PARALLEL_BUILD_LOCK
const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeEach(() => {
  vi.clearAllMocks()
  process.env.PI_PARALLEL_BUILD_LOCK = 'false'
  process.env.TESTING_OPEN_ACCESS = 'false'
})

afterEach(() => {
  if (ORIGINAL_LOCK === undefined) {
    delete process.env.PI_PARALLEL_BUILD_LOCK
  } else {
    process.env.PI_PARALLEL_BUILD_LOCK = ORIGINAL_LOCK
  }
  if (ORIGINAL_TESTING === undefined) {
    delete process.env.TESTING_OPEN_ACCESS
  } else {
    process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  }
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('/mous/[mouId]/pi page', () => {
  it('Finance sees the form', async () => {
    getCurrentUserMock.mockResolvedValue(user('Finance', 'shubhangi.g'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('Generate PI')
  })

  it('Phase 6E Finding 2: form field name matches the API field name (instalmentSeq, British spelling)', async () => {
    // Latent typo: the select used name="installmentSeq" (American
    // double-L) but the route at src/app/api/pi/generate/route.ts:42
    // reads form.get('instalmentSeq') (British single-L). Pranav's BIT
    // PI submission failed with "Pick a valid pending instalment from
    // the dropdown and try again." because the API got an empty string,
    // NaN-checked, and 303-redirected with ?error=invalid-instalment-seq.
    // The assertion below is paired with the literal-string read in the
    // route handler so a future rename keeps both sides in sync.
    getCurrentUserMock.mockResolvedValue(user('Finance', 'shubhangi.g'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('name="instalmentSeq"')
    expect(html).not.toContain('name="installmentSeq"')
  })

  it('SalesRep on own MOU redirects with notice (Gate 1 Step 4 MM2)', async () => {
    // Gate 1 Step 4 changes the PI gate from notFound() to a redirect
    // back to the MOU detail page with a ?notice=pi-finance-only param,
    // so the user sees an explanatory toast instead of a bare 404. The
    // canGeneratePI department gate fires (SalesRep has dept='sales',
    // not 'finance').
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('OpsHead redirects with notice (Gate 1 Step 4 MM2)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('OpsEmployee redirects with notice (Gate 1 Step 4 MM2)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsEmployee', 'ops-emp.x'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('Admin role with department=ops redirects (Misba MM2 canonical case)', async () => {
    // The trusted-core-team Admin promotion (2026-04-27) made Misba
    // role=Admin; her MM2 redirect comes from her department='ops'.
    // canGeneratePI sees Admin + non-null department and treats her
    // as department-scoped, not as the cross-functional wildcard.
    const misba: User = {
      ...user('Admin', 'misba.m'),
      department: 'ops',
    }
    getCurrentUserMock.mockResolvedValue(misba)
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('no longer renders the Phase 1 stub note (W4-B.4: stale; API is wired)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).not.toContain('Phase 1 note')
    expect(html).not.toContain('wired in Phase D')
  })

  it('GSTIN missing surfaces an inline note (W4-A.6: no longer a hard block)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-005' }) }),
    )
    expect(html).toContain('data-testid="gstin-missing-note"')
    expect(html).toContain('To be added')
    // Old hard-block alert copy must be gone.
    expect(html).not.toContain('GSTIN required')
    expect(html).not.toContain('Missing; PI blocked')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})

describe('/mous/[mouId]/pi page: parallel-build lock UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows lock banner instead of Generate form when locked (default)', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    getCurrentUserMock.mockResolvedValue(user('Finance', 'shubhangi.g'))
    // Bust module cache so the page re-reads the env var.
    vi.resetModules()
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('data-testid="pi-parallel-build-banner"')
    expect(html).toContain('Locked during parallel-build window')
    expect(html).toContain('gsl-mou-system')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('>Generate PI<')
  })

  it("renders the Generate form when PI_PARALLEL_BUILD_LOCK=false", async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = 'false'
    getCurrentUserMock.mockResolvedValue(user('Finance', 'shubhangi.g'))
    vi.resetModules()
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('>Generate PI<')
    expect(html).not.toContain('data-testid="pi-parallel-build-banner"')
  })
})
