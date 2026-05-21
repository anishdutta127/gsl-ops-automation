/*
 * Homepage action queue engine (Phase 6F Part 2).
 *
 * Pure-data layer. Given a context (now, user, data slice), produce
 * a flat list of ActionItem entries the homepage renders as cards.
 * No I/O, no fetch, no GitHub queue writes.
 *
 * Category catalogue lives in HOMEPAGE_REDESIGN_PLAN.md. Each
 * category resolves via a dedicated builder; the orchestrator
 * concatenates them, applies role filtering, and returns.
 *
 * Role filtering rules (per the plan + Anish 2026-05-21 GO):
 *   admin       -> all items
 *   leadership  -> all items (Ameet's "Platform pulse" caller
 *                  aggregates these by category; the engine itself
 *                  is identical to admin)
 *   finance     -> role === 'finance' || role === 'both'
 *   ops         -> role === 'ops' || role === 'both'
 *   sales       -> role === 'sales' || role === 'both', AND for
 *                  'sales' items the engine has already filtered by
 *                  salesPersonId === user.id at build time.
 */

import {
  defaultDepartmentForRole,
  getDepartment,
} from '@/lib/access'
import type {
  ActionItem,
  ActionQueueContext,
  ActionRole,
  AiInsightProvider,
} from './types'

/** Resolved homepage view, derived from user.id + role + department. */
export type HomepageView = 'admin' | 'leadership' | 'finance' | 'ops' | 'sales'

/**
 * Map a user to their homepage view. Ameet is leadership. Everyone
 * else: dept === null -> admin, else use the department literal.
 */
export function resolveHomepageView(user: { id: string; role: Parameters<typeof defaultDepartmentForRole>[0]; department?: string | null }): HomepageView {
  if (user.id === 'ameet.z') return 'leadership'
  const dept = getDepartment(user as Parameters<typeof getDepartment>[0])
  if (dept === null) return 'admin'
  if (dept === 'sales' || dept === 'ops' || dept === 'finance') return dept
  return 'admin'
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS)
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)
}

function parseIso(s: string): Date {
  // YYYY-MM-DD interpreted as UTC midnight to avoid TZ flake.
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
}

// ---------- Category 1: Overdue & escalating -----------------------------

export function buildOverdueItems(ctx: ActionQueueContext): ActionItem[] {
  const out: ActionItem[] = []
  const { now, data } = ctx
  const todayUtc = parseIso(now.toISOString().slice(0, 10))

  // 1.1 Pending instalments past due > 7 days.
  const past7 = data.payments.filter((p) => {
    if (p.status !== 'Pending') return false
    if (!isIsoDate(p.dueDateIso)) return false
    return daysBetween(todayUtc, parseIso(p.dueDateIso)) > 7
  })
  if (past7.length > 0) {
    const worst = Math.max(
      ...past7.map((p) => daysBetween(todayUtc, parseIso(p.dueDateIso!))),
    )
    out.push({
      id: 'overdue:instalments-past-7-days',
      category: 'overdue',
      role: 'finance',
      title: `${past7.length} instalments overdue more than 7 days`,
      count: past7.length,
      ctaLabel: 'Review',
      ctaHref: '/finance/payments?bucket=overdue-7',
      meta: {
        subtitle: `Oldest ${worst} days past due`,
        worstDaysPastDue: worst,
      },
      urgencyScore: 1000 + worst,
    })
  }

  // 1.2 PIs unissued > 14 days post-due.
  const unissuedPi = data.payments.filter((p) => {
    if (p.status !== 'Pending') return false
    if (p.piNumber !== null) return false
    if (!isIsoDate(p.dueDateIso)) return false
    return daysBetween(todayUtc, parseIso(p.dueDateIso)) > 14
  })
  if (unissuedPi.length > 0) {
    out.push({
      id: 'overdue:pi-unissued-past-14-days',
      category: 'overdue',
      role: 'finance',
      title: `${unissuedPi.length} PIs unissued more than 14 days after due`,
      count: unissuedPi.length,
      ctaLabel: 'Issue PI',
      ctaHref: '/admin/pi-blockers',
      meta: {
        subtitle: 'Finance has the issuance gate; clear the blocker list.',
      },
      urgencyScore: 1500,
    })
  }

  // 1.3 Signed MOUs not activated > 30 days.
  const stalePendingSignature = data.mous.filter((m) => {
    if (m.status !== 'Pending Signature') return false
    if (!isIsoDate(m.startDate)) return false
    return daysBetween(todayUtc, parseIso(m.startDate)) > 30
  })
  if (stalePendingSignature.length > 0) {
    out.push({
      id: 'overdue:pending-signature-30-days',
      category: 'overdue',
      role: 'sales',
      title: `${stalePendingSignature.length} MOUs awaiting signature for over 30 days`,
      count: stalePendingSignature.length,
      ctaLabel: 'Chase',
      ctaHref: '/mous?status=Pending+Signature',
      meta: {
        subtitle: 'Older than 30 days from startDate.',
      },
      urgencyScore: 1200,
    })
  }

  // 1.4 Unmatched payment logs > 7 days old.
  const oldUnmatchedLogs = data.paymentLogs.filter((l) => {
    if (l.unmatched !== true) return false
    if (!isIsoDate(l.date)) return false
    return daysBetween(todayUtc, parseIso(l.date)) > 7
  })
  if (oldUnmatchedLogs.length > 0) {
    out.push({
      id: 'overdue:unmatched-payments-7-days',
      category: 'overdue',
      role: 'finance',
      title: `${oldUnmatchedLogs.length} bank credits unmatched over 7 days`,
      count: oldUnmatchedLogs.length,
      ctaLabel: 'Match',
      ctaHref: '/finance/payments/unmatched',
      meta: {
        subtitle: 'Older than 7 days from received date.',
      },
      urgencyScore: 1300,
    })
  }

  return out
}

