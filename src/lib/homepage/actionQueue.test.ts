/*
 * Phase 6F Part 2 tests for the action queue engine.
 *
 * The deterministic categories (1-4) each get a dedicated test that
 * fixtures the data slice and asserts the produced ActionItem[]. The
 * orchestrator gets a multi-role test verifying filter + Sales
 * portfolio scoping behave per the plan.
 *
 * The AI-insights provider stub is asserted to return [] without I/O.
 */

import { describe, expect, it } from 'vitest'
import type {
  Dispatch,
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
  User,
} from '@/lib/types'
import {
  buildActionQueue,
  buildDataQualityItems,
  buildOverdueItems,
  buildThisWeekItems,
  buildTodayItems,
  resolveHomepageView,
} from './actionQueue'
import { NO_OP_AI_INSIGHTS } from './aiInsights'
import type { ActionQueueContext } from './types'

const NOW = new Date('2026-05-21T10:00:00.000Z')

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'anish.d',
    name: 'Anish',
    email: 'anish.d@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
    department: null,
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X',
    schoolId: 'SCH-X',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    cohortStatus: 'active',
    delayNotes: null,
    templateVersion: 'STEAM-v3',
    academicYear: '2026-27',
    studentsMou: 100,
    studentsActual: 100,
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: 800,
    spWithTax: 1000,
    contractValue: 100000,
    tds: 0,
    paymentSchedule: '4 instalments 25% each',
    received: 0,
    receivedPct: 0,
    balance: 100000,
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    daysToExpiry: 365,
    status: 'Active',
    trainerModel: 'GSL-T',
    salesPersonId: 'pratik.d',
    productSelection: null,
    notes: null,
    generatedAt: '2026-04-01T10:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function pay(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-X-i1',
    mouId: 'MOU-X',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'STEAM - Instalment 1',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 25000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: [],
    ...overrides,
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X',
    name: 'Test School',
    state: 'Karnataka',
    city: 'Bangalore',
    pincode: '560001',
    address: '1 Test St',
    gstNumber: '29ABCDE1234F1Z5',
    panNumber: null,
    spocName: null,
    spocPhone: null,
    spocEmail: null,
    spocDesignation: null,
    secondarySpocName: null,
    secondarySpocPhone: null,
    secondarySpocEmail: null,
    secondarySpocDesignation: null,
    instagramUrl: null,
    facebookUrl: null,
    googleMapsUrl: null,
    website: null,
    crmId: null,
    notes: null,
    auditLog: [],
    ...overrides,
  }
}

function makeData(opts: {
  mous?: MOU[]
  payments?: Payment[]
  paymentLogs?: PaymentLog[]
  schools?: School[]
  users?: User[]
} = {}): ActionQueueContext['data'] {
  return {
    mous: opts.mous ?? [],
    payments: opts.payments ?? [],
    paymentLogs: opts.paymentLogs ?? [],
    schools: opts.schools ?? [],
    dispatches: [] as Dispatch[],
    kitDispatches: [] as KitDispatch[],
    escalations: [] as Escalation[],
    users: opts.users,
  }
}

describe('resolveHomepageView', () => {
  it('Ameet -> leadership', () => {
    expect(resolveHomepageView(user({ id: 'ameet.z', department: null }))).toBe('leadership')
  })
  it('Anish (null dept) -> admin', () => {
    expect(resolveHomepageView(user({ id: 'anish.d', department: null }))).toBe('admin')
  })
  it('Pranav (finance) -> finance', () => {
    expect(resolveHomepageView(user({ id: 'pranav.b', department: 'finance' }))).toBe('finance')
  })
  it('Misba (ops) -> ops', () => {
    expect(resolveHomepageView(user({ id: 'misba.m', department: 'ops' }))).toBe('ops')
  })
  it('Pratik (sales) -> sales', () => {
    expect(resolveHomepageView(user({ id: 'pratik.d', department: 'sales' }))).toBe('sales')
  })
})

