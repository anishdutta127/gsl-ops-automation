/*
 * Left-nav model (Phase 1 platform redesign, see
 * plans/platform-redesign-review.md Section 3.1).
 *
 * Single source of truth for the WATCH / WORK / RECORDS / ADMIN
 * sidebar structure, shared by the desktop rail (SidebarDesktop) and
 * the mobile drawer (SidebarMobile) so the two never drift.
 *
 * Phase 1 is navigation-only: every item points at a route that
 * ALREADY exists. Items whose design-doc destination does not exist
 * yet (e.g. a unified Payments surface) point at the most sensible
 * existing route and carry an `interimNote` flagging the Phase that
 * will consolidate them. No page content moves in this phase.
 *
 * Active-item resolution uses the real pathname (the components read
 * usePathname) with a longest-prefix-wins rule so a sub-route like
 * /finance/payments highlights "Payments", not the "/finance" index
 * item. Home ('/') is exact-match only, otherwise it would match every
 * route.
 */

import type { Department } from '@/lib/types'

export interface NavItem {
  href: string
  label: string
  testId: string
  /** Extra path prefixes that also activate this item (longest-match wins). */
  activePaths?: string[]
  /** Active only on exact pathname equality. Used by Home ('/') and the
   *  workspace index items (/finance, /operations) so a deeper sibling
   *  route highlights the sibling, not the index. */
  exact?: boolean
  /** Interim destination: a later phase repoints / consolidates this. */
  interimNote?: string
}

export interface NavZone {
  id: string
  label: string
  testId: string
  items: NavItem[]
  /** When set, a small dot shows on this zone label for a user whose
   *  department matches (orientation hint, not a hard wall). */
  department?: Exclude<Department, null>
}

export const NAV_ZONES: NavZone[] = [
  {
    id: 'watch',
    label: 'Watch',
    testId: 'nav-zone-watch',
    items: [
      { href: '/', label: 'Home', testId: 'nav-home', exact: true },
      {
        href: '/dashboard/leadership',
        label: 'Pulse',
        testId: 'nav-pulse',
        interimNote:
          'Phase 7 builds the dedicated Pulse surface; for now this routes to the existing leadership health view.',
      },
      {
        href: '/kanban',
        label: 'Pipeline',
        testId: 'nav-pipeline',
        activePaths: ['/dashboard/ops/kanban'],
      },
      { href: '/dashboard/exceptions', label: 'Attention', testId: 'nav-attention' },
    ],
  },
  {
    id: 'finance',
    label: 'Work · Finance',
    testId: 'nav-zone-finance',
    department: 'finance',
    items: [
      {
        href: '/finance',
        label: 'My finance work',
        testId: 'nav-fin-home',
        exact: true,
        interimNote:
          'Phase 2 builds the finance focus queue; for now this is the Finance workspace index.',
      },
      {
        href: '/finance/payments',
        label: 'Payments',
        testId: 'nav-fin-payments',
        interimNote:
          'Phase 2 consolidates the five payment-entry routes into one Payments surface.',
      },
      {
        href: '/finance/pi/pending',
        label: 'Proforma invoices',
        testId: 'nav-fin-pi',
        activePaths: ['/finance/pi'],
        interimNote:
          'Phase 3 brings MOU PIs and VEX PIs under one Proforma invoices home.',
      },
      { href: '/finance/adjustments', label: 'Adjustments', testId: 'nav-fin-adjustments' },
      { href: '/finance/tally-export', label: 'Tally export', testId: 'nav-fin-tally' },
    ],
  },
  {
    id: 'operations',
    label: 'Work · Operations',
    testId: 'nav-zone-operations',
    department: 'ops',
    items: [
      {
        href: '/operations',
        label: 'My ops work',
        testId: 'nav-ops-home',
        exact: true,
        interimNote:
          'Phase 4 builds the ops focus queue; for now this is the Operations workspace index.',
      },
      {
        href: '/dispatch/kits',
        label: 'Dispatch',
        testId: 'nav-ops-dispatch',
        activePaths: ['/dispatch'],
      },
      {
        href: '/dispatch/kits/summary',
        label: 'Deliveries',
        testId: 'nav-ops-deliveries',
        interimNote:
          'Phase 4 builds a dedicated Deliveries surface; for now this is the dispatch summary with POD links.',
      },
      { href: '/escalations', label: 'Escalations', testId: 'nav-ops-escalations' },
      {
        href: '/operations/vex',
        label: 'VEX / procurement',
        testId: 'nav-ops-vex',
        activePaths: ['/operations/vex', '/operations/vendors', '/operations/agreements'],
      },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    testId: 'nav-zone-records',
    items: [
      { href: '/mous', label: 'MOUs', testId: 'nav-mous' },
      { href: '/schools', label: 'Schools', testId: 'nav-schools' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    testId: 'nav-zone-admin',
    items: [{ href: '/admin', label: 'Admin', testId: 'nav-admin' }],
  },
]

function matchLen(pathname: string, candidate: string): number {
  if (pathname === candidate) return candidate.length
  if (candidate !== '/' && pathname.startsWith(candidate + '/')) return candidate.length
  return -1
}

/** Match score for one item against the current path; -1 means no match. */
export function itemScore(pathname: string, item: NavItem): number {
  if (item.exact) return pathname === item.href ? item.href.length : -1
  let best = matchLen(pathname, item.href)
  for (const p of item.activePaths ?? []) best = Math.max(best, matchLen(pathname, p))
  return best
}

/**
 * The single active item's testId for a given pathname, or null when no
 * item matches. Longest match wins so /finance/payments resolves to the
 * Payments item rather than the /finance index item.
 */
export function activeTestId(pathname: string): string | null {
  let bestId: string | null = null
  let bestScore = -1
  for (const zone of NAV_ZONES) {
    for (const item of zone.items) {
      const score = itemScore(pathname, item)
      if (score > bestScore) {
        bestScore = score
        bestId = item.testId
      }
    }
  }
  return bestScore >= 0 ? bestId : null
}
