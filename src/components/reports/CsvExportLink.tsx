/*
 * CsvExportLink (Gate 5A Step 1).
 *
 * Server-component anchor pointing at /api/reports/<slug>/csv with
 * the current filter query string preserved. Renders a download icon
 * and label; positioned by the parent (e.g. top-right of the page
 * header).
 */

import { Download } from 'lucide-react'
import type { ReportSlug } from '@/lib/reports/access'

interface CsvExportLinkProps {
  slug: ReportSlug
  queryString?: string
  testId?: string
}

export function CsvExportLink({
  slug,
  queryString,
  testId,
}: CsvExportLinkProps) {
  const href = queryString
    ? `/api/reports/${slug}/csv?${queryString}`
    : `/api/reports/${slug}/csv`
  return (
    <a
      href={href}
      data-testid={testId ?? `csv-export-${slug}`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <Download aria-hidden className="size-4" />
      Export CSV
    </a>
  )
}
