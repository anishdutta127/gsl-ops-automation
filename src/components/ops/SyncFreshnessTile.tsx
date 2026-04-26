/*
 * SyncFreshnessTile (Phase E).
 *
 * Sixth health tile on the Leadership Console. Reads
 * src/data/sync_health.json (latest entry) and renders a relative-
 * time freshness indicator with a green/amber/red status bucket:
 *   - <2h: ok (green)
 *   - 2-24h: attention (amber)
 *   - >24h or no entry yet: alert (red)
 *
 * Click navigates to /admin where the operator can manually
 * trigger another sync. Phase 1.1 may add /admin/sync-health for
 * a richer history view.
 *
 * The tile follows DESIGN.md "Surface 1 / Health tile" anatomy
 * (label / primary / unit / status dot).
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TileStatus } from './HealthTile'

const STATUS_DOT: Record<TileStatus, string> = {
  ok: 'bg-[var(--signal-ok)]',
  attention: 'bg-[var(--signal-attention)]',
  alert: 'bg-[var(--signal-alert)]',
  neutral: 'bg-[var(--signal-neutral)]',
}

const STATUS_LABEL: Record<TileStatus, string> = {
  ok: 'Healthy',
  attention: 'Needs attention',
  alert: 'Action required',
  neutral: 'Informational',
}

export interface SyncFreshnessTileProps {
  latestAt: string | null
  ok: boolean
  now?: Date
}

export function bucketForAgeMinutes(
  ageMinutes: number | null,
  ok: boolean,
): TileStatus {
  if (ageMinutes === null) return 'alert'
  if (!ok) return 'alert'
  if (ageMinutes < 120) return 'ok'
  if (ageMinutes < 24 * 60) return 'attention'
  return 'alert'
}

export function formatRelativeAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'Never'
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${Math.floor(ageMinutes)} min ago`
  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export function SyncFreshnessTile({
  latestAt,
  ok,
  now = new Date(),
}: SyncFreshnessTileProps) {
  let ageMinutes: number | null = null
  if (latestAt !== null && latestAt !== '') {
    const ts = new Date(latestAt).getTime()
    if (Number.isFinite(ts)) {
      ageMinutes = Math.max(0, (now.getTime() - ts) / 60_000)
    }
  }

  const status = bucketForAgeMinutes(ageMinutes, ok)
  const primary = formatRelativeAge(ageMinutes)
  const subText = latestAt === null ? 'No syncs recorded yet' : ok ? 'Last run healthy' : 'Anomaly recorded'

  return (
    <Link
      href="/admin"
      className="relative block rounded-lg border border-[var(--signal-neutral)]/20 bg-card p-4 shadow-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
      role="group"
      aria-label={`Sync freshness: ${primary}, ${STATUS_LABEL[status]}. ${subText}.`}
    >
      <span
        className={cn('absolute right-4 top-4 size-2 rounded-full', STATUS_DOT[status])}
        aria-hidden
      />
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Sync Freshness
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-3xl font-bold text-[var(--brand-navy)]"
          style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
        >
          {primary}
        </span>
      </div>
      <div className="mt-1 text-xs text-[var(--signal-neutral)]">{subText}</div>
    </Link>
  )
}
