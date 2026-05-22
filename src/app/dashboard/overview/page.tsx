/*
 * /dashboard/overview redirect (Phase 6F.1).
 *
 * Phase 6F moved the 5-zone landing here when the action queue took
 * the front door. Phase 6F.1 restored the 5-zone landing to /, so
 * this URL now redirects there. Search params (e.g. saved filter
 * deep-links) forward across the redirect.
 *
 * Kept as a redirect rather than deleted so any bookmarks the user
 * captured during the brief Phase 6F window keep working.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OverviewRedirect({ searchParams }: PageProps) {
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') params.set(k, v)
  }
  const qs = params.toString()
  redirect(qs === '' ? '/' : `/?${qs}`)
}