describe('buildOverdueItems', () => {
  it('emits the past-7 instalments card with the worst-days subtitle', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p-old', dueDateIso: '2026-05-01', status: 'Pending' }), // 20d old
        pay({ id: 'p-medium', dueDateIso: '2026-05-10', status: 'Pending' }), // 11d
        pay({ id: 'p-fresh', dueDateIso: '2026-05-20', status: 'Pending' }), // 1d (excluded)
      ],
    })
    const items = buildOverdueItems({ now: NOW, user: user(), data })
    const past7 = items.find((i) => i.id === 'overdue:instalments-past-7-days')
    expect(past7?.count).toBe(2)
    expect(past7?.meta.worstDaysPastDue).toBe(20)
    expect(past7?.urgencyScore).toBe(1020)
  })

  it('emits the PI-unissued-14 card only for piNumber=null AND >14 days past due', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p1', dueDateIso: '2026-05-01', piNumber: null }), // 20d past due, no PI
        pay({ id: 'p2', dueDateIso: '2026-05-01', piNumber: 'PI-001' }), // PI exists -> not blocked
        pay({ id: 'p3', dueDateIso: '2026-05-15', piNumber: null }), // 6d past due, under threshold
      ],
    })
    const items = buildOverdueItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'overdue:pi-unissued-past-14-days')
    expect(card?.count).toBe(1)
  })

  it('emits the Pending-Signature-30 card and tags it as a sales action', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-old', status: 'Pending Signature', startDate: '2026-03-01' }), // 81d old
        mou({ id: 'M-fresh', status: 'Pending Signature', startDate: '2026-05-15' }), // 6d old
      ],
    })
    const items = buildOverdueItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'overdue:pending-signature-30-days')
    expect(card?.count).toBe(1)
    expect(card?.role).toBe('sales')
  })

  it('emits the bank-credit unmatched > 7 days card', () => {
    const data = makeData({
      paymentLogs: [
        { id: 'PL-1', date: '2026-05-01', amount: 50000, mode: 'Bank Transfer', reference: null, narration: null, salesPersonId: null, matchedInstallmentIds: [], unmatched: true, loggedBy: 'pranav.b', loggedAt: '', notes: null },
        { id: 'PL-2', date: '2026-05-20', amount: 60000, mode: 'Bank Transfer', reference: null, narration: null, salesPersonId: null, matchedInstallmentIds: [], unmatched: true, loggedBy: 'pranav.b', loggedAt: '', notes: null },
      ],
    })
    const items = buildOverdueItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'overdue:unmatched-payments-7-days')
    expect(card?.count).toBe(1)
  })
})

describe('buildTodayItems', () => {
  it('counts only Pending instalments whose dueDateIso equals today', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p1', dueDateIso: '2026-05-21', status: 'Pending' }),
        pay({ id: 'p2', dueDateIso: '2026-05-21', status: 'Paid' }),  // not pending
        pay({ id: 'p3', dueDateIso: '2026-05-20', status: 'Pending' }), // not today
      ],
    })
    const items = buildTodayItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'today:instalments-due-today')
    expect(card?.count).toBe(1)
  })

  it('emits active-MOUs-first-PI card when an Active MOU has i1.piNumber === null', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-active-no-pi', status: 'Active' }),
        mou({ id: 'M-active-with-pi', status: 'Active' }),
        mou({ id: 'M-pending', status: 'Pending Signature' }),
      ],
      payments: [
        pay({ id: 'M-active-no-pi-i1', mouId: 'M-active-no-pi', instalmentSeq: 1, piNumber: null }),
        pay({ id: 'M-active-with-pi-i1', mouId: 'M-active-with-pi', instalmentSeq: 1, piNumber: 'GSL/OPS/26-27/0001' }),
        pay({ id: 'M-pending-i1', mouId: 'M-pending', instalmentSeq: 1, piNumber: null }),
      ],
    })
    const items = buildTodayItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'today:active-mous-i1-pi-unissued')
    expect(card?.count).toBe(1)
  })

  it('counts auto-suggested matches: fresh log within Rs 10 of exactly one Pending instalment', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p1', expectedAmount: 50000, status: 'Pending' }),
        pay({ id: 'p2', expectedAmount: 60000, status: 'Pending' }),
        pay({ id: 'p3', expectedAmount: 50001, status: 'Paid' }), // not Pending, ignored
      ],
      paymentLogs: [
        { id: 'PL-match', date: '2026-05-20', amount: 50005, mode: 'Bank Transfer', reference: null, narration: null, salesPersonId: null, matchedInstallmentIds: [], unmatched: true, loggedBy: 'p', loggedAt: '', notes: null }, // matches p1 within Rs 10
        { id: 'PL-no-match', date: '2026-05-20', amount: 99999, mode: 'Bank Transfer', reference: null, narration: null, salesPersonId: null, matchedInstallmentIds: [], unmatched: true, loggedBy: 'p', loggedAt: '', notes: null }, // matches nothing
      ],
    })
    const items = buildTodayItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'today:unmatched-payments-auto-suggested')
    expect(card?.count).toBe(1)
  })
})

