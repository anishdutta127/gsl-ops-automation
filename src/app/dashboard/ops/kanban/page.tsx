/*
 * /dashboard/ops/kanban (Gate 5A.7 Step 2 unification).
 *
 * Permanent redirect to /kanban?view=operations. The two Kanban
 * surfaces were collapsed into one route with a view toggle; this
 * route is preserved so existing deep links (and the OpsKanbanTile
 * from earlier sessions) keep working. Search params are forwarded
 * verbatim alongside the view=operations sentinel.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpsKanbanRedirectPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const params = new URLSearchParams()
  params.set('view', 'operations')
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'view') continue
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.set(k, v)
    }
  }
  redirect(`/kanban?${params.toString()}`)
}
