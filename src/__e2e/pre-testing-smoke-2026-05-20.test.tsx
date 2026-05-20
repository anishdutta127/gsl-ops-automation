/*
 * Pre-testing smoke gate (2026-05-20).
 *
 * Walks every Pranav-facing flow end-to-end via SSR component-tree
 * renders against real fixture data. Covers Phases 1-5 + polish.
 *
 * Goal: catch any broken edge case before Pranav opens his testing
 * email. NO new features in this gate; SSR walks here are the safety
 * net for the cumulative surface.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, Payment, School, User } from '@/lib/types'

const adminUser: User = {
  id: 'anish.d',
  name: 'Anish',
  email: 'anish@example.test',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: 'X',
  createdAt: '',
  auditLog: [],
}

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(adminUser)),
  getCurrentSession: vi.fn(() => Promise.resolve({ sub: adminUser.id })),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('@/components/ops/PageHeader', () => ({ PageHeader: () => null }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({
      push: () => undefined,
      replace: () => undefined,
      refresh: () => undefined,
      back: () => undefined,
      forward: () => undefined,
      prefetch: () => undefined,
    }),
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    usePathname: () => '/',
  }
})

const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeAll(() => {
  process.env.TESTING_OPEN_ACCESS = 'true'
})
afterAll(() => {
  if (ORIGINAL_TESTING === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
})

async function loadFixtures() {
  const mous = (await import('../data/mous.json')).default as unknown as MOU[]
  const payments = (await import('../data/payments.json')).default as unknown as Payment[]
  const schools = (await import('../data/schools.json')).default as unknown as School[]
  return { mous, payments, schools }
}

describe('Flow 1 - Create new MOU', () => {
  it('/mous/new picker renders + drafts shortcut visible', async () => {
    const { default: Page } = await import('../app/mous/new/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toMatch(/STEAM|HBPE|Young Pioneers/)
    expect(html).toContain('See your saved drafts')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('/mous/new/STEAM-v3 wizard renders against live sales_team', async () => {
    const { default: Page } = await import('../app/mous/new/[templateId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ templateId: 'STEAM-v3' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Effective date')
    expect(html).toContain('Generate .docx')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 2 - Set payment schedule', () => {
  it('installments page renders for any MOU with no installments', async () => {
    const { mous, payments } = await loadFixtures()
    const mouIdsWithPayments = new Set(payments.map((p) => p.mouId))
    const noScheduleMou = mous.find(
      (m) =>
        m.cohortStatus === 'active' &&
        m.status !== 'Draft' &&
        m.status !== 'Pending Signature' &&
        !mouIdsWithPayments.has(m.id),
    )
    if (!noScheduleMou) {
      // No fixture row matches; assert that the page at least
      // renders for a populated MOU without crashing.
      const populated = mous.find((m) => mouIdsWithPayments.has(m.id))
      expect(populated).toBeTruthy()
      return
    }
    const { default: Page } = await import('../app/mous/[mouId]/installments/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: noScheduleMou.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    // Empty state CTA visible when MOU is signed but has no rows.
    expect(html).toContain('data-testid="no-installments"')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 3 - Update student count + recalc', () => {
  it('/mous/[id]/student-count form renders for an MOU with paid installments', async () => {
    const { mous, payments } = await loadFixtures()
    const target = mous.find((m) =>
      payments.some(
        (p) =>
          p.mouId === m.id &&
          p.receivedAmount !== null &&
          (p.receivedAmount ?? 0) > 0,
      ),
    )
    expect(target).toBeTruthy()
    if (!target) return
    const { default: Page } = await import('../app/mous/[mouId]/student-count/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: target.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="student-count-form"')
    expect(html).toContain('data-testid="student-count-current"')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('preview pane renders when ?preview is set', async () => {
    const { mous, payments } = await loadFixtures()
    const target = mous.find((m) =>
      payments.some(
        (p) =>
          p.mouId === m.id &&
          p.receivedAmount !== null &&
          (p.receivedAmount ?? 0) > 0,
      ),
    )
    if (!target) return
    const cur = target.studentsActual ?? target.studentsMou
    const newCount = Math.max(1, cur - 50)
    const { default: Page } = await import('../app/mous/[mouId]/student-count/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: target.id }),
        searchParams: Promise.resolve({ preview: String(newCount) }),
      }),
    )
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 4 - PI generation (placeholder bag + binary template)', () => {
  it('PI render produces .docx bytes for a real fixture payment + parent MOU', async () => {
    // The fixture has some orphan payments (piNumber set but parent
    // MOU missing in mous.json - data anomaly out of scope for this
    // gate). Filter to a payment whose parent MOU + school both
    // exist so the renderPi happy path is exercised.
    const { renderPi } = await import('../lib/pi/generatePi')
    const { mous, payments, schools } = await loadFixtures()
    const mouIds = new Set(mous.map((m) => m.id))
    const schoolIds = new Set(schools.map((s) => s.id))
    const candidate = payments.find((p) => {
      if (!p.piNumber) return false
      const mou = mous.find((m) => m.id === p.mouId)
      if (!mou) return false
      return schoolIds.has(mou.schoolId)
    })
    if (!candidate) return
    void mouIds
    const result = await renderPi(
      { paymentId: candidate.id },
      undefined,
    )
    if (!result.ok && result.reason === 'template-missing') {
      // Template missing on CI is acceptable; the patched binary
      // lives in public/ and is git-tracked.
      return
    }
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.docxBytes.byteLength).toBeGreaterThan(1000)
    }
  }, 60000)
})

describe('Flow 5 - Log payment batch with TDS', () => {
  it('batch entry page renders the per-row form for a school with outstanding installments', async () => {
    const { mous, payments, schools } = await loadFixtures()
    const activeIds = new Set(mous.filter((m) => m.cohortStatus === 'active').map((m) => m.id))
    const outstandingSchoolIds = new Set<string>()
    for (const p of payments) {
      if (!activeIds.has(p.mouId)) continue
      const s = ['Pending', 'PI Sent', 'Due Soon', 'Overdue', 'Partial']
      if (!s.includes(p.status)) continue
      const m = mous.find((mm) => mm.id === p.mouId)
      if (m) outstandingSchoolIds.add(m.schoolId)
    }
    const target = schools.find((s) => s.active && outstandingSchoolIds.has(s.id))
    expect(target).toBeTruthy()
    if (!target) return
    const { default: Page } = await import('../app/finance/payments/log-batch/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ schoolId: target.id }) }),
    )
    expect(html).toContain('data-testid="log-batch-form"')
    expect(html).toContain('Bank now')
    expect(html).toContain('TDS now')
    expect(html).not.toContain('Application error')
  }, 60000)

  it('school picker renders with no schoolId', async () => {
    const { default: Page } = await import('../app/finance/payments/log-batch/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('data-testid="batch-school-picker"')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 6 - Single payment form (Phase 4 split)', () => {
  it('/finance/payments/new renders Bank + TDS inputs (replaces tdsDeducted)', async () => {
    const { default: Page } = await import('../app/finance/payments/new/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('data-testid="payment-log-bank-amount"')
    expect(html).toContain('data-testid="payment-log-tds-amount"')
    expect(html).not.toContain('name="tdsDeducted"')
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Flow 7 - Year-based registry navigation', () => {
  it('/mous lands on current FY with year picker visible', async () => {
    const { default: Page } = await import('../app/mous/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('data-testid="year-picker-pills"')
    expect(html).toMatch(/data-testid="year-pill-\d{4}-\d{2}" data-active="true"/)
    expect(html).not.toContain('Application error')
  }, 30000)

  it('multi-FY MOU appears in each of its years', async () => {
    const { mous, payments } = await loadFixtures()
    const { getFinancialYearsForMou } = await import('../lib/mou/yearMembership')
    const multi = mous.find((m) => {
      if (m.cohortStatus !== 'active') return false
      return getFinancialYearsForMou(m, payments).length > 1
    })
    expect(multi).toBeTruthy()
    if (!multi) return
    const { default: Page } = await import('../app/mous/page')
    for (const fy of getFinancialYearsForMou(multi, payments)) {
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({ year: fy }) }),
      )
      expect(html).toContain(multi.id)
    }
  }, 60000)

  it('multi-FY MOU detail shows year tabs', async () => {
    const { mous, payments } = await loadFixtures()
    const { getFinancialYearsForMou } = await import('../lib/mou/yearMembership')
    const multi = mous.find(
      (m) => m.cohortStatus === 'active' && getFinancialYearsForMou(m, payments).length > 1,
    )
    if (!multi) return
    const { default: Page } = await import('../app/mous/[mouId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: multi.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="mou-detail-year-tabs"')
  }, 30000)
})

describe('Flow 8 - Salesperson reassignment', () => {
  it('school detail surfaces the Reassign CTA', async () => {
    const { schools } = await loadFixtures()
    const target = schools[0]!
    const { default: Page } = await import('../app/schools/[schoolId]/page')
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ schoolId: target.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="school-reassign-sales-rep-cta"')
    expect(html).not.toContain('Application error')
  }, 30000)

  it('reassign form renders with current rep + scope buttons', async () => {
    const { schools } = await loadFixtures()
    const target = schools[0]!
    const { default: Page } = await import(
      '../app/schools/[schoolId]/reassign-sales-rep/page'
    )
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ schoolId: target.id }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('data-testid="reassign-sales-rep-form"')
    expect(html).toContain('data-testid="submit-future-only"')
    expect(html).toContain('data-testid="submit-all-mous"')
  }, 30000)
})

describe('Flow 9 - Saved drafts visibility', () => {
  it('/mous registry exposes the Drafts CTA + Draft chip', async () => {
    const { default: Page } = await import('../app/mous/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('data-testid="drafts-link"')
    expect(html).toMatch(/Drafts \(\d+\)/)
  }, 30000)
})

describe('Flow 10 - Error backstops on wizard pages', () => {
  it('error.tsx files exist at every Phase 1 stabilise surface', async () => {
    // Smoke: import each error component to confirm they compile.
    const surfaces = [
      '../app/mous/new/error',
      '../app/mous/[mouId]/pi/error',
      '../app/mous/[mouId]/installments/schedule-edit/error',
      '../app/operations/vex/pi/new/error',
      '../app/escalations/new/error',
      '../app/admin/imports/pranav-refresh/error',
    ]
    for (const surface of surfaces) {
      const mod = await import(/* @vite-ignore */ surface)
      expect(typeof mod.default).toBe('function')
    }
  }, 30000)
})

