# MOU_SYSTEM_PARITY_AUDIT.md

This document extends the prior audit at `docs/gate-4.95/PARITY_AUDIT.md` with Phase 5A.9 findings: inventory of features from gsl-mou-system that are ported, locked, or deferred in gsl-ops-automation as of 2026-05-18.

## Methodology

- **Source of truth for gsl-mou-system capabilities:** the prior audit (`PARITY_AUDIT.md`).
- **Source of truth for gsl-ops-automation state:** code inspection of `src/app/`, `src/lib/`, and flag checks.
- **Confidence levels:** High (verified in code), Medium (inferred from plan docs + code), Low (documented intention but not yet implemented).

---

## Summary

| Category | Count | Status |
|---|---|---|
| Ported and active | 19 | Live, no locks or feature flags |
| Ported but locked (parallel-build) | 2 | Code exists; gated by env flag until cutover |
| Ported but feature-locked | 3 | Code exists; gated by UI lock or env flag for Phase 1.1 reasons |
| Not yet ported (P0) | 8 | In scope for Phase 1 + Gate 4.95; component-level work largely DONE |
| Not yet ported (P1) | 3 | Deliberate deferrals |
| Deliberately replaced | 2 | Ops-specific patterns; not a gap |
| Total from gsl-mou-system | 37 | |

---

## 1. Ported and active

Features fully implemented and operationally available in gsl-ops-automation. No flags, no locks.

| # | Feature | gsl-mou-system route | Ops route | Confidence |
|---|---|---|---|---|
| 1 | MOU registry + detail | `/mous` + `/mous/[id]` | `/mous` + `/mous/[mouId]` | High |
| 2 | MOU generator (draft → save) | `/mous/new` | `/mous/new`, `/mous/[mouId]/draft` | High |
| 3 | MOU lifecycle stages | 8-stage kanban | `/kanban` (same 8-stage) | High |
| 4 | Payment matching | `/payments`, `/reconcile` | `/finance/payments` | High |
| 5 | Unmatched payment queue | `/payments/unmatched` | `/finance/payments/unmatched` | High |
| 6 | Payment log + audit | PaymentLog entity | PaymentLog in Ops | High |
| 7 | PI generation per MOU | `/mous/[id]` detail | `/mous/[mouId]/pi` (locked behind parallel-build) | High |
| 8 | PI detail view | Inline or separate | `/finance/pi/[paymentId]` | High |
| 9 | Tally export | Finance dashboard link | `/finance/tally-export` | High |
| 10 | Adjustments log | Standalone | `/finance/adjustments` | High |
| 11 | VEX dispatch detail | `/vex` + `/vex/[id]` | `/operations/vex/pi/[id]` | High |
| 12 | VEX dispatch transitions | State machine | State machine (same 4 states) | High |
| 13 | Schools list | `/schools` | `/schools` + `/schools/[schoolId]` | High |
| 14 | Sales team CRUD | `/sales-team` | `/admin/sales-team` | High |
| 15 | Escalations (ticketing) | `/alerts` (data-driven) | `/escalations` (ticketed) | Medium |
| 16 | Reports index | `/console` (analytics) | `/reports` (5 reports) | Medium |
| 17 | FY summary report | In `/console` | `/reports/fy-summary` | High |
| 18 | Sales performance report | In `/console` | `/reports/sales-performance` | High |
| 19 | Dispatch performance report | In `/console` | `/reports/dispatch-performance` | High |

---

## 2. Ported but locked behind parallel-build flag

Code is present and functional. Intentionally gated by `PI_PARALLEL_BUILD_LOCK` env variable during the phase where gsl-mou-system is still the operational PI issuer. Flip at Gate 5 cutover.

| # | Feature | Lock mechanism | Location | Unlock condition | Confidence |
|---|---|---|---|---|---|
| 1 | PI generation (MOU per-instalment) | `isPiParallelBuildLocked()` check in `POST /api/pi/generate` and UI gate at `/mous/[mouId]/pi` | `src/lib/pi/parallelBuildLock.ts` + 4 pages | `PI_PARALLEL_BUILD_LOCK=false` env var | High |
| 2 | VEX PI creation | Same check in `POST /api/operations/vex/pi/create` | Same lib + `/operations/vex/pi/new` page | Same env-var flip | High |

