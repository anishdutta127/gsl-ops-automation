/*
 * /overview (W4-I.5 P2C5 redirect).
 *
 * Pre-W4-I.5 this route hosted the Leadership Console (5 health
 * tiles + exception feed + open-escalation list + 10 trigger tiles).
 * The new Operations Control Dashboard at / consolidates that
 * surface; this route now permanent-redirects there for bookmark
 * compatibility.
 *
 * D-XXX (OverviewContent migration audit): captured in P2C5 commit
 * message which bits migrated cleanly, which got reshaped, and which
 * are deferred. The OverviewContent component itself is preserved
 * for callers that may still want it (none in Phase 1 outside this
 * route).
 */

import { redirect } from 'next/navigation'

export default async function OverviewRedirect() {
  redirect('/')
}