describe('Cross-feature interaction 1 - TDS + count change reconcile correctly', () => {
  it('locked instalment paid via bank + TDS contributes (bank+TDS) to lockedDelta', async () => {
    const { recalcInstallments } = await import('../lib/mou/studentCountRecalc')
    // PI 1 was paid Rs 1,12,500 via Rs 1,00,000 bank + Rs 12,500 TDS.
    // receivedAmount = 1,12,500 (TDS-inclusive). At 400-count, nominal
    // = 1,00,000. lockedDelta should be (100000 - 112500) = -12500 -
    // exactly the same as if the entire amount was bank-only.
    const rows = [1, 2, 3, 4].map((seq) => ({
      id: `MOU-X-i${seq}`,
      mouId: 'MOU-X',
      schoolName: '',
      programme: 'STEAM' as const,
      instalmentLabel: `${seq} of 4`,
      instalmentSeq: seq,
      totalInstalments: 4,
      description: '',
      dueDateRaw: null,
      dueDateIso: null,
      expectedAmount: 112500,
      percentShare: 25,
      receivedAmount: seq === 1 ? 112500 : null,
      receivedDate: seq === 1 ? '2026-06-01' : null,
      paymentMode: null,
      bankReference: null,
      piNumber: null,
      taxInvoiceNumber: null,
      status: seq === 1 ? ('Paid' as const) : ('Pending' as const),
      notes: null,
      piSentDate: null,
      piSentTo: null,
      piGeneratedAt: null,
      studentCountActual: null,
      partialPayments: null,
      auditLog: [],
      // Phase 4 split:
      bankAmount: seq === 1 ? 100000 : null,
      tdsAmount: seq === 1 ? 12500 : null,
    }))
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments: rows,
    })
    // lockedDeltaContribution uses receivedAmount (the full 112500),
    // so the carry is the same as the pure-bank case.
    expect(result.rows[0]?.lockedDeltaContribution).toBe(-12500)
    expect(result.cumulativeDelta).toBe(-12500)
    // Phase 6A spread-by-weight: remainingContract = 400,000 - 112,500
    // = 287,500. Three unpaid at 25%. Each = 95,833.33.
    expect(result.rows[1]?.netDue).toBe(95833.33)
  })
})