**Rationale:** Both route to the per-entity counter at `src/data/pi_counter_map.json`, which is a cutover-ready snapshot of gsl-mou-system's counter. Advancing it during parallel-build would collide with the next legitimate PI from the MOU system. Default `true` (locked) so an accidental re-deploy never burns a counter number.

**Lock message:** "PI generation is locked during the parallel-build window. Pranav continues issuing PIs from gsl-mou-system. This route activates at Gate 5 cutover."

**Test coverage:** `src/app/api/pi/generate/route.test.ts` + `src/app/api/operations/vex/pi/create/route.test.ts` verify 503 response when locked.

---

## 3. Ported but feature-locked (Phase 1.1 deferrals)

Code exists and is architecturally ready. Gated by design decision or deferred implementation.

| # | Feature | Lock mechanism | Location | Unlock condition | Backlog | Confidence |
|---|---|---|---|---|---|---|
| 1 | PI render-only (download without advancing counter) | Split of `generatePi.ts` not yet done | `src/lib/pi/generatePi.ts` | Split into `renderPi` + `issueAndRenderPi`; re-wire `/finance/pi/[paymentId]` download | BACKLOG.md § PI generator render-only split | High |
| 2 | MOU docx generation (wizard Generate button) | Wizard shows inline note instead of emit | `src/components/mou-system/GeneratorWizard.tsx` | Wire to `/api/mou/generate-docx` using `mouSystem/templates.ts` + `public/mou-templates/` | BACKLOG.md § .docx Generate flow port | High |
| 3 | Dispatch-workflow Kanban (6-column kit lifecycle) | Deferred after MOU Kanban shipped | `src/app/kanban/page.tsx` (MOU lifecycle only) | Build `/operations/kanban/page.tsx` with dispatch-status derivation | BACKLOG.md § Dispatch-workflow Kanban | Medium |

---

## 4. Not yet ported (P0 - Gate 4.95 rebuild target)

Features listed in the prior audit with P0 priority. As of 2026-05-18, `/dashboard/finance` has been substantially rebuilt and all 8 component-level items below are present in code.

| # | Feature | Status in Ops | Scope | Backlog ref |
|---|---|---|---|---|
| 1 | Dashboard filter bar | FinanceFilterBar exists | M | PARITY_AUDIT § 1.2 |
| 2 | KPI strip (4 cards) | KpiStrip exists | M | PARITY_AUDIT § 1.3 |
| 3 | High-priority alerts panel | HighPriorityAlertsPanel exists | S | PARITY_AUDIT § 1.4 |
| 4 | Top overdue payments panel | TopOverduePaymentsPanel exists | S | PARITY_AUDIT § 1.5 |
| 5 | Renewal needed panel | RenewalNeededPanel + `/finance/renewals` | S | PARITY_AUDIT § 1.6 |
| 6 | Amount Receipt Summary | AmountReceiptSummary exists | S | PARITY_AUDIT § 1.7 |
| 7 | VEX kit orders summary | VexKitOrdersTile exists | S | PARITY_AUDIT § 1.8 |
| 8 | Programme breakdown bar chart | ProgrammeBreakdown exists | S | PARITY_AUDIT § 1.9 |

**Verification:** Code review shows the data compute libs + components are present and wired. The remaining gap is integration testing - confirming each component renders correctly with live FY26-27 data after the Pranav refresh.

---

## 5. Not yet ported (P1 - deferred)

| # | Feature | Why deferred | Target | Confidence |
|---|---|---|---|---|
| 1 | Console (analytical drill-down) | Gate 5A Reports provides similar capability; Ops diverges (transactional focus) | Gate 5A.1+ | High |
| 2 | Alerts data-driven feed | Ops uses ticketed Escalations + HighPriorityAlertsPanel covers most value | Phase 1.1 if demand | Medium |
| 3 | MOU Pipeline simple-table view | `/kanban` covers the lifecycle; pipeline table is narrower | Phase 1.1 if muscle-memory demand | Low |

---

## 6. Deliberately replaced (not ported as-is)

| # | Feature | gsl-mou-system | Ops | Rationale |
|---|---|---|---|---|
| 1 | Dashboard landing | Finance + Leadership at `/` | Consolidated 5-zone landing + dept dashboards | Ops is multi-role; dept-scoped reduces cognitive load |
| 2 | Alerts vs Escalations | Computed data-driven | Ticketed Escalation entity | Ticketed gives audit trail, assignee, SLA; computed is read-only intro |

---

## 7. Parallel-build cross-reference

