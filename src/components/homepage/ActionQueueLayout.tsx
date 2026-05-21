/*
 * ActionQueueLayout (Phase 6F Part 3).
 *
 * The action-first homepage shell. Greeting strip + two columns
 * (Your queue 60% / Team blockers 40%) at desktop; single column
 * with Team blockers behind a toggle at mobile <768px.
 *
 * Server component owns the data; this client component owns the
 * mobile-only toggle. The "Your queue" / "Team blockers" partition
 * is computed server-side based on the requesting user's role.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ActionItem } from '@/lib/homepage/types'
import { ActionCard } from './ActionCard'

interface Props {
  greeting: string
  todayLine: string
  roleTag: string
  yourQueue: ActionItem[]
  teamBlockers: ActionItem[]
  aiInsights: ActionItem[]
  fallbackOverviewHref: string
}

function EmptyTile({ label }: { label: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-slate-600"
      data-testid="action-queue-empty"
    >
      {label}
    </div>
  )
}

export function ActionQueueLayout({
  greeting,
  todayLine,
  roleTag,
  yourQueue,
  teamBlockers,
  aiInsights,
  fallbackOverviewHref,
}: Props) {
  const [showTeamMobile, setShowTeamMobile] = useState(false)
  const [showAiMobile, setShowAiMobile] = useState(false)

  const totalActive =
    yourQueue.length + teamBlockers.length + aiInsights.length
  const fullyClear = totalActive === 0

  return (
    <div
      className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6"
      data-testid="action-queue-root"
    >
      <header className="mb-5">
        <h1 className="font-heading text-2xl font-bold text-brand-navy">{greeting}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {todayLine}
          <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {roleTag}
          </span>
        </p>
      </header>

      {fullyClear ? (
        <div
          className="rounded-lg border border-border bg-brand-teal/10 p-6 text-center"
          data-testid="action-queue-all-clear"
        >
          <p className="text-base font-semibold text-brand-navy">All clear today.</p>
          <p className="mt-1 text-sm text-slate-600">No outstanding actions. Take a breath.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <section
            className="flex flex-col gap-3 lg:flex-1 lg:basis-3/5"
            data-testid="action-queue-yours"
          >
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-slate-700">
              Your queue
            </h2>
            {yourQueue.length === 0 ? (
              <EmptyTile label="All clear in your queue." />
            ) : (
              yourQueue.map((item) => (
                <ActionCard key={item.id} item={item} testIdPrefix="yours" />
              ))
            )}
          </section>

          <section
            className="flex flex-col gap-3 lg:flex-1 lg:basis-2/5"
            data-testid="action-queue-team"
          >
            <h2 className="hidden font-heading text-sm font-semibold uppercase tracking-wide text-slate-700 lg:block">
              Team blockers
            </h2>
            {/* Mobile toggle */}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-brand-navy lg:hidden"
              onClick={() => setShowTeamMobile((s) => !s)}
              data-testid="action-queue-team-toggle"
            >
              {showTeamMobile ? 'Hide' : 'Show'} team blockers ({teamBlockers.length})
            </button>
            <div className={`flex flex-col gap-3 ${showTeamMobile ? 'block' : 'hidden lg:flex'}`}>
              {teamBlockers.length === 0 ? (
                <EmptyTile label="Nothing blocking the team." />
              ) : (
                teamBlockers.map((item) => (
                  <ActionCard key={item.id} item={item} testIdPrefix="team" />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* AI insights row, collapsed by default on mobile */}
      {aiInsights.length > 0 && (
        <section className="mt-6 flex flex-col gap-3" data-testid="action-queue-ai">
          <h2 className="hidden font-heading text-sm font-semibold uppercase tracking-wide text-slate-700 lg:block">
            AI insights
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-brand-navy lg:hidden"
            onClick={() => setShowAiMobile((s) => !s)}
            data-testid="action-queue-ai-toggle"
          >
            {showAiMobile ? 'Hide' : 'Show'} AI insights ({aiInsights.length})
          </button>
          <div className={`flex flex-col gap-3 ${showAiMobile ? 'block' : 'hidden lg:flex'}`}>
            {aiInsights.map((item) => (
              <ActionCard key={item.id} item={item} testIdPrefix="ai" />
            ))}
          </div>
        </section>
      )}

      {/* Below-the-fold link to the legacy overview */}
      <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-slate-600">
        Looking for the legacy 5-zone overview?{' '}
        <Link href={fallbackOverviewHref} className="text-brand-navy underline-offset-2 hover:underline">
          Open the full overview dashboard.
        </Link>
      </footer>
    </div>
  )
}