// ---------- Category 2: Today's actions ---------------------------------

export function buildTodayItems(ctx: ActionQueueContext): ActionItem[] {
  const out: ActionItem[] = []
  const { now, data } = ctx
  const todayIso = now.toISOString().slice(0, 10)

  // 2.1 Instalments due today.
  const dueToday = data.payments.filter(
    (p) => p.status === 'Pending' && p.dueDateIso === todayIso,
  )
  if (dueToday.length > 0) {
    out.push({
      id: 'today:instalments-due-today',
      category: 'today',
      role: 'finance',
      title: `${dueToday.length} instalments due today`,
      count: dueToday.length,
      ctaLabel: 'Review',
      ctaHref: `/finance/payments?dueOn=${todayIso}`,
      meta: { subtitle: 'Action expected today.' },
      urgencyScore: 800,
    })
  }

  // 2.2 Active MOUs eligible for first PI.
  const i1ByMou = new Map<string, typeof data.payments[number]>()
  for (const p of data.payments) {
    if (p.instalmentSeq === 1) i1ByMou.set(p.mouId, p)
  }
  const i1EligibleMous = data.mous.filter((m) => {
    if (m.status !== 'Active') return false
    const i1 = i1ByMou.get(m.id)
    if (!i1) return false
    return i1.piNumber === null
  })
  if (i1EligibleMous.length > 0) {
    out.push({
      id: 'today:active-mous-i1-pi-unissued',
      category: 'today',
      role: 'finance',
      title: `${i1EligibleMous.length} active MOUs awaiting first PI`,
      count: i1EligibleMous.length,
      ctaLabel: 'Issue PI',
      ctaHref: '/admin/pi-blockers?bucket=i1-unissued',
      meta: { subtitle: 'Activated MOUs without first PI issued.' },
      urgencyScore: 700,
    })
  }

  // 2.3 Unmatched payments with one fresh-looking match candidate.
  // Lightweight heuristic: log within 3 days where exactly one Pending
  // instalment in payments.json matches amount within Rs 10.
  const todayUtc = parseIso(todayIso)
  const freshUnmatched = data.paymentLogs.filter((l) => {
    if (l.unmatched !== true) return false
    if (!isIsoDate(l.date)) return false
    return daysBetween(todayUtc, parseIso(l.date)) <= 3
  })
  let suggested = 0
  for (const log of freshUnmatched) {
    const matches = data.payments.filter(
      (p) =>
        p.status === 'Pending' &&
        Math.abs((p.expectedAmount ?? 0) - log.amount) <= 10,
    )
    if (matches.length === 1) suggested += 1
  }
  if (suggested > 0) {
    out.push({
      id: 'today:unmatched-payments-auto-suggested',
      category: 'today',
      role: 'finance',
      title: `${suggested} bank credits have a likely instalment match`,
      count: suggested,
      ctaLabel: 'Match',
      ctaHref: '/finance/payments/unmatched?suggested=1',
      meta: {
        subtitle: 'Exactly one Pending instalment matches amount within Rs 10.',
      },
      urgencyScore: 750,
    })
  }

  return out
}

// ---------- Category 3: This week ----------------------------------------

