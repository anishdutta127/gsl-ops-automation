/*
 * DashboardActionCenter (W4-I.5 Phase 2 commit 2).
 *
 * Right-column panel on the middle row. Header carries an "X open"
 * red badge summing the tile counts. Body lists 5 tile rows for
 * pending tasks; clicking a tile navigates to the relevant filtered
 * surface. Footer holds a navy "Review Pending Actions" CTA that
 * links to /mous as the primary work surface.
 *
 * Tile shape inlined here: small leading icon, large bold count, label.
 */

import Link from 'next/link'
import {
  ArrowRight,
  ClipboardList,
  PackageCheck,
  Truck,
  AlertOctagon,
  Boxes,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActionCenterData, ActionCenterTile } from '@/lib/dashboard/dashboardData'

const TILE_ICONS: Record<ActionCenterTile['iconKey'], LucideIcon> = {
  mous: ClipboardList,
  orders: PackageCheck,
  shipments: Truck,
  escalations: AlertOctagon,
  inventory: Boxes,
}

interface TileProps {
  tile: ActionCenterTile
}

function Tile({ tile }: TileProps) {
  const Icon = TILE_ICONS[tile.iconKey]
  return (
    <Link
      href={tile.href}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      data-testid={`action-tile-${tile.key}`}
    >
      <span aria-hidden className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${tile.iconTint}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-base font-semibold leading-tight text-brand-navy tabular-nums">
          {tile.count}
        </span>
        <span className="block text-xs text-muted-foreground">{tile.label}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

export interface DashboardActionCenterProps {
  data: ActionCenterData
  reviewHref?: string
}

export function DashboardActionCenter({
  data,
  reviewHref = '/mous',
}: DashboardActionCenterProps) {
  return (
    <section
      aria-labelledby="action-centre-heading"
      data-testid="dashboard-action-centre"
      className="flex flex-col rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="action-centre-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Action Centre
          </h2>
          <p className="text-xs text-muted-foreground">
            Pending tasks needing attention today.
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full bg-signal-alert px-2 py-0.5 text-[11px] font-semibold text-white"
          data-testid="action-centre-total-badge"
          aria-label={`${data.totalOpen} items open`}
        >
          {data.totalOpen} open
        </span>
      </header>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        {data.tiles.map((tile) => (
          <Tile key={tile.key} tile={tile} />
        ))}
      </div>
      <footer className="border-t border-border p-3 sm:p-4">
        <Link
          href={reviewHref}
          className="inline-flex min-h-11 w-full items-center justify-between rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy"
          data-testid="action-centre-cta"
        >
          <span>Review Pending Actions</span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </footer>
    </section>
  )
}
