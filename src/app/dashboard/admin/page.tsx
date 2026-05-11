/*
 * /dashboard/admin redirect (Gate 3.6 Step 4).
 *
 * Gate 3.6 introduces the consolidated landing at /. The dedicated
 * Admin landing at /admin still serves Admin toolbox work; this
 * /dashboard/admin alias exists only so bookmarks landing here are
 * routed to / (the consolidated landing) rather than 404. Add this
 * route to the redirect set rather than mounting a separate page.
 *
 * Production lockdown decision: if a per-department Admin landing
 * returns, replace this redirect with a real server component.
 */

import { redirect } from 'next/navigation'

export default async function DashboardAdminRedirect() {
  redirect('/')
}
