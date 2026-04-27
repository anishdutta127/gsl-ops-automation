/*
 * MouCard (Week 3 W3-C C1; kanban card).
 *
 * Compact card surface visible inside a kanban column. Click navigates
 * to /mous/[id] for the existing detail page (preserves the back-button
 * scroll-restore that browsers handle for free). Touch target is the
 * full card; min-h is set so the tap area meets the 44px spec on
 * mobile.
 *
 * C1 data shape (refined per recon):
 *   - school name (truncated to 32 chars; full text in title attribute)
 *   - MOU id (mono, small)
 *   - programme + sub-type (small; sub-type only when non-null)
 *   - drift badge if mou.studentsVariancePct exceeds +/- 10%
 *   - status badge if status !== 'Active' (e.g., Pending Signature)
 *
 * Deferred to C2/C3:
 *   - days-on-card (needs stage-entry timestamps)
 *   - overdue badge (needs lifecycle rules from W3-D)
 *   - drag handle / drag listeners (C2)
 */

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { MOU } from '@/lib/types'
import { hasDrift } from '@/lib/kanban/deriveStage'

const SCHOOL_NAME_MAX = 32

interface MouCardProps {
  mou: MOU
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1).trimEnd() + '…'
}

export function MouCard({ mou }: MouCardProps) {
  const fullName = mou.schoolName
  const displayName = truncate(fullName, SCHOOL_NAME_MAX)
  const programmeLabel = mou.programmeSubType
    ? `${mou.programme} / ${mou.programmeSubType}`
    : mou.programme
  const drift = hasDrift(mou)
  const showStatusBadge = mou.status !== 'Active'

  return (
    <Link
      href={`/mous/${mou.id}`}
      className="block rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy min-h-[88px]"
      title={fullName}
      data-testid="mou-card"
      data-mou-id={mou.id}
    >
      <div className="font-medium text-foreground">{displayName}</div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{mou.id}</div>
      <div className="mt-1 text-xs text-muted-foreground">{programmeLabel}</div>
      {(drift || showStatusBadge) ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {drift ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-signal-attention bg-card px-2 py-0.5 text-[11px] font-medium text-signal-attention"
              data-testid="drift-badge"
            >
              <AlertTriangle aria-hidden className="size-3" />
              Drift
            </span>
          ) : null}
          {showStatusBadge ? (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground">
              {mou.status}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  )
}
