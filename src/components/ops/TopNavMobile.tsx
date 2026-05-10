'use client'

/*
 * TopNavMobile (Gate 1 Step 3): hamburger drawer surfacing the same
 * 7-stage workflow nav under <md breakpoints. Renders as a button on
 * the navy bar; tapping opens a fixed full-height overlay with the
 * stage list, dept dots, Help, and the user's name.
 *
 * Client component because it owns the open / close state. The
 * stages, current path, and user's department are passed in from
 * the server-rendered TopNav so this component does no IO.
 *
 * Reduced motion: no transition on the overlay; honours
 * prefers-reduced-motion via the parent CSS layer (no animations
 * defined here at all).
 */

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { accentFor, type StageDepartment } from '@/lib/departmentAccents'
import type { Department } from '@/lib/types'

interface NavStage {
  href: string
  label: string
  department: StageDepartment
}

interface TopNavMobileProps {
  stages: NavStage[]
  currentPath?: string
  userDepartment: Department
  helpHref: string
}

function isStageActive(currentPath: string | undefined, stageHref: string): boolean {
  if (!currentPath) return false
  if (currentPath === stageHref) return true
  return currentPath.startsWith(stageHref + '/')
}

function shouldShowDeptDot(userDepartment: Department, stageDept: StageDepartment): boolean {
  if (userDepartment === null) return false
  return userDepartment === stageDept
}

export function TopNavMobile({
  stages,
  currentPath,
  userDepartment,
  helpHref,
}: TopNavMobileProps) {
  const [open, setOpen] = useState(false)

  // Close on route change (currentPath prop change indicates navigation).
  useEffect(() => {
    setOpen(false)
  }, [currentPath])

  // Esc to close, body scroll lock while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="topnav-mobile-drawer"
        data-testid="topnav-mobile-trigger"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center justify-center px-3 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal md:hidden"
      >
        {open ? (
          <X aria-hidden className="size-5" />
        ) : (
          <Menu aria-hidden className="size-5" />
        )}
      </button>
      {open ? (
        <div
          id="topnav-mobile-drawer"
          data-testid="topnav-mobile-drawer"
          className="fixed inset-0 top-12 z-30 flex flex-col bg-brand-navy md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
        >
          <ul className="flex flex-col gap-1 px-4 py-4">
            {stages.map((stage) => {
              const active = isStageActive(currentPath, stage.href)
              const accent = accentFor(stage.department)
              const dot = shouldShowDeptDot(userDepartment, stage.department)
              return (
                <li key={stage.href}>
                  <Link
                    href={stage.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      'flex min-h-11 items-center justify-between rounded-md px-3 py-2 text-base text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal ' +
                      (active
                        ? 'border-l-4 font-semibold ' + accent.navUnderlineClass
                        : 'border-l-4 border-transparent font-medium')
                    }
                  >
                    <span>{stage.label}</span>
                    {dot ? (
                      <span
                        aria-hidden
                        className={'size-2 rounded-full ' + accent.navDotClass}
                      />
                    ) : null}
                  </Link>
                </li>
              )
            })}
            <li className="mt-4 border-t border-white/20 pt-4">
              <Link
                href={helpHref}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-md px-3 py-2 text-base font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                Help
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </>
  )
}
