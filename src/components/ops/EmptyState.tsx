/*
 * EmptyState (DESIGN.md "Copy conventions / empty states").
 *
 * Used by every list page when no entries match the current filter,
 * and by detail panels when an entity has no items in a section.
 * Copy convention: state the fact, do not over-cheer ("No exceptions
 * right now." not "🎉 All clear!").
 *
 * Anatomy: optional Lucide icon + heading + optional description +
 * optional CTA action slot. Min 96px tall to feel intentional rather
 * than empty.
 */

import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex min-h-24 flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="font-heading text-sm font-semibold text-brand-navy">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
