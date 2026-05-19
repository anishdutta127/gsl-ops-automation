import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeEach(() => {
  vi.clearAllMocks()
  process.env.TESTING_OPEN_ACCESS = 'true'
})
afterEach(() => {
  if (ORIGINAL_TESTING === undefined) {
    delete process.env.TESTING_OPEN_ACCESS
  } else {
    process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  }
})

function user(role: User['role'], department: User['department'] = null, id = 'u'): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    role,
    department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('/mous/new/[templateId] page', () => {
  it(
    'renders the wizard for a canEditMOU user against the live sales_team data',
    { timeout: 30000 },
    async () => {
      // Regression guard for the 2026-05-19 hotfix: pranavApply previously
      // auto-created SalesPerson records without `programmes`, and the
      // GeneratorWizard crashed on `sp.programmes.length`. The wizard now
      // null-safes that field; this test renders against the real data so
      // any future partial-record drift surfaces here too.
      getCurrentUserMock.mockResolvedValue(user('Admin', null, 'anish.d'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({
          params: Promise.resolve({ templateId: 'STEAM-v3' }),
          searchParams: Promise.resolve({}),
        }),
      )
      expect(html).toContain('Effective date')
      expect(html).not.toContain('Application error')
    },
  )

  it(
    'renders the wizard when sales_team includes records with no programmes field',
    { timeout: 30000 },
    async () => {
      // The two records sp-brij-singh and sp-kranthi were the trigger.
      // After backfill they carry `programmes: []`; this test renders
      // with that data and checks the rep dropdown contains them
      // (an empty programmes list is treated as "covers every programme").
      getCurrentUserMock.mockResolvedValue(user('Admin', null, 'anish.d'))
      const { default: Page } = await import('./page')
      const html = renderToStaticMarkup(
        await Page({
          params: Promise.resolve({ templateId: 'STEAM-v3' }),
          searchParams: Promise.resolve({}),
        }),
      )
      expect(html).toContain('Brij Singh')
      expect(html).toContain('Kranthi')
    },
  )

  it(
    'redirects to notFound when user lacks canEditMOU (production strict mode)',
    { timeout: 30000 },
    async () => {
      process.env.TESTING_OPEN_ACCESS = 'false'
      getCurrentUserMock.mockResolvedValue(user('OpsEmployee', 'ops', 'misba.m'))
      const { default: Page } = await import('./page')
      await expect(
        Page({
          params: Promise.resolve({ templateId: 'STEAM-v3' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND')
    },
  )
})