export function buildThisWeekItems(ctx: ActionQueueContext): ActionItem[] {
  const out: ActionItem[] = []
  const { now, data } = ctx
  const todayUtc = parseIso(now.toISOString().slice(0, 10))
  const sixtyDaysAhead = new Date(todayUtc.getTime() + 60 * DAY_MS)
  const sevenDaysAhead = new Date(todayUtc.getTime() + 7 * DAY_MS)

  // 3.1 Instalments due in next 7 days (exclusive of today).
  const dueNext7 = data.payments.filter((p) => {
    if (p.status !== 'Pending') return false
    if (!isIsoDate(p.dueDateIso)) return false
    const d = parseIso(p.dueDateIso)
    return d > todayUtc && d <= sevenDaysAhead
  })
  if (dueNext7.length > 0) {
    out.push({
      id: 'this-week:instalments-due-next-7',
      category: 'this-week',
      role: 'finance',
      title: `${dueNext7.length} instalments due in the next 7 days`,
      count: dueNext7.length,
      ctaLabel: 'Review',
      ctaHref: '/finance/payments?bucket=due-7',
      meta: { subtitle: 'Plan PI issuance ahead of time.' },
      urgencyScore: 500,
    })
  }

  // 3.2 MOUs entering next payment milestone in next 7 days.
  // Heuristic: find the next-due Pending instalment per MOU; if that
  // instalment falls in the 7-day window and the prior instalment is
  // Paid / PI Sent, surface the MOU.
  const paymentsByMou = new Map<string, typeof data.payments>()
  for (const p of data.payments) {
    const arr = paymentsByMou.get(p.mouId) ?? []
    arr.push(p)
    paymentsByMou.set(p.mouId, arr)
  }
  let milestoneMous = 0
  for (const m of data.mous) {
    if (m.status !== 'Active') continue
    const ps = (paymentsByMou.get(m.id) ?? [])
      .slice()
      .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
    const nextPending = ps.find((p) => p.status === 'Pending' && isIsoDate(p.dueDateIso))
    if (!nextPending) continue
    const d = parseIso(nextPending.dueDateIso!)
    if (!(d > todayUtc && d <= sevenDaysAhead)) continue
    const prior = ps.find((p) => p.instalmentSeq === nextPending.instalmentSeq - 1)
    if (!prior) continue
    if (prior.status !== 'Paid' && prior.status !== 'PI Sent') continue
    milestoneMous += 1
  }
  if (milestoneMous > 0) {
    out.push({
      id: 'this-week:mou-milestone-next-7',
      category: 'this-week',
      role: 'ops',
      title: `${milestoneMous} MOUs hit a payment milestone in the next 7 days`,
      count: milestoneMous,
      ctaLabel: 'Plan',
      ctaHref: '/mous?bucket=milestone-7',
      meta: { subtitle: 'Prior instalment paid; next one due soon.' },
      urgencyScore: 450,
    })
  }

  // 3.3 Renewal-eligible MOUs (endDate within 60 days, status Active).
  const renewalEligible = data.mous.filter((m) => {
    if (m.status !== 'Active') return false
    if (!isIsoDate(m.endDate)) return false
    const d = parseIso(m.endDate)
    return d >= todayUtc && d <= sixtyDaysAhead
  })
  if (renewalEligible.length > 0) {
    out.push({
      id: 'this-week:renewal-eligible-60-days',
      category: 'this-week',
      role: 'sales',
      title: `${renewalEligible.length} MOUs renewal-eligible (end date within 60 days)`,
      count: renewalEligible.length,
      ctaLabel: 'Plan renewals',
      ctaHref: '/mous?bucket=renewal-60',
      meta: { subtitle: 'Open the renewal conversation.' },
      urgencyScore: 400,
    })
  }

  return out
}

// ---------- Category 4: Data quality ------------------------------------

