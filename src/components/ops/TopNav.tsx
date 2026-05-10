/*
 * TopNav (DESIGN.md "Surface 1" + cross-cutting nav).
 *
 * Gate 1 Step 3 rewrites the nav from a flat link list into a
 * workflow-stage bar with seven stages: Pipeline, Active MOUs,
 * Dispatch, Finance, Operations, Reports, Admin. The active stage
 * shows a department-coloured underline and bolder weight. Each
 * stage carries a small dot indicator when the current user's
 * primary department maps to that stage (e.g., a Sales user gets
 * a teal dot under Pipeline; an Ops user gets orange dots under
 * Dispatch and Operations).
 *
 * Three visual principles locked here for every subsequent gate:
 *   1. Workflow-stage navigation, not feature-module navigation.
 *   2. Department badge as visual filter, not hard wall: same nav
 *      for every role, with dept dots as orientation hints.
 *   3. Three-tier information density (overview / lane / detail);
 *      this nav is the overview-tier entry point.
 *
 * The mobile drawer (TopNavMobile) renders the same structure under
 * a hamburger affordance.
 */

import Link from 'next/link'
import { LayoutGrid, LogOut } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import type { Department, User } from '@/lib/types'
import { accentFor, type StageDepartment } from '@/lib/departmentAccents'
import { NotificationBell } from './NotificationBell'
import { TopNavMobile } from './TopNavMobile'

interface NavStage {
  href: string
  label: string
  /** Department this stage primarily belongs to; drives the dot indicator. */
  department: StageDepartment
}

export const NAV_STAGES: NavStage[] = [
  { href: '/sales-pipeline', label: 'Pipeline', department: 'sales' },
  { href: '/mous', label: 'Active MOUs', department: 'cross-functional' },
  { href: '/dispatch', label: 'Dispatch', department: 'ops' },
  { href: '/finance', label: 'Finance', department: 'finance' },
  { href: '/operations', label: 'Operations', department: 'ops' },
  { href: '/reports', label: 'Reports', department: 'neutral' },
  { href: '/admin', label: 'Admin', department: 'neutral' },
]

const HELP_HREF = '/help'

function isStageActive(currentPath: string | undefined, stageHref: string): boolean {
  if (!currentPath) return false
  if (currentPath === stageHref) return true
  return currentPath.startsWith(stageHref + '/')
}

/**
 * A stage's dot indicator surfaces only when the current user's
 * department maps to that stage. Cross-functional and neutral
 * stages never carry a dot; null department (Admin / Leadership)
 * sees no dots either since their lane is "everything".
 */
function shouldShowDeptDot(user: User | null, stageDept: StageDepartment): boolean {
  if (!user || !user.active) return false
  const userDept: Department = user.department ?? null
  if (userDept === null) return false
  return userDept === stageDept
}

interface TopNavProps {
  currentPath?: string
}

export async function TopNav({ currentPath }: TopNavProps = {}) {
  const user = await getCurrentUser()

  return (
    <nav
      className="sticky top-0 z-40 border-b border-border bg-brand-navy text-white"
      aria-label="Primary navigation"
      data-testid="topnav"
    >
      <div className="mx-auto flex min-h-12 max-w-screen-xl items-stretch justify-between px-2 sm:px-4">
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          <Link
            href="/"
            data-testid="topnav-wordmark"
            aria-label="GSL Ops home"
            className="flex shrink-0 items-center gap-1.5 px-3 font-heading text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <LayoutGrid aria-hidden className="size-4 text-brand-teal" />
            <span>GSL Ops</span>
          </Link>
          {/* Desktop stage list */}
          <ul className="hidden items-stretch overflow-x-auto md:flex">
            {NAV_STAGES.map((stage) => {
              const active = isStageActive(currentPath, stage.href)
              const accent = accentFor(stage.department)
              const dot = shouldShowDeptDot(user, stage.department)
              return (
                <li key={stage.href} className="flex">
                  <Link
                    href={stage.href}
                    aria-current={active ? 'page' : undefined}
                    data-testid={`topnav-stage-${stage.label.replace(/\s+/g, '-').toLowerCase()}`}
                    data-stage-active={active ? 'true' : 'false'}
                    data-stage-dept={stage.department}
                    className={
                      'relative flex min-h-11 items-center gap-1.5 px-3 text-sm text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal ' +
                      (active
                        ? 'border-b-2 font-semibold ' + accent.navUnderlineClass
                        : 'border-b-2 border-transparent font-medium')
                    }
                  >
                    <span>{stage.label}</span>
                    {dot ? (
                      <span
                        aria-hidden
                        data-testid={`topnav-dept-dot-${stage.label.replace(/\s+/g, '-').toLowerCase()}`}
                        className={'size-1.5 rounded-full ' + accent.navDotClass}
                      />
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
          {/* Mobile drawer trigger */}
          <TopNavMobile
            stages={NAV_STAGES}
            currentPath={currentPath}
            userDepartment={user?.department ?? null}
            helpHref={HELP_HREF}
          />
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href={HELP_HREF}
            aria-current={isStageActive(currentPath, HELP_HREF) ? 'page' : undefined}
            className={
              'hidden min-h-11 items-center px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal sm:flex ' +
              (isStageActive(currentPath, HELP_HREF)
                ? 'border-b-2 border-brand-teal'
                : 'border-b-2 border-transparent')
            }
          >
            Help
          </Link>
          <span aria-hidden className="hidden h-6 w-px bg-white/20 sm:inline-block" />
          {user ? <NotificationBell user={user} /> : null}
          {user ? (
            <span className="hidden text-sm text-white/80 sm:inline" aria-label="Signed in as">
              {user.name}
            </span>
          ) : null}
          <form action="/api/logout" method="POST" className="flex items-center">
            <button
              type="submit"
              className="flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              aria-label="Sign out"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
