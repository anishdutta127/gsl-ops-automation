/*
 * PageHeader.
 *
 * Title + optional breadcrumb + optional action slot. Used at the
 * top of every page below the TopNav. Keeps title typography
 * consistent (Montserrat 24px navy per DESIGN.md "Surface 1 /
 * Header band") across all surfaces.
 */

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-screen-xl px-4 py-4">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumb.map((item, idx) => {
              const last = idx === breadcrumb.length - 1
              return (
                <span key={`${item.label}-${idx}`} className="flex items-center gap-1">
                  {item.href && !last ? (
                    <Link
                      href={item.href}
                      className="hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={last ? 'text-brand-navy' : undefined}>
                      {item.label}
                    </span>
                  )}
                  {!last ? <ChevronRight aria-hidden className="size-3" /> : null}
                </span>
              )
            })}
          </nav>
        ) : null}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold text-brand-navy">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}
