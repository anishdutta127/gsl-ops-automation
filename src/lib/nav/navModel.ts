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
      // Phase 1.2 (2026-06-24): Watch consolidated to a single Overview entry
      // (the role-scoped daily landing at /work) plus Reports. Pulse
      // (/dashboard/leadership), Pipeline (/kanban) and Attention
      // (/dashboard/exceptions) are taken OFF the everyday nav; their routes +
      // logic are intact and reachable from Admin -> Advanced and by deep link.
      { href: '/work', label: 'Overview', testId: 'nav-home' },
      {
        href: '/reports',
        label: 'Reports',
        testId: 'nav-reports',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Work · Finance',
    testId: 'nav-zone-finance',
    department: 'finance',
    items: [
      // Step 4: the Step-3 Finance priority board is now the focus queue.
      {
        href: '/work/finance',
        label: 'My finance work',
        testId: 'nav-fin-home',
      },
      {
        href: '/finance/payments',
        label: 'Payments',
        testId: 'nav-fin-payments',
        interimNote:
          'Phase 2 consolidates the five payment-entry routes into one Payments surface.',
      },
      // Phase 1.2: Dispatch requests, Proforma invoices, Adjustments and Tally
      // export are moved off the everyday nav to Admin -> Advanced. Their
      // routes + logic are intact (VEX orders, reports and Tally read this data
      // directly, not via the nav), so nothing downstream breaks.
    ],
  },
  {
    id: 'operations',
    label: 'Work · Operations',
    testId: 'nav-zone-operations',
    department: 'ops',
    items: [
      // Step 4: the Step-3 Ops priority board is now the focus queue.
      {
        href: '/work/ops',
        label: 'My ops work',
        testId: 'nav-ops-home',
      },
      {
        // Step 4: the Step-2 two-process review queue.
        href: '/operations/review',
        label: 'Review queue',
        testId: 'nav-ops-review',
      },
      {
        href: '/dispatch/kits',
        label: 'Dispatch',
        testId: 'nav-ops-dispatch',
        activePaths: ['/dispatch'],
      },
      // Phase 1.2: Deliveries, Welcome notes and Recce moved off the everyday
      // nav to Admin -> Advanced (routes + logic intact). Ops nav is provisional
      // pending validation with Ops users.
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
    items: [
      { href: '/admin', label: 'Admin', testId: 'nav-admin' },
      // Phase 1.2: directory of surfaces moved off the everyday nav. Reachable
      // by any authenticated user (not admin-locked); each linked route keeps
      // its own permission gate.
      { href: '/admin/advanced', label: 'Advanced', testId: 'nav-advanced' },
    ],
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
