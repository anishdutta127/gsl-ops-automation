/*
 * ReportCard (Gate 5A Step 1).
 *
 * Server-component card used on the /reports index. Icon + title +
 * description; the whole card is a click-through link to the report
 * route.
 */

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

interface ReportCardProps {
  href: string
  title: string
  description: string
  icon: LucideIcon
  testId: string
}

export function ReportCard({
  href,
  title,
  description,
  icon: Icon,
  testId,
}: ReportCardProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-teal/10 text-brand-teal">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-brand-navy">
            {title}
          </h2>
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
          />
        </div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
    </Link>
  )
}
