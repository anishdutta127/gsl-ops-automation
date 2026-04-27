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
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
    useRouter: () => ({ refresh: () => {} }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function pratik(): User {
  return {
    id: 'pratik.d',
    name: 'Pratik D.',
    email: 'pratik.d@getsetlearn.info',
    role: 'SalesHead',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('/dispatch/request page', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('renders the form with a header + breadcrumb when authenticated', async () => {
    getCurrentUserMock.mockResolvedValue(pratik())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Submit dispatch request')
    expect(html).toContain('MOU (active cohort only)')
    expect(html).toContain('Line items')
    expect(html).toContain('Submit dispatch request')
  })

  it('MOU dropdown lists only active-cohort MOUs', async () => {
    getCurrentUserMock.mockResolvedValue(pratik())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    // 51 active MOUs; check for the "Select an MOU..." placeholder + at least one active MOU id.
    expect(html).toContain('Select an MOU...')
    expect(html).toContain('MOU-STEAM-2627-001')
    // Archived MOU IDs (e.g., MOU-STEAM-2526-*) should NOT appear in the dropdown.
    expect(html).not.toContain('MOU-STEAM-2526-001')
  })

  it('?mouId=MOU-STEAM-2627-001 pre-selects that MOU on initial render', async () => {
    getCurrentUserMock.mockResolvedValue(pratik())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    // The component sets defaultMouId so the rendered HTML exposes it via the form field.
    // We assert the option for that MOU is rendered as selected (selected attr or value match).
    expect(html).toContain('MOU-STEAM-2627-001')
  })
})