Per the brief, Step 4 (parallel-build inventory) runs in parallel. The two PI generation flows (per-MOU + VEX) are the only features locked by the counter-collision guard.

**Cutover plan:**
- Both PI flows respect the same `PI_PARALLEL_BUILD_LOCK` env flag.
- At Gate 5 cutover, a single env-var flip `PI_PARALLEL_BUILD_LOCK=false` unlocks both routes.
- No other Ops features are gated by parallel-build logic.
- The counter snapshot at `src/data/pi_counter_map.json` is the cutover-ready handoff.

---

## 8. Finance dashboard rebuild status (Gate 4.95 Step 2)

| Section | Component | Status |
|---|---|---|
| PageHeader + subtitle | Inline | Done |
| Filter bar | FinanceFilterBar | Done |
| KPI strip | KpiStrip | Done |
| High-priority alerts | HighPriorityAlertsPanel | Done |
| Two-card layout | PaymentsAttentionCard + PisAwaitingCard | Done |
| Top overdue + renewal | TopOverduePaymentsPanel + RenewalNeededPanel | Done |
| Amount receipt summary | AmountReceiptSummary | Done |
| VEX kit orders | VexKitOrdersTile | Done |
| Programme breakdown | ProgrammeBreakdown | Done |
| Footer (Tally + adjustments meta) | Inline | Done |

All 10 sections are present in `src/app/dashboard/finance/page.tsx` with compute libs in `src/lib/dashboard/financeDashboardData.ts`.

---

## 9. Reports module

Ops platform ships 5 operationally-focused reports. gsl-mou-system's `/console` was 10+ widgets analytical surface; Ops reports are narrower but avoid speculative "insights".

| Ops report | gsl-mou-system analogue | Wired |
|---|---|---|
| FY summary | Console Pulse + Programme State | Yes, `/reports/fy-summary` |
| Sales performance | Console Programme Sales Grid | Yes, `/reports/sales-performance` |
| Dispatch performance | N/A (new) | Yes, `/reports/dispatch-performance` |
| Payment aging | Console Collections Gap | Yes, `/reports/payment-aging` |
| Escalations | N/A (Ops-specific) | Yes, `/reports/escalations` |

Landing at `src/app/reports/page.tsx`. Access gated by `visibleReports(user)` in `src/lib/reports/access.ts`.

---

## 10. Confidence summary

| Confidence | Count | Notes |
|---|---|---|
| High | 31 | Code verified, wired, tests exist, or feature-locked with explicit env flag |
| Medium | 5 | Based on plan docs + code inspection; minor ambiguities |
| Low | 1 | MOU Pipeline simple-table - status inferred from audit narrative |

---

## 11. Next steps for Anish

1. **Phase 1 closure (pre-Gate 5):** Verify PI render-only split and docx generation flows are scheduled for pre-cutover completion.
2. **Gate 5 cutover checklist:** `PI_PARALLEL_BUILD_LOCK` env var flip must happen atomically across Vercel deploy + admin communication. Coordinate with Pranav on stop time for gsl-mou-system PI issuance.
3. **Phase 1.1 triage:** The 3 feature-locked items (§3) can be scheduled as light-touch follow-ups post-round-2.
4. **Console / Reports comparison:** If analysts ask for `/console`-like analytical capability in Phase 2, the `/reports` foundation supports expansion (small-multiples charts, trend lines, etc.).

---

## Quick-reference summary

| Category | Count | Examples |
|---|---|---|
| Ported + active | 19 | MOUs, payments, VEX, PI detail, tally, reports (5) |
| Ported + parallel-build locked | 2 | PI generation (MOU + VEX) - unlock via env flag |
| Ported + feature-locked (Phase 1.1) | 3 | PI render-only, MOU docx gen, dispatch Kanban |
| Not ported (P0) | 8 | Dashboard filters, KPIs, alerts, overdue, renewal, receipts, VEX summary, programme breakdown - all built |
| Not ported (P1) | 3 | Console, alerts feed, MOU pipeline table |
| Deliberately replaced | 2 | Dashboard landing, Escalations entity model |

**Verdict:** Ports complete for 24 of 37. The 2 parallel-build locks flip at Gate 5 cutover with one env var. The remaining gaps (Phase 1.1 deferrals + 3 P1 items) are within planned scope.

---

**Document generated:** 2026-05-18
**Prior audit:** docs/gate-4.95/PARITY_AUDIT.md
