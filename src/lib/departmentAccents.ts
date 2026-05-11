/*
 * Department accent palette for the unified GSL Ops Platform.
 *
 * Gate 1 Step 3 introduces three workflow-stage accents on top of the
 * existing brand-teal + brand-navy. Sales preserves the existing
 * navy / teal branding; Ops gets orange (carrying the convention from
 * the HR Ops module); Finance gets a deep violet. Cross-functional
 * stages use a neutral grey or a subtle three-way gradient.
 *
 * Tailwind built-in palettes (orange-*, violet-*, slate-*) are used
 * directly per DESIGN.md "Tooling notes": Tailwind classes are
 * acceptable substitutes for raw hex values because they resolve
 * through the framework's token layer, not inline literals.
 *
 * AA contrast on the navy nav bar (#073393):
 *   teal-300 (#5EEAD4) on navy: ~7.4:1 ✓
 *   orange-400 (#FB923C) on navy: ~5.4:1 ✓
 *   violet-400 (#A78BFA) on navy: ~5.0:1 ✓
 * AA contrast on white:
 *   brand-teal (#00D8B9) on white: 2.3:1 ✗ for text; OK as dot/underline only
 *   orange-700 (#C2410C) on white: 5.3:1 ✓
 *   violet-700 (#6D28D9) on white: 7.0:1 ✓
 *
 * The classes returned distinguish navy-bar use ('onDark') from
 * white-card use ('onLight'). Components pick the right slot.
 */

import type { Department } from './types'

/**
 * Possible accent contexts. Excludes the null Department because
 * callers with a null department pick 'cross-functional' or 'neutral'
 * explicitly (Record keys cannot be null in TypeScript).
 */
export type StageDepartment =
  | 'sales'
  | 'ops'
  | 'finance'
  | 'cross-functional'
  | 'neutral'

export interface DepartmentAccent {
  /** Active-stage underline + active-link weight on the navy TopNav. */
  navUnderlineClass: string
  /** Dot indicator next to the user's primary dept stages on the navy TopNav. */
  navDotClass: string
  /** Body-tier accent border for dashboard cards. */
  cardBorderClass: string
  /** Small badge background for dept tags on white cards. */
  badgeBgClass: string
  /** Accent text colour on white cards (passes AA). */
  badgeTextClass: string
  /** Human-readable label for the badge. */
  label: string
}

const ACCENTS: Record<StageDepartment, DepartmentAccent> = {
  sales: {
    navUnderlineClass: 'border-brand-teal',
    navDotClass: 'bg-brand-teal',
    cardBorderClass: 'border-l-brand-navy',
    badgeBgClass: 'bg-brand-navy/10',
    badgeTextClass: 'text-brand-navy',
    label: 'Sales',
  },
  ops: {
    navUnderlineClass: 'border-orange-400',
    navDotClass: 'bg-orange-400',
    cardBorderClass: 'border-l-orange-500',
    badgeBgClass: 'bg-orange-100',
    badgeTextClass: 'text-orange-700',
    label: 'Operations',
  },
  finance: {
    navUnderlineClass: 'border-violet-400',
    navDotClass: 'bg-violet-400',
    cardBorderClass: 'border-l-violet-500',
    badgeBgClass: 'bg-violet-100',
    badgeTextClass: 'text-violet-700',
    label: 'Finance',
  },
  'cross-functional': {
    navUnderlineClass: 'border-white',
    navDotClass: 'bg-white',
    cardBorderClass: 'border-l-slate-400',
    badgeBgClass: 'bg-slate-100',
    badgeTextClass: 'text-slate-700',
    label: 'Cross-functional',
  },
  neutral: {
    navUnderlineClass: 'border-white/60',
    navDotClass: 'bg-white/60',
    cardBorderClass: 'border-l-slate-300',
    badgeBgClass: 'bg-slate-100',
    badgeTextClass: 'text-slate-600',
    label: 'Neutral',
  },
} satisfies Record<StageDepartment, DepartmentAccent>

/**
 * Resolves the accent palette. A null Department from a caller is
 * normalised to the cross-functional accent (white-on-navy underline,
 * slate badges on white cards) since null means Admin / Leadership
 * without a workflow-stage commitment.
 */
export function accentFor(
  stageDept: StageDepartment | Department,
): DepartmentAccent {
  if (stageDept === null) return ACCENTS['cross-functional']
  return ACCENTS[stageDept] ?? ACCENTS.neutral
}

/**
 * Maps a User's department to the post-login landing route.
 *
 * Gate 3.6 collapses every role + department to the consolidated
 * landing at `/`. The landing's drill-down tiles route each
 * department to its dedicated workspace one click away; the
 * per-department dashboard routes (/dashboard/sales,
 * /dashboard/ops, /dashboard/finance, /dashboard/leadership)
 * stay reachable for direct navigation. Production lockdown
 * would restore per-department routing here; the testing-mode
 * default is universal.
 *
 * `args` retained for call-site stability and future un-collapse;
 * the unused values are intentional during testing mode.
 */
export function dashboardPathForDepartment(_args: {
  department: Department
  role: 'Admin' | 'Leadership' | string
}): string {
  return '/'
}
