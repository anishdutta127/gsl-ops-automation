/*
 * /dashboard/ops (Gate 3.5 Step 6: redirect to /).
 *
 * Pre-Gate-3.5 this was a 59-LOC dashboard skeleton with 4 plain
 * action-card links. Per Anish-confirmed audit decision (docs/
 * gate-3.5/CURRENT_STATE.md section 6.1), the canonical Ops dashboard
 * is `/` (Operations Control Dashboard); the rich KPI tiles + recent
 * MOU updates + action centre + orders tracker + comm panel already
 * live there. To remove the route ambiguity, this page now redirects
 * every authenticated request to `/`. Tests that pointed at this
 * URL continue to land on the Ops cockpit without code changes.
 *
 * Un-redirect path: if a per-department landing experience returns
 * in a later gate, replace the redirect with a dedicated server
 * component reading the same `src/lib/dashboard/dashboardData` helpers
 * that `/` uses.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'

export default async function OpsDashboardRedirect() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')
  redirect('/')
}
