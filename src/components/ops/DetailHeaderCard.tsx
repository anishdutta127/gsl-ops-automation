/*
 * DetailHeaderCard.
 *
 * The standard header for entity detail pages (/mous/[id],
 * /schools/[id], /escalations/[id]). Anatomy:
 *   - Title (Montserrat 24px navy, matches PageHeader)
 *   - Optional subtitle (Open Sans 14px slate)
 *   - Optional status pill on the right (any badge: status, lane,
 *     etc.; caller passes ReactNode)
 *   - Metadata grid: list of { label, value } pairs in 2-col grid
 *     desktop / 1-col mobile
 *   - Optional action row at the bottom (buttons / links)
 *
 * Use under the standard PageHeader, not as a replacement: PageHeader
 * carries the breadcrumb; DetailHeaderCard carries the entity-state
 * summary.
 */

import type { ReactNode } from 'react'

export interface MetadataItem {
  label: string
  value: ReactNode
}

interface DetailHeaderCardProps {
  title: string
  subtitle?: string
  statusBadge?: ReactNode
  metadata?: MetadataItem[]
  actions?: ReactNode
}

export function DetailHeaderCard({
  title,
  subtitle,
  statusBadge,
  metadata,
  actions,
}: DetailHeaderCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-brand-navy sm:text-2xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {statusBadge ? <div className="shrink-0">{statusBadge}</div> : null}
      </header>
      {metadata && metadata.length > 0 ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {metadata.map((item, idx) => (
            <div key={`${item.label}-${idx}`} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {actions}
        </div>
      ) : null}
    </section>
  )
}
