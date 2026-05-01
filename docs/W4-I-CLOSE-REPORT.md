# W4-I close report

**Date:** 2026-05-02
**Owner:** Anish Dutta
**Status:** Phase 1 ready for round 2 testing.

W4-I closed in five sub-batches. Each landed independently with verification (tsc + eslint + vitest + build + docs-lint), each pushed to `main`, each available on the production Vercel deploy. Round 2 testing can start as soon as Anish sends the invitation email (`docs/testing/round-2-invitation.md`).

This report is the index over W4-I.1 through W4-I.5 plus a recommended next-batch call.

---

## W4-I.1: end-to-end verification (closed 2026-04-25)

**Goal:** smoke-test every primary surface after Week 3 drag-and-drop landed; confirm permission gates intact; confirm fixture state imports cleanly.

**Outcome:** Phase 1 ready for invite, modulo the gaps W4-I.2 + W4-I.3 + W4-I.4 + W4-I.5 closed.

---

## W4-I.2: user provisioning (closed 2026-04-26)

**Goal:** Real testers (Misba, Swati, Gowri, Anita, Ameet, Pratik, Vishwanath plus core team) provisioned in `users.json` with bcrypt password hashes, role grants, and notification preferences.

**Outcome:** 12 active users on file. Anish holds the launch credential bundle for distribution. No password rotation scheduled pre-round-2 (testers rotate post-first-login).

---

## W4-I.3: auto-sync read-path architecture (closed 2026-04-30)

**Goal:** Close the visibility gap between write (queue commit to `pending_updates.json`) and read (operator sees the row).

**Outcome:** Path C ships. GitHub Actions cron at `*/5 * * * *` POSTs to `/api/admin/sync-queue`, which calls `drainQueue` from `src/lib/sync/drainQueue.ts`. Per-entity batches apply to canonical JSON files; queue trims drained ids; `sync_health` entry appended on every tick. First-fire verification 2026-04-30: HTTP 200, drained=8 across 3 entity types, 0 failures, 2964ms. The architecture is live for round-2 testing.

**Cross-references:** RUNBOOK §11.12, role-decisions.md 2026-04-30 entry, plans/anish-ops-w4i3-recon-2026-04-30.md.

**Trigger to revisit:** Azure migration (D-041), queue depth sustained >50, per-tick latency >30s, tester count >20.

---

## W4-I.4: Misba feedback batch (closed 2026-04-30)