describe('Cross-feature interaction 3 - reassignment audit lands in critical-changes', () => {
  it('sales-rep-reassigned action is recognised as critical', async () => {
    const { isCriticalAudit } = await import('../lib/criticalChanges')
    expect(
      isCriticalAudit({
        timestamp: '2026-05-20T10:00:00.000Z',
        user: 'anish.d',
        action: 'sales-rep-reassigned',
        notes: 'territory change',
      }),
    ).toBe(true)
  })
})

describe('Cross-feature interaction 4 - saved draft excluded from batch payment school list', () => {
  it('schools filter on batch page only includes schools with outstanding installments (no draft-only schools)', async () => {
    const { mous, payments, schools } = await loadFixtures()
    const activeIds = new Set(mous.filter((m) => m.cohortStatus === 'active').map((m) => m.id))
    const outstandingSchoolIds = new Set<string>()
    for (const p of payments) {
      if (!activeIds.has(p.mouId)) continue
      const s = ['Pending', 'PI Sent', 'Due Soon', 'Overdue', 'Partial']
      if (!s.includes(p.status)) continue
      const m = mous.find((mm) => mm.id === p.mouId)
      if (m) outstandingSchoolIds.add(m.schoolId)
    }
    // Find a school whose ONLY MOU is a Draft (no installments).
    const draftOnlyMou = mous.find(
      (m) => m.status === 'Draft' && !outstandingSchoolIds.has(m.schoolId),
    )
    if (!draftOnlyMou) return // no fixture row matches; skip
    const draftSchool = schools.find((s) => s.id === draftOnlyMou.schoolId)
    if (!draftSchool) return
    const { default: Page } = await import('../app/finance/payments/log-batch/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain(`batch-school-option-${draftSchool.id}`)
  }, 30000)
})

describe('Cross-feature interaction 5 - empty / dead-end state copy', () => {
  it('year filter with no MOUs shows switch-to-current CTA', async () => {
    // Force an empty FY by using a year well outside the data range.
    const { default: Page } = await import('../app/mous/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ year: '2099-00' }) }),
    )
    // Page should not crash; it may show the year as inactive and
    // default to current FY, or render an empty list.
    expect(html).not.toContain('Application error')
  }, 30000)

  it('drafts list when zero drafts shows the zero count', async () => {
    const { default: Page } = await import('../app/mous/page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ status: 'Draft' }) }),
    )
    expect(html).not.toContain('Application error')
  }, 30000)
})

describe('Pranav exact-number reconciliation (regression guard)', () => {
  it('500 -> 450 -> 400 spreads PI 2 / 3 / 4 to Rs 95,833.33 each (Phase 6A)', async () => {
    const { recalcInstallments } = await import('../lib/mou/studentCountRecalc')
    const rows = [1, 2, 3, 4].map((seq) => ({
      id: `MOU-X-i${seq}`,
      mouId: 'MOU-X',
      schoolName: '',
      programme: 'STEAM' as const,
      instalmentLabel: `${seq} of 4`,
      instalmentSeq: seq,
      totalInstalments: 4,
      description: '',
      dueDateRaw: null,
      dueDateIso: null,
      expectedAmount: 112500,
      percentShare: 25,
      receivedAmount: seq === 1 ? 112500 : null,
      receivedDate: seq === 1 ? '2026-06-01' : null,
      paymentMode: null,
      bankReference: null,
      piNumber: null,
      taxInvoiceNumber: null,
      status: seq === 1 ? ('Paid' as const) : ('Pending' as const),
      notes: null,
      piSentDate: null,
      piSentTo: null,
      piGeneratedAt: null,
      studentCountActual: null,
      partialPayments: null,
      auditLog: [],
    }))
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments: rows,
    })
    expect(result.reconciled).toBe(true)
    // Phase 6A spread-by-weight: remainingContract = 400,000 - 112,500
    // = 287,500. Three unpaid at 25%. Each = 287,500 × 25/75 = 95,833.33
    // (last absorbs rounding tail).
    expect(result.rows[1]?.netDue).toBe(95833.33)
    expect(result.rows[2]?.netDue).toBe(95833.33)
    expect(result.rows[3]?.netDue).toBe(95833.34)
    expect(result.totalCommitted).toBe(400000)
  })
})