export function buildDataQualityItems(ctx: ActionQueueContext): ActionItem[] {
  const out: ActionItem[] = []
  const { data } = ctx

  // 4.1 (FIRST - Anish 2026-05-21 GO addition) MOUs with null productSelection.
  const nullProduct = data.mous.filter(
    (m) =>
      m.productSelection === null ||
      m.productSelection === undefined,
  )
  if (nullProduct.length > 0) {
    out.push({
      id: 'data-quality:null-productSelection',
      category: 'data-quality',
      role: 'both',
      title: `${nullProduct.length} MOUs missing productSelection`,
      count: nullProduct.length,
      ctaLabel: 'Bulk-edit',
      ctaHref: '/admin/product-backfill',
      meta: {
        subtitle: 'Largest single data-quality gap; bulk-edit by school.',
      },
      urgencyScore: 350,
    })
  }

  // 4.2 Paid-no-PI backfill candidates.
  const paidNoPi = data.payments.filter(
    (p) => (p.receivedAmount ?? 0) > 0 && p.piNumber === null,
  )
  if (paidNoPi.length > 0) {
    out.push({
      id: 'data-quality:paid-no-pi',
      category: 'data-quality',
      role: 'both',
      title: `${paidNoPi.length} payments received without a PI`,
      count: paidNoPi.length,
      ctaLabel: 'Backfill',
      ctaHref: '/admin/imports/pi-backfill',
      meta: { subtitle: 'Auto-suggest matches the bulk of these.' },
      urgencyScore: 320,
    })
  }

  // 4.3 Stored-vs-derived contract value mismatch > Rs 100.
  let mismatchCount = 0
  for (const m of data.mous) {
    const derived = (m.studentsActual ?? m.studentsMou ?? 0) * (m.spWithTax ?? 0)
    if (derived <= 0) continue
    if (Math.abs(m.contractValue - derived) > 100) mismatchCount += 1
  }
  if (mismatchCount > 0) {
    out.push({
      id: 'data-quality:contract-value-mismatch',
      category: 'data-quality',
      role: 'finance',
      title: `${mismatchCount} MOUs have stored vs derived contract value mismatches`,
      count: mismatchCount,
      ctaLabel: 'Reconcile',
      ctaHref: '/admin/mou-contract-reconcile',
      meta: {
        subtitle: '|stored - studentsActual × spWithTax| > Rs 100.',
      },
      urgencyScore: 300,
    })
  }

  // 4.4 Active MOUs with school missing GSTIN.
  const schoolById = new Map(data.schools.map((s) => [s.id, s]))
  let gstinMissingCount = 0
  for (const m of data.mous) {
    if (m.status !== 'Active') continue
    const s = schoolById.get(m.schoolId)
    if (!s) continue
    if (s.gstNumber === null || (s.gstNumber ?? '').trim() === '') gstinMissingCount += 1
  }
  if (gstinMissingCount > 0) {
    out.push({
      id: 'data-quality:gstin-missing',
      category: 'data-quality',
      role: 'finance',
      title: `${gstinMissingCount} active MOUs at schools missing GSTIN`,
      count: gstinMissingCount,
      ctaLabel: 'Fix',
      ctaHref: '/admin/schools?gstin=missing',
      meta: { subtitle: 'PIs require GSTIN; backfill before the next issue.' },
      urgencyScore: 280,
    })
  }

  // 4.5 Orphan payment rows (mouId points to a MOU not in mous.json).
  const mouIds = new Set(data.mous.map((m) => m.id))
  const orphans = data.payments.filter((p) => p.mouId !== null && !mouIds.has(p.mouId))
  if (orphans.length > 0) {
    out.push({
      id: 'data-quality:orphan-payments',
      category: 'data-quality',
      role: 'both',
      title: `${orphans.length} payments orphaned from their MOU`,
      count: orphans.length,
      ctaLabel: 'Investigate',
      ctaHref: '/admin/orphan-payments',
      meta: { subtitle: 'Payment row references a MOU id not in mous.json.' },
      urgencyScore: 260,
    })
  }

  // 4.6 Phase 6G: pending SSO user reviews. Auto-created users from
  // Microsoft sign-in surface as a data-quality card so Anish sees
  // them on the homepage immediately. CTA deep links to the JSON
  // dump endpoint until a real approval UI ships.
  const pendingReviewUsers = (data.users ?? []).filter((u) => u.requiresAdminReview === true)
  if (pendingReviewUsers.length > 0) {
    out.push({
      id: 'data-quality:pending-user-reviews',
      category: 'data-quality',
      role: 'both',
      title: `${pendingReviewUsers.length} pending SSO user review${pendingReviewUsers.length === 1 ? '' : 's'}`,
      count: pendingReviewUsers.length,
      ctaLabel: 'Review',
      ctaHref: '/admin/queue-status',
      meta: {
        subtitle: 'Auto-created on first Microsoft sign-in; inactive until promoted.',
      },
      urgencyScore: 340, // between null-productSelection (350) and paid-no-pi (320)
    })
  }

  return out
}

// ---------- Category 5: AI insights -------------------------------------

export async function buildAiInsights(
  ctx: ActionQueueContext,
  provider: AiInsightProvider,
): Promise<ActionItem[]> {
  return provider.listInsights(ctx)
}