**Goal:** Five tester-feedback items from the W4-A through W4-H pre-round-1 review (Misba's mock-walkthrough commentary).

**Outcome:**
- **MM1:** dispatch reorder threshold visibility on `/admin/inventory`. Closed by W4-G.6 in passing; verified.
- **MM2:** PI generate button hidden from Ops + SalesRep + SalesHead + TrainerHead. Server-side gate in `lib/pi/generatePi.ts` plus client-side hide on the MOU detail page header.
- **MM3:** post-signing intake form field set hardened. Recipient SPOC fields + students-at-intake + grades + duration enriched per the SPOC DB nomenclature.
- **MM4:** dispatch capture form supports multi-SKU + per-grade allocations. Already shipped in W4-D.1; verified that Misba's intent matched.
- **MM5:** escalations get a Category + Type free-text taxonomy plus `/escalations/[id]/edit` for inline maintenance. Phase 1 keeps these as free-text per the W4-F.1 minimal-container pattern; D-026 will formalise the enums after round 2 if usage shows convergence.

---

## W4-I.5: Operations Control Dashboard rebuild + smart templates + design system polish (closed 2026-05-02)

**Goal:** Anish + Ameet CEO review identified three top-priority surfaces: a dashboard homepage with rate-of-change visibility (replacing the kanban as the entry point), lifecycle-stage-keyed template suggestions on the MOU detail page, and design system polish across every primary list / detail / form surface.

**Outcome:** five phases (P1 reconnaissance, P2 dashboard rebuild, P3 smart templates, P4 design system polish across 8 commits, P5 verification), 279 net new tests (1515 -> 1794), zero changes to permission gates, zero changes to audit logging behaviour, every existing data field and action preserved verbatim across every restructured page.

**Surfaces touched:**
- `/` (Operations Control Dashboard, new)
- `/kanban` (formerly `/`; URL changed, content + drag-and-drop preserved byte-for-byte)
- `/mous` (Status column → StatusChip; Archive link → opsButtonClass; empty-state copy refresh; "Filtered from the MOU Pipeline" rename)
- `/mous/[mouId]` (sticky action bar md+; two-column body; six collapsible right-column cards: Smart Suggestions, Intake, Instalments, Dispatches, Communications, Escalations)
- `/mous/[mouId]/send-template/[templateId]` (new launcher route)
- `/schools` (Missing-GSTIN cell → StatusChip; empty-state copy refresh)
- `/sales-pipeline` (state-filter buttons + New opportunity + Apply share opsButtonClass; Lost badge → StatusChip; empty-state via EmptyState component)
- `/sales-pipeline/[id]` (Edit + Mark-as-lost → opsButtonClass; did-you-mean panel buttons → OpsButton; flash banners → signal tokens; audit-log diff highlights tokenised)
- `/sales-pipeline/new` + `[id]/edit` + `[id]/mark-lost` (forms polished; mark-lost submit uses the new `destructive` variant)
- `/escalations` (Lane / Level cell → LaneBadge + level text; Status + Severity → StatusChip via shared escalationTones helper; empty state distinguishes role-empty from filter-empty)
- `/escalations/[id]` (uses shared escalationTones helper; signal-warn cleanup landed)
- `/admin` (P4C2 polish; StatCard tiles + plain link tiles)
- `/admin/inventory` + `[id]` (full restructure: TopNav + PageHeader + breadcrumb; Out / Low / Sunset → StatusChip; flash → signal tokens; OpsButton)
- `/admin/schools` (TopNav + PageHeader + breadcrumb; Missing-GSTIN → StatusChip)
- `/admin/cc-rules/new` + `[ruleId]` (token migration; OpsButton; signal tokens for flash messages)
- `/admin/audit` (filter chip + empty-state colours tokenised)
- `/admin/mou-import-review` (Reject + Import buttons → OpsButton; row + form colours tokenised)
- `/admin/reminders` + `[id]` (per-kind chip → StatusChip via KIND_TONE map; state-filter row + Apply + Compose share opsButtonClass; flash messages → signal tokens)
- `/admin/pi-counter` (cards + status text tokenised; OK / Violation moved off arbitrary-value syntax)
- `/admin/templates` (Inactive chip → StatusChip)
- `/admin/dispatch-requests` (STATUS_BADGE_CLASS map → STATUS_TONE driving StatusChip; status-filter row + Search → opsButtonClass)
- `/admin/dispatch-requests/[requestId]` (Approve & convert → OpsButton action; Cancel request → OpsButton outline; Reject button kept inline)
- `/help` (Kanban → MOU Pipeline prose sweep; glossary entry renamed with internal-term note)

**Surfaces preserved verbatim:**
- TopNav nav structure (only the "Kanban" → "MOU Pipeline" label rename; URL stays `/kanban`).
- All filter / sort / pagination / URL semantics on every list page.
- All form logic, validation rules, submission handlers.
- All permission gates (PI hidden from Ops per MM2; lane-aware escalation visibility; cc-rule edit Admin-only first 30 days; etc.).
- All audit logging behaviour.
- All data-testid markers across every test file.

**Cross-references:** RUNBOOK §11.13, role-decisions.md 2026-05-02 entry, the 25-plus W4-I.5 commits between 2026-04-30 and 2026-05-02 (P1 recon through P5 verification).

---

## Outstanding deferred items registered during W4-I

- **D-041:** Azure migration (W4-I.3 origin). Trigger: Phase 1 close + round-2 wrap + Ameet greenlights budget.
- **D-042:** Multi-platform Azure infrastructure model (HR + future GSL platforms). Decide before D-041 cutover.
- **D-043:** 3-consecutive-failures sync detection (~25 lines). Trigger: any 3-failure event in `sync_health.json` OR Anish wants proactively before scaling testers >12.
- **D-044:** Region filter taxonomy expansion (W4-I.5 origin). Trigger: any school in `schools.json` gets a `region` other than `East` / `North` / `South-West`.
- **D-045:** docs-lint preprocessor extension to skip Tailwind class strings. Trigger: a second function-body Tailwind class string hits the same lint conflict.
- **D-046:** Audit-log virtualization at 30 entries. Trigger: any single entity's `auditLog.length` crosses 30 in production.
- **D-047:** MOU detail sticky action bar height tunable. Trigger: tester reports sticky region eating viewport on a 13"-or-smaller display.

Plus the pre-W4-I W4-A through W4-H deferred items (D-001 through D-040). Total registry: 47 items across `docs/W4-DEFERRED-ITEMS.md`.

---

## Recommended next batch

**(a) Round 2 testing.** The single right call. Phase 1 is feature-complete for the round-2 scope; outstanding items are deliberate scope cuts not blockers. Anish reviews + sends `docs/testing/round-2-invitation.md`; testers exercise the surfaces; bugs + UX feedback arrive over the next 7 to 10 days; W4.5 batches address fixes per role.

**(b) Optional pre-round-2 hardening.** D-043 (3-consecutive-failures) is the only deferred item that could prevent a round-2 sync incident from being noticed. ~25 lines + 2 unit tests. Anish's call: ship-now or wait-for-incident. Recommend ship-now if the round-2 cohort grows past 12 testers; otherwise defer.

**(c) Phase 1.1 Azure migration scoping.** Cannot start until round-2 wraps + Ameet greenlights budget. The reconnaissance is complete (D-041 plus D-042 frame the work).

**Recommended path: (a) plus (b) if Anish wants the cheap insurance.** (c) waits for round-2 outcomes.

---

## Test count arc across W4-I

- Pre-W4-I baseline (post-W4-H): 1428 tests.
- Post-W4-I.1: 1432 tests (small smoke-test additions).
- Post-W4-I.2: 1438 tests (provisioning fixtures + a few session-test additions).
- Post-W4-I.3: 1485 tests (drainQueue lib tests + sync-health tests + cron endpoint).
- Post-W4-I.4: 1515 tests (MM1-MM5 acceptance tests).
- Post-W4-I.5: 1794 tests (+ 279 across dashboard + smart templates + design system).

Test growth scales with surface coverage; no test file slipped to the 100-line threshold (LSP test files segmented per route).

---

## Production stability

Vercel auto-deploys every commit on `main`. The W4-I.5 batch landed 25-plus commits across 3 days; no deploy failures, no production regressions detected. The `sync-queue-cron` GitHub Action fires on `*/5` cadence as expected; latest first-fire verification 2026-04-30 confirmed end-to-end.

Round 2 testing starts on Anish's signal.