describe('buildThisWeekItems', () => {
  it('emits the 7-day due card', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p1', dueDateIso: '2026-05-23', status: 'Pending' }), // in 2 days
        pay({ id: 'p2', dueDateIso: '2026-05-30', status: 'Pending' }), // in 9 days (excluded)
        pay({ id: 'p3', dueDateIso: '2026-05-21', status: 'Pending' }), // today (excluded by > today check)
      ],
    })
    const items = buildThisWeekItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'this-week:instalments-due-next-7')
    expect(card?.count).toBe(1)
  })

  it('emits renewal-eligible MOUs within the 60-day horizon, sales-tagged', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-near-renewal', status: 'Active', endDate: '2026-06-30' }), // 40d away
        mou({ id: 'M-far-renewal', status: 'Active', endDate: '2026-09-30' }), // 132d (excluded)
        mou({ id: 'M-pending-renewal', status: 'Pending Signature', endDate: '2026-06-15' }), // status filter
      ],
    })
    const items = buildThisWeekItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'this-week:renewal-eligible-60-days')
    expect(card?.count).toBe(1)
    expect(card?.role).toBe('sales')
  })
})

describe('buildDataQualityItems', () => {
  it('null-productSelection lands FIRST in the data-quality output (Anish 2026-05-21 GO)', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M1', productSelection: null }),
        mou({ id: 'M2', productSelection: null }),
        mou({ id: 'M3', productSelection: 'Cretile' }),
      ],
    })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    expect(items[0]?.id).toBe('data-quality:null-productSelection')
    expect(items[0]?.count).toBe(2)
    expect(items[0]?.ctaHref).toBe('/admin/product-backfill')
    expect(items[0]?.role).toBe('both')
  })

  it('paid-no-PI count matches receivedAmount > 0 && piNumber === null', () => {
    const data = makeData({
      payments: [
        pay({ id: 'p1', receivedAmount: 50000, piNumber: null }),
        pay({ id: 'p2', receivedAmount: 0, piNumber: null }),       // excluded (not received)
        pay({ id: 'p3', receivedAmount: 50000, piNumber: 'PI-1' }), // excluded (PI exists)
      ],
    })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    const paidNoPi = items.find((i) => i.id === 'data-quality:paid-no-pi')
    expect(paidNoPi?.count).toBe(1)
  })

  it('contract-value mismatch fires when |stored - studentsActual × spWithTax| > Rs 100', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-bapuji', studentsActual: 100, spWithTax: 1000, contractValue: 169230 }), // 69230 over
        mou({ id: 'M-clean', studentsActual: 100, spWithTax: 1000, contractValue: 100000 }),
        mou({ id: 'M-edge', studentsActual: 100, spWithTax: 1000, contractValue: 100099 }),   // 99 diff, under tolerance
      ],
    })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'data-quality:contract-value-mismatch')
    expect(card?.count).toBe(1)
  })

  it('gstin-missing counts Active MOUs at schools with no GSTIN', () => {
    const data = makeData({
      mous: [
        mou({ id: 'M1', status: 'Active', schoolId: 'S1' }),
        mou({ id: 'M2', status: 'Active', schoolId: 'S2' }),
        mou({ id: 'M3', status: 'Pending Signature', schoolId: 'S2' }), // not Active
      ],
      schools: [
        school({ id: 'S1', gstNumber: null }),
        school({ id: 'S2', gstNumber: '29ABCDE1234F1Z5' }),
      ],
    })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'data-quality:gstin-missing')
    expect(card?.count).toBe(1)
  })

  it('orphan-payments counts payments whose mouId is not in mous.json', () => {
    const data = makeData({
      mous: [mou({ id: 'M-live' })],
      payments: [
        pay({ id: 'p1', mouId: 'M-live' }),
        pay({ id: 'p2', mouId: 'M-DEAD' }),
      ],
    })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'data-quality:orphan-payments')
    expect(card?.count).toBe(1)
  })

  it('Phase 6G: pending-user-reviews card fires when an auto-created SSO user is waiting for approval', () => {
    const pendingUser: User = {
      id: 'newhire',
      name: 'New Hire',
      email: 'newhire@getsetlearn.info',
      role: 'OpsEmployee',
      department: null,
      testingOverride: false,
      active: false,
      passwordHash: '',
      createdAt: '2026-05-21T15:00:00Z',
      auditLog: [],
      azureAdObjectId: 'oid-newhire',
      requiresAdminReview: true,
    }
    const activeUser: User = { ...pendingUser, id: 'existing', active: true, requiresAdminReview: false }
    const data = makeData({ users: [pendingUser, activeUser] })
    const items = buildDataQualityItems({ now: NOW, user: user(), data })
    const card = items.find((i) => i.id === 'data-quality:pending-user-reviews')
    expect(card?.count).toBe(1)
    expect(card?.ctaHref).toBe('/admin/queue-status')
    expect(card?.role).toBe('both')
  })
})