// ---------- Orchestrator -------------------------------------------------

/**
 * Per-user portfolio scoping for Sales items. When the requesting
 * user is a Sales user (or admin acting in sales context), we filter
 * Sales-role items down to MOUs owned by them via salesPersonId.
 * Admin / Leadership / Finance / Ops see Sales items unscoped (they
 * are the cross-team observers).
 */
function applySalesPortfolioScope(
  items: ActionItem[],
  ctx: ActionQueueContext,
  view: HomepageView,
): ActionItem[] {
  if (view !== 'sales') return items
  const myMouIds = new Set(
    ctx.data.mous.filter((m) => m.salesPersonId === ctx.user.id).map((m) => m.id),
  )
  // Only the Sales-role items get count-recomputed. We rebuild each
  // sales-role item with a portfolio-scoped recount; if the count
  // drops to zero, the item is dropped.
  const out: ActionItem[] = []
  for (const item of items) {
    if (item.role !== 'sales') {
      out.push(item)
      continue
    }
    // The current engine emits sales-role aggregates with raw counts;
    // for sales-view callers we recompute against the MOU set. The
    // recompute lives in this loop because the orchestrator owns the
    // user identity; the category builders are user-agnostic.
    const scoped = scopeSalesItem(item, ctx, myMouIds)
    if (scoped !== null) out.push(scoped)
  }
  return out
}

function scopeSalesItem(
  item: ActionItem,
  ctx: ActionQueueContext,
  myMouIds: Set<string>,
): ActionItem | null {
  // Two known sales items today; both filter the source set down to
  // the user's portfolio and rebuild the count. If we add more sales
  // items later, extend this switch.
  const todayUtc = parseIso(ctx.now.toISOString().slice(0, 10))
  switch (item.id) {
    case 'overdue:pending-signature-30-days': {
      const scoped = ctx.data.mous.filter((m) => {
        if (!myMouIds.has(m.id)) return false
        if (m.status !== 'Pending Signature') return false
        if (!isIsoDate(m.startDate)) return false
        return daysBetween(todayUtc, parseIso(m.startDate)) > 30
      })
      if (scoped.length === 0) return null
      return { ...item, count: scoped.length, title: `${scoped.length} of your MOUs awaiting signature over 30 days` }
    }
    case 'this-week:renewal-eligible-60-days': {
      const sixty = new Date(todayUtc.getTime() + 60 * DAY_MS)
      const scoped = ctx.data.mous.filter((m) => {
        if (!myMouIds.has(m.id)) return false
        if (m.status !== 'Active') return false
        if (!isIsoDate(m.endDate)) return false
        const d = parseIso(m.endDate)
        return d >= todayUtc && d <= sixty
      })
      if (scoped.length === 0) return null
      return { ...item, count: scoped.length, title: `${scoped.length} of your MOUs renewal-eligible in the next 60 days` }
    }
    default:
      return item
  }
}

function filterByRole(items: ActionItem[], view: HomepageView): ActionItem[] {
  if (view === 'admin' || view === 'leadership') return items
  return items.filter((item) => {
    if (item.role === 'both') return true
    return item.role === (view as ActionRole)
  })
}

export interface BuildActionQueueResult {
  view: HomepageView
  items: ActionItem[]
}

/**
 * Top-level orchestrator. Build every category, apply Sales portfolio
 * scoping if needed, then filter by the requesting user's role. The
 * result is sorted by (category enum order, urgencyScore desc) so the
 * homepage can render cards in stable order.
 */
export async function buildActionQueue(
  ctx: ActionQueueContext,
  aiProvider: AiInsightProvider,
): Promise<BuildActionQueueResult> {
  const view = resolveHomepageView(ctx.user)
  const all: ActionItem[] = [
    ...buildOverdueItems(ctx),
    ...buildTodayItems(ctx),
    ...buildThisWeekItems(ctx),
    ...buildDataQualityItems(ctx),
    ...(await buildAiInsights(ctx, aiProvider)),
  ]
  const scoped = applySalesPortfolioScope(all, ctx, view)
  const filtered = filterByRole(scoped, view)
  filtered.sort((a, b) => {
    const order: Record<ActionItem['category'], number> = {
      overdue: 0,
      today: 1,
      'this-week': 2,
      'data-quality': 3,
      'ai-insight': 4,
    }
    if (order[a.category] !== order[b.category]) {
      return order[a.category] - order[b.category]
    }
    return b.urgencyScore - a.urgencyScore
  })
  return { view, items: filtered }
}
