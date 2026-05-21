/*
 * /dashboard (W4-I.5 P2C5 redirect).
 *
 * Pre-W4-I.5 this route was an alias of /overview (Leadership
 * Console: 5 health tiles + 9 trigger tiles + exception feed).
 * Phase 2 commits 1-4 built the new Operations Control Dashboard
 * here; P2C5 moved that dashboard to / and replaced this route with
 * a permanent redirect for bookmark + audit-link compatibility.
 *
 * Forwards searchParams so saved filter URLs (?programme=STEAM)
 * keep working post-migration.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DashboardRedirect({ searchParams }: PageProps) {
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') params.set(k, v)
  }
  const qs = params.toString()
  // Phase 6F (2026-05-21): /dashboard was a redirect to /. The action-
  // first homepage now lives at /; bookmarks to /dashboard expecting
  // the legacy 5-zone view get the new /dashboard/overview route
  // instead. Search params still forward.
  redirect(qs === '' ? '/dashboard/overview' : `/dashboard/overview?${qs}`)
}