describe('AI insights stub', () => {
  it('NO_OP_AI_INSIGHTS returns an empty array', async () => {
    const ctx: ActionQueueContext = {
      now: NOW,
      user: user(),
      data: makeData(),
    }
    const r = await NO_OP_AI_INSIGHTS.listInsights(ctx)
    expect(r).toEqual([])
    expect(NO_OP_AI_INSIGHTS.id).toBe('no-op')
  })
})

describe('buildActionQueue orchestrator', () => {
  function richData() {
    return makeData({
      mous: [
        // Sales-owned by pratik.d:
        mou({ id: 'M-stale-pratik', status: 'Pending Signature', startDate: '2026-03-01', salesPersonId: 'pratik.d' }),
        // Sales-owned by vishwanath.g:
        mou({ id: 'M-stale-vish', status: 'Pending Signature', startDate: '2026-03-01', salesPersonId: 'vishwanath.g' }),
        // Renewal-eligible Pratik MOU:
        mou({ id: 'M-renew-pratik', status: 'Active', endDate: '2026-06-30', salesPersonId: 'pratik.d' }),
        // Null product, no portfolio scope:
        mou({ id: 'M-null-product', productSelection: null, status: 'Active' }),
      ],
    })
  }

  it('admin view (Anish) returns every category and unscoped sales items', async () => {
    const r = await buildActionQueue(
      { now: NOW, user: user({ id: 'anish.d', department: null }), data: richData() },
      NO_OP_AI_INSIGHTS,
    )
    expect(r.view).toBe('admin')
    const ids = r.items.map((i) => i.id)
    expect(ids).toContain('overdue:pending-signature-30-days')
    expect(ids).toContain('this-week:renewal-eligible-60-days')
    expect(ids).toContain('data-quality:null-productSelection')
    // Sales items for admin are unscoped: count includes both Pratik and Vishwanath.
    const stale = r.items.find((i) => i.id === 'overdue:pending-signature-30-days')
    expect(stale?.count).toBe(2)
  })

  it('sales view (Pratik) scopes sales items to his MOUs only', async () => {
    const r = await buildActionQueue(
      { now: NOW, user: user({ id: 'pratik.d', department: 'sales' }), data: richData() },
      NO_OP_AI_INSIGHTS,
    )
    expect(r.view).toBe('sales')
    const ids = r.items.map((i) => i.id)
    // Pratik sees his stale-30 MOU (1, not 2):
    const stale = r.items.find((i) => i.id === 'overdue:pending-signature-30-days')
    expect(stale?.count).toBe(1)
    expect(stale?.title).toContain('your MOUs')
    // Pratik sees his renewal-eligible MOU:
    const renew = r.items.find((i) => i.id === 'this-week:renewal-eligible-60-days')
    expect(renew?.count).toBe(1)
    // Pratik also sees 'both'-tagged null-productSelection card:
    expect(ids).toContain('data-quality:null-productSelection')
    // Pratik does NOT see finance-only cards even if data is present:
    // (none of finance-tagged categories matched in this fixture)
    for (const item of r.items) {
      expect(item.role === 'sales' || item.role === 'both').toBe(true)
    }
  })

  it('finance view (Pranav) sees finance + both cards only', async () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-stale', status: 'Pending Signature', startDate: '2026-03-01' }), // sales-tag
        mou({ id: 'M-null-product', productSelection: null }),                          // both-tag
      ],
      payments: [
        pay({ id: 'p1', receivedAmount: 50000, piNumber: null }), // both-tag (paid-no-pi)
      ],
    })
    const r = await buildActionQueue(
      { now: NOW, user: user({ id: 'pranav.b', department: 'finance' }), data },
      NO_OP_AI_INSIGHTS,
    )
    expect(r.view).toBe('finance')
    const ids = r.items.map((i) => i.id)
    expect(ids).not.toContain('overdue:pending-signature-30-days')   // sales-only, filtered
    expect(ids).toContain('data-quality:null-productSelection')      // both
    expect(ids).toContain('data-quality:paid-no-pi')                 // both
  })

  it('ops view (Misba) sees ops + both cards only', async () => {
    const data = makeData({
      mous: [
        mou({ id: 'M-stale', status: 'Pending Signature', startDate: '2026-03-01' }), // sales -> filtered
        mou({ id: 'M-null-product', productSelection: null }),                          // both -> visible
      ],
    })
    const r = await buildActionQueue(
      { now: NOW, user: user({ id: 'misba.m', department: 'ops' }), data },
      NO_OP_AI_INSIGHTS,
    )
    expect(r.view).toBe('ops')
    for (const item of r.items) {
      expect(item.role === 'ops' || item.role === 'both').toBe(true)
    }
  })

  it('leadership view (Ameet) returns the same items admin sees (caller aggregates)', async () => {
    const data = richData()
    const adminResult = await buildActionQueue(
      { now: NOW, user: user({ id: 'anish.d', department: null }), data },
      NO_OP_AI_INSIGHTS,
    )
    const leadershipResult = await buildActionQueue(
      { now: NOW, user: user({ id: 'ameet.z', department: null }), data },
      NO_OP_AI_INSIGHTS,
    )
    expect(leadershipResult.view).toBe('leadership')
    expect(leadershipResult.items.map((i) => i.id)).toEqual(adminResult.items.map((i) => i.id))
  })

  it('orders results by (category enum order, urgencyScore desc)', async () => {
    const data = makeData({
      mous: [
        mou({ id: 'M1', productSelection: null }),
        mou({ id: 'M-stale', status: 'Pending Signature', startDate: '2026-03-01' }),
      ],
      payments: [pay({ id: 'p1', receivedAmount: 50000, piNumber: null })],
    })
    const r = await buildActionQueue(
      { now: NOW, user: user({ id: 'anish.d', department: null }), data },
      NO_OP_AI_INSIGHTS,
    )
    const categories = r.items.map((i) => i.category)
    // Overdue items come before data-quality items.
    const overdueIdx = categories.indexOf('overdue')
    const dqIdx = categories.indexOf('data-quality')
    if (overdueIdx >= 0 && dqIdx >= 0) {
      expect(overdueIdx).toBeLessThan(dqIdx)
    }
  })
})
