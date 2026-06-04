/*
 * Step 3 role priority-queue board. The "My work" pattern: 4-5 urgency-
 * ordered stat-tiles + the active tile's filtered list. Nothing else - no
 * wall of charts. Tiles are links (filter via ?tile=<key>); the most urgent
 * tile is the default. Server-rendered, no client state.
 */

import Link from 'next/link'
import type { QueueTile, TileTone } from '@/lib/dashboard/roleQueues'

const TONE_RING: Record<TileTone, string> = {
  alert: 'border-signal-alert/40',
  attention: 'border-amber-300',
  navy: 'border-brand-navy/30',
  neutral: 'border-border',
  ok: 'border-emerald-300',
}
const TONE_COUNT: Record<TileTone, string> = {
  alert: 'text-signal-alert',
  attention: 'text-amber-700',
  navy: 'text-brand-navy',
  neutral: 'text-slate-600',
  ok: 'text-emerald-700',
}

export function RoleQueueBoard({
  basePath,
  tiles,
  activeTileKey,
}: {
  basePath: string
  tiles: QueueTile[]
  activeTileKey: string | null
}) {
  const active = tiles.find((t) => t.key === activeTileKey) ?? tiles[0] ?? null

  return (
    <div className="space-y-6" data-testid="role-queue-board">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="queue-tiles">
        {tiles.map((t) => {
          const isActive = active?.key === t.key
          return (
            <Link
              key={t.key}
              href={`${basePath}?tile=${encodeURIComponent(t.key)}`}
              data-testid={`tile-${t.key}`}
              data-active={isActive ? 'true' : 'false'}
              aria-current={isActive ? 'true' : undefined}
              className={
                'flex flex-col rounded-lg border bg-card p-4 transition hover:shadow-sm '
                + (isActive ? 'ring-2 ring-brand-navy ' : '')
                + TONE_RING[t.tone]
              }
            >
              <span className={'text-3xl font-semibold ' + TONE_COUNT[t.tone]} data-testid={`tile-count-${t.key}`}>
                {t.count}
              </span>
              <span className="mt-1 text-sm font-medium text-brand-navy">{t.label}</span>
              <span className="mt-0.5 text-xs text-slate-500">{t.hint}</span>
            </Link>
          )
        })}
      </div>

      {active && (
        <section className="rounded-lg border border-border bg-card" data-testid="queue-list">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold text-brand-navy">
              {active.label} <span className="ml-1 text-slate-400">({active.count})</span>
            </h2>
            <span className="text-xs text-slate-500">{active.hint}</span>
          </header>
          {active.items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500" data-testid="queue-empty">
              Nothing here right now.
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {active.items.map((it) => (
                <li key={it.mouId + it.href}>
                  <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40" data-testid={`queue-row-${it.mouId}`}>
                    <span className="min-w-0 flex-1 truncate font-medium text-brand-navy">{it.schoolName}</span>
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{it.programme} · {it.academicYear}</span>
                    <span className="shrink-0 text-xs text-slate-600">{it.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
