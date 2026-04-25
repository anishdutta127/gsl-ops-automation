/*
 * Phase 1 placeholder for routes scaffolded in Item 10.
 * Each route renders this component with its title + a short
 * what-it-will-be description. Replaced by real surfaces during
 * Items 11+ (Ops-specific components + per-stage UI work).
 */

export function RoutePlaceholder({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Phase 1 placeholder.
        {description ? ` ${description}` : ''}
      </p>
    </div>
  )
}
