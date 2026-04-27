/*
 * SchoolsNeedingDataTile (W3-C C3; kanban header banner).
 *
 * Renders above the kanban columns: surfaces the count of schools
 * with at least one missing critical field (gstNumber, email,
 * contactPerson, pinCode). Click navigates to /schools?incomplete=yes
 * which sorts the list "most missing first" via the dataCompleteness
 * lib helper.
 *
 * Status colour: amber (signal-attention) when count > 0; green
 * (signal-ok) when count === 0. Per the W3-C C3 spec, this tile is
 * the first thing testers see, so the visual urgency must match
 * the operational state.
 */

import Link from 'next/link'
import { AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react'

interface SchoolsNeedingDataTileProps {
  count: number
  total: number
}

export function SchoolsNeedingDataTile({ count, total }: SchoolsNeedingDataTileProps) {
  const allComplete = count === 0
  const wrapperClass = allComplete
    ? 'border-signal-ok bg-card'
    : 'border-signal-attention bg-card'
  const iconClass = allComplete ? 'text-signal-ok' : 'text-signal-attention'
  const Icon = allComplete ? CheckCircle : AlertTriangle
  const headline = allComplete
    ? `All ${total} schools have complete data.`
    : `${count} of ${total} schools missing GSTIN, email, contact, or PIN code.`
  const subline = allComplete
    ? 'GSTIN backfill, SPOC contact details, PIN codes: all populated.'
    : 'PI generation, SPOC outreach, and dispatch routing block on missing fields. Click to triage worst-case schools first.'

  return (
    <Link
      href="/schools?incomplete=yes"
      className={`flex items-start gap-3 rounded-lg border p-4 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${wrapperClass}`}
      data-testid="schools-needing-data-tile"
      data-count={String(count)}
    >
      <Icon aria-hidden className={`size-5 shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-base font-semibold text-brand-navy">
          Schools needing data
        </p>
        <p className="mt-0.5 text-sm text-foreground">{headline}</p>
        <p className="mt-1 text-xs text-muted-foreground">{subline}</p>
      </div>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
