# gate-phase1-nav (Phase 1.2): nav simplification + Advanced area

_Date: 2026-06-24. Plan approved before applying (the Phase 1 route/dependency audit)._

## What changed (hide, don't delete)
- **Watch consolidated** to one **Overview** (`/work`) + **Reports**. Pulse, Pipeline,
  Attention removed from the everyday nav.
- **Finance nav** trimmed to My finance work + Payments. Removed: Dispatch requests,
  Proforma invoices, Adjustments, Tally export.
- **Ops nav** trimmed: removed Deliveries, Welcome notes, Recce (kept My ops work,
  Review queue, Dispatch, Escalations, VEX). Ops nav is provisional pending Ops-user
  validation.
- **Advanced area** added at `/admin/advanced`: a directory of every moved surface,
  grouped (Dashboards/boards, Finance, Operations). Reachable by ANY authenticated
  user (no admin role guard, mirroring the `/admin` index); each linked route keeps
  its own server-side permission gate.
- Only `src/lib/nav/navModel.ts` + one new page changed the nav. **No routes or logic
  were deleted or moved.** VEX orders, reports and Tally read PI/dispatch data
  directly (not via the nav), so hiding those nav entries does not affect them.

## Verification (V4, live prod, logged in as anish.d)
All PASS (`gsl-ops-automation.vercel.app`, after the deploy went live):

| Check | Result |
|---|---|
| Sidebar HIDES /kanban, /dashboard/exceptions, /dashboard/leadership | PASS |
| Sidebar HIDES /finance/{dispatch-requests, pi/pending, adjustments, tally-export} | PASS |
| Sidebar HIDES /operations/{welcome, recce}, /dispatch/kits/summary | PASS |
| Sidebar SHOWS Advanced (/admin/advanced) | PASS |
| /admin/advanced renders (HTTP 200) and lists the moved surfaces | PASS |
| VEX orders /operations/vex still works | PASS (HTTP 200) |
| Reports /reports still works | PASS (HTTP 200) |
| Proforma /finance/pi/pending still works (off-nav, route intact) | PASS (HTTP 200) |
| Pulse /dashboard/leadership still works (off-nav, route intact) | PASS (HTTP 200) |

Unit: navModel + TopNav tests updated and green (59 tests); `npm run build` green.

## Residual / notes
- Ops nav not yet validated with Ops users (per the owner) - treat as provisional.
- The Advanced page renders inside the existing `/admin` chrome (the admin sub-nav);
  acceptable since `/admin` is reachable by all authenticated users. Non-admins use
  the body links (each gated by its own route).
- Phase 1.3 (product-card landing) and 1.4 (user-managed product registry) are NOT
  in this pass (one phase per go). The "Overview" nav entry still points at the
  existing `/work` landing; Phase 1.3 will rebuild that surface.
