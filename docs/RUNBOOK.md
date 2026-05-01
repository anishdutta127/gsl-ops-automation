# RUNBOOK

Operational runbook for GSL Ops Automation. Read sections 1-3 before launch day; sections 5-7 are referenced when an incident or trigger fires.

This is a living document. Anish owns it. Updates land:

- After every prod incident (post-mortem captured in section 5.x).
- After every step 6.5 trigger fire (response captured in section 6.x).
- Weekly during the first 4 weeks post-launch.
- Monthly through month 3.
- Quarterly thereafter.

Maintenance discipline: Misba and ops staff are READERS. They consult section 3 for Day-1 actions and section 5 when they hit a failure mode. They do not write entries here.

---

## 1. Pre-launch checklist (T-7 days to T-0)

Tick each item before launch day. Anish owns each unless noted.

### 1.1 Data seeding

- [ ] All 24 2026-04 cohort MOUs imported via Q-A helper. Each carries `schoolScope` set explicitly (`'SINGLE'` or `'GROUP'`); never undefined.
- [ ] Narayana chain MOU imports as `schoolScope: 'GROUP'` with `schoolGroupId: 'SG-NARAYANA_WB'` and 3 member schools populated.
- [ ] 10 CcRule records pre-seeded from ground-truth §3b (already in fixtures; verify they made it to production via initial deploy).
- [ ] 3 SchoolGroups pre-seeded (Narayana WB, Techno India, Carmel).
- [ ] sales_team.json populated with real reps + territory + programme mappings.
- [ ] Pre-launch import-review queue empty (any quarantined imports resolved).

### 1.2 Credentials distribution

- [ ] User accounts created for the locked 10-tester roster: anish.d, ameet.z, pratik.d, vishwanath.g, misba.m (Admin), pradeep.r (Admin), swati.p (Admin), shubhangi.g, pranav.b, shashank.s.
- [ ] Each user's bcrypt hash verifies against the launch password (rotate from `GSL#123` to a per-user value if needed before first prod login).
- [ ] Login URL communicated to all 10 testers via the launch email.
- [ ] Password rotation policy documented: users rotate within 7 days of first login.

### 1.3 GSTIN backfill status

- [ ] Per Item F result: bulk GSTIN CSV import applied if Shubhangi confirmed central capture exists; otherwise per-school capture flow ready and ops staff briefed.
- [ ] Schools with `gstNumber: null` flagged in the launch email so testers know PI generation will block on those.

### 1.4 Excel-tracker freeze plan

- [ ] Master Excel marked "READ-ONLY EXPORT" in the OneDrive sharing pane.
- [ ] Communication to ops team: handoff line 148 contract. Excel is no longer canonical post-launch.
- [ ] Backup snapshot of pre-launch Excel taken and archived (in case of rollback).

### 1.5 Auto-sync state (GitHub Actions cron)

Replaces the laptop-hosted runner described in earlier drafts. The W4-I.3 reshape moved sync to a GitHub Actions cron job hitting the Vercel deployment; see §11.12.

- [ ] `CRON_SECRET` env var set in Vercel Production (Settings -> Environment Variables). Generate via `openssl rand -hex 32` or similar.
- [ ] Same `CRON_SECRET` value set as a GitHub repo secret (Settings -> Secrets and variables -> Actions). Both halves must match.
- [ ] `.github/workflows/sync-queue-cron.yml` present on `main` with schedule `*/5 * * * *` and `workflow_dispatch` enabled for manual fires.
- [ ] First scheduled run observed in the GitHub Actions tab (look for green check on `sync-queue-cron`).
- [ ] Latest sync entry on `/admin` shows `kind: sync` with a recent timestamp.

### 1.6 Test suite + a11y baseline

- [ ] `npm test` green on main (5 mandatory + 4 additional Q-G tests when their lib subjects land; today: 160 passed + 26 todo).
- [ ] `bash scripts/docs-lint.sh` passes (em-dash zero, British English, AI-slop WARN-only).
- [ ] `npm run smoke:test` passes against the deployed environment (boots dev, route checks).
- [ ] axe-core baseline at zero violations OR Phase 1.1 issues filed for each known violation with named owner.

### 1.7 Vercel deployment verification

- [ ] Production deploy succeeds on a non-queue commit.
- [ ] Production deploy SKIPPED on a queue commit (`chore(queue):` prefix). Verify via Vercel dashboard "ignored" status.
- [ ] Environment variables set in Vercel: `GSL_QUEUE_GITHUB_TOKEN`, `GSL_JWT_SECRET`, `GSL_SNAPSHOT_SIGNING_KEY`.
- [ ] Custom domain wired (DNS pointing to Vercel) OR Vercel-issued URL communicated to testers.

---

## 2. Launch day sequence

D-day. All times IST. Anish is on call throughout.

### 2.1 T+00h: Initial MOU import pass

- Anish runs the initial import against the 2026-04 cohort.
- Watch the dashboard: import-review queue depth should stabilise; auto-link rate should be high.
- Any review-queue items triaged within the hour.

### 2.2 T+01h: Validation sweep

- Confirm every imported MOU has `schoolScope` set.
- Confirm programme + programmeSubType combinations match expectations (18 STEAM-with-GSLT-Cretile + 5 TinkRworks + 1 VEX per ground-truth §1).
- Confirm GSTIN status per school: PI generation will block on null-GSTIN schools.

### 2.3 T+02h: Credential email

- Send credential email to all 10 testers with: login URL, username, initial password, link to `/dashboard` and `/admin/audit`.
- The email is direct voice, no AI slop, British English, em-dash-free.

### 2.4 T+03h: Core team briefing

- 30-minute walkthrough with the trusted core team (Misba, Pradeep, Swati, Shashank): dashboard tour, exception feed, escalation list, CcRule toggles, audit route filter rail, admin-area surfaces.
- All four are Admin per `docs/role-decisions.md` (2026-04-27 decision); they see and do everything Anish does. Brief them on the wildcard scope so they know what to test and what NOT to test casually (irreversible writes touch real launch state). Shashank's primary day-to-day responsibility remains ACADEMICS-lane escalation resolution; the Admin grant is a permission upgrade, not a workload change.

### 2.5 T+04h to end-of-day: Active monitoring

- First sync ticks should land hourly (cron schedule).
- Queue depth, axe-core CI baseline, dashboard cold-load times all watched.
- Anish responds to any tester-reported issue within 30 minutes during business hours.

---

## 3. Per-user Day-1 actions

Each tester has a specific entry path. The launch email links them to the right place.

### 3.1 Anish (Admin)

- Monitor sync runner via GitHub Actions notifications.
- Watch the dashboard exception feed for unusual entries.
- Respond to mou-import-review queue items.
- Review the Day-1 audit log via `/admin/audit?days=1`.

### 3.2 Shubhangi (Finance)

- Log in via `/login` with credentials from the launch email.
- Verify school list at `/schools` matches the expected 24-school cohort.
- Verify SPOC list per school is populated.
- Flag any school with missing GSTIN (`gstNumber: null`) and capture via `/admin/schools/[schoolId]/edit`.

### 3.3 Pradeep (Admin)

- Log in.
- Review escalation list at `/escalations`.
- Walk through dispatch flow on a non-real test MOU to verify the override-gate behaviour without committing real state.
- Spot-check `/admin` surfaces are accessible (Pradeep is Admin per `docs/role-decisions.md`).

### 3.4 Misba (Admin)

- Log in.
- Review CcRule toggle state at `/admin/cc-rules` (10 rules, all enabled by default).
- Spot-check dashboard tile values match the imported cohort.
- Audit route accessibility verified at `/admin/audit` (full visibility per Admin wildcard).

### 3.5 Swati (Admin)

- Log in.
- Familiarise with the dashboard, MOU list, and `/admin` directory of areas.
- Walk one MOU end-to-end (confirm actuals → generate PI → raise dispatch → record delivery ack) on a non-real test MOU to internalise the lifecycle.

### 3.6 Shashank (Admin)

- Log in.
- Review escalation list at `/escalations`; ACADEMICS-lane items remain the day-to-day focus.
- Spot-check `/admin` surfaces are accessible (Shashank is Admin per `docs/role-decisions.md`); the wildcard does not change the primary academics workflow but unlocks audit and admin areas during the pilot.

### 3.7 Ameet (Leadership)

- Log in.
- Verify Leadership Console at `/dashboard` renders with all 5 health tiles + 10 trigger tiles.
- Walk through P2 override UI on a test Dispatch (do NOT click through on real data).

### 3.8 Sales reps (Vishwanath, plus any others added pre-launch)

- Log in.
- Verify their own assigned MOU list scoping at `/mous` shows only MOUs where `salesPersonId` matches their user id.

---

## 4. Cron-runner monitoring expectations

Phase 1 outline. Detailed runbook entries land as the runner sees real prod hours.

- 4.1 Hourly sync (Mon-Fri IST business hours): expected behaviour, normal log shape, what to watch in GitHub Actions.
- 4.2 Daily sync-runner check: pi_counter monotonicity, pending_updates JSON validity, alert-on-anomaly path.
- 4.3 Weekly magic-link-token pruning: archive-then-delete; archive output location at `src/data/_audit/magic_link_tokens_YYYY-MM.json`.
- 4.4 GitHub Actions failure: how Anish gets paged, recovery steps.

---

## 5. Failure modes and recovery

Phase 1 outline. Each subsection grows as real incidents land. Living document; post-mortem updates here BEFORE the fix PR closes.

### 5.1 Auto-sync drift (GitHub Actions cron not firing)

- Symptom: latest `sync_health` entry on `/admin` is older than ~10 minutes; queue depth grows beyond a handful of entries.
- First check: GitHub Actions tab on the repo, `sync-queue-cron` workflow. Recent runs every 5 min are expected. A red X with HTTP 401 in the log means the GitHub-side `CRON_SECRET` does not match the Vercel-side `CRON_SECRET`; rotate both to the same value.
- A red X with HTTP 500 + `cron-secret-not-configured` in the body means the Vercel env var is missing; set it and redeploy.
- A red X with HTTP 5xx other than 500 typically means a Vercel deployment issue, not a cron issue; check the Vercel deploys page.
- Manual recovery: trigger the workflow on demand via Actions tab -> `sync-queue-cron` -> Run workflow. Or run locally: `CRON_SECRET=<value> GSL_OPS_BASE_URL=<prod-url> node scripts/sync-queue.mjs`. Idempotent re-run is safe.
- If the route returned 200 but `ok: false`: the response JSON lists per-entity failures; common causes are GitHub Contents API rate limits (transient, retries on next tick) or a malformed pending entry (stays in queue, surfaces as anomaly until inspected).

### 5.2 Queue corruption (invalid JSON in pending_updates.json)

- Symptom: daily sync-runner check fires; PI generation may fail.
- Recovery: git-history archaeology on the queue file; manual JSON repair; commit with manual queue-fix prefix.
- Prevention: 9-test Q-G suite (when full); pre-commit JSON validation.

### 5.3 GitHub Contents API outage / rate limit

- Symptom: queue commits fail; dashboard shows the error banner.
- Recovery: wait for API restoration; queue is idempotent; retry on next sync tick.

### 5.4 Vercel deploy failure on a non-queue commit

- Symptom: CI green but Vercel deploy fails.
- Recovery: revert the offending commit; investigate; redeploy.

### 5.5 PI counter skip or duplicate

- Symptom: daily sync-runner check fires monotonicity violation.
- Recovery: emergency review per step 6.5 Item G; archaeology + manual reconciliation; never re-issue an existing PI number.

### 5.6 Email bounce surge (>5% in any 7-day window)

- Symptom: step 6.5 Item I trigger fires; dashboard tile alerts.
- Recovery: switch to WhatsApp-copy fallback per Axis 4; investigate sender reputation.

---

## 6. Trigger response

When a step 6.5 trigger fires, response per item:

- 6.A CEO Overrides (3+/week × 2 weeks): graduate to Approach C (escalation-based) per step 6.5 Item A rollback.
- 6.B Drift Queue (5+/week): re-tune drift threshold from 10% to 15% via config edit per step 6.5 Item B.
- 6.C Legacy Workload (>20%): Phase 1.1 legacy-school import pass per step 6.5 Item C.
- 6.D CC Audit Delta (1+/week): review the rule that produced the unexpected CC list.
- 6.E Commitments Flag (1+/60d): backfill the historical commitments register per step 6.5 Item E.
- 6.F Null-GSTIN Schools (>30%): bulk CSV GSTIN import per step 6.5 Item F.
- 6.G Queue Health (anomaly): emergency review per step 6.5 Item G.
- 6.H Rule Toggle-Offs (4+/30d): re-evaluate "literal CC rules matter" assumption per step 6.5 Item H.
- 6.I Email Bounce Rate (>5% / 7d): WhatsApp-copy fallback per step 6.5 Item I.
- 6.J Unassigned MOUs (5+/week): extend sales_team.json with missing reps per step 6.5 Item J.

---

## 7. Phase 1.1 escalation criteria

Anish stops adding to Phase 1 and starts planning Phase 1.1 when ANY of:

- Two consecutive trigger fires in items A, F, or G.
- Single trigger fire in items C or G (data-integrity-incident class).
- Ops team explicit request for a Phase 1.1 feature.
- 60 days post-launch regardless (forced cadence).

---

## 8. Contacts

Filled in at credentials-distribution day. Roles + escalation chains.

- Admin: Anish Dutta (anish.d@getsetlearn.info)
- Leadership: Ameet Zaveri (ameet.z@getsetlearn.info)
- Sales Head: Pratik D. (pratik.d@getsetlearn.info)
- Ops Head: Pradeep R. (pradeep.r@getsetlearn.info)
- Ops + testingOverride: Misba M. (misba.m@getsetlearn.info)
- Finance: Shubhangi G. (shubhangi.g@getsetlearn.info), Pranav B. (pranav.b@getsetlearn.info)
- Trainer Head: Shashank S. (shashank.s@getsetlearn.info)

L3 escalation fallback: Ameet for OPS, SALES, ACADEMICS lanes (Week 1 option (a)).

---

## 9. Week 2 scope (deferred from Week 1 scaffolding)

Week 1 closed the scaffolding scope per step 10 Item 7. Week 2 builds the actual business logic on top of that scaffolding. The 4 lib subjects below are the highest-priority Week-2 work; their Q-G test scaffolds are in place at `it.todo()` (Item 15b) and turn green when the lib lands.

| Lib subject | Path | Q-G test scaffold | What it does |
|---|---|---|---|
| Reconciliation helper | `src/lib/reconcile.ts` | `src/lib/reconcile.test.ts` | Payment-to-PI shortlist for the reconciliation UI. The flagship feature per the handoff. |
| MOU importer | `src/lib/importer/fromMou.ts` | `src/lib/importer/fromMou.test.ts` | Q-A: pulls new MOUs from gsl-mou-system via Contents API; runs 7 validators; auto-links on exact match; quarantines on ambiguity. Includes the Update-1 GSLT-Cretile normalisation. |
| CC rule resolver | `src/lib/ccResolver.ts` | `src/lib/ccResolver.test.ts` | Resolves the 10 SPOC-DB rules to a CC email list per (context, schoolId, mouId) tuple. Literal scoping per step 6.5 Item D. |
| Dispatch override helper | `src/lib/dispatch/overrideAudit.ts` | `src/lib/dispatch/overrideAudit.test.ts` | Q-J: writes Dispatch.overrideEvent + Escalation when Leadership triggers a P2 override; Finance acknowledgement appends. |

Each subject lands with its real implementation (replacing the `it.todo()`s with working assertions). The 5 of 9 Q-G tests already passing today (queue + counter + 409 + commit-prefix + feedbackAutoEscalation) verify the underlying queue + counter + audit-write infrastructure those subjects build on.

After Week 2 closes the four Q-G subjects, additional Phase 1 work:

- PI generation: `src/app/api/pi/generate/route.ts` real implementation (currently 501 stub).
- Dispatch document generation: `src/app/api/dispatch/generate/route.ts`.
- Delivery acknowledgement: `src/app/api/delivery-ack/generate/route.ts`.
- Login flow: `src/app/api/login/route.ts` (uses `verifyPassword` from `src/lib/crypto/password.ts` against `src/data/users.json`; issues JWT via `issueSessionToken`).
- Logout flow: clears `gsl_ops_session` cookie.
- Feedback submission API: `src/app/api/feedback/submit/route.ts` real implementation (HMAC verify + atomic single-use token consume + write Feedback + invoke `feedbackAutoEscalation`).
- Email send pipeline: `src/app/api/communications/send/route.ts` real implementation; SMTP provider integration (Resend or Postmark).
- WhatsApp draft-copy log: `src/app/api/communications/log-copy/route.ts` real implementation.
- Sync-runner cron tick: `src/app/api/sync/tick/route.ts` real implementation.
- MOU import-tick: `src/app/api/mou/import-tick/route.ts` real implementation.

That ordering reflects launch dependency: PI generation needs reconcile + payment storage; login is required before any UI test against real users; feedback-submit needs auto-escalation (already in place from Item 15).

Cross-references:
- Item 15b test scaffolds: `src/lib/reconcile.test.ts`, `src/lib/importer/fromMou.test.ts`, `src/lib/ccResolver.test.ts`, `src/lib/dispatch/overrideAudit.test.ts`.
- Item 15 real lib: `src/lib/feedback/autoEscalation.ts` (Update 3 promoted to Phase 1).
- Phase 1.1 backlog: `plans/anish-ops-eng-review-2026-04-24.md` §"Phase 1.1 backlog".

---

## 10. Phase 1.1 backlog (deferred behaviours and deliberate scope cuts)

These are deliberate Phase 1 scope cuts, not bugs. Each item names the **Context** (what the deferred behaviour is today), the **Trigger** (when to revisit), and the **Implementation path** (what changing it would involve). Items are grouped thematically; ordering within a group is not significance-based.

### 10.1 Auth and access

- **No rate limiting on `/api/login`.**
  - **Context:** the route accepts unbounded login attempts; only Vercel's platform-level rate limit stands between us and brute-force.
  - **Trigger:** any unauthenticated route is exposed beyond staff IPs (in particular, the SPOC portal going public-internet).
  - **Implementation:** add an external counter store (Vercel KV or Upstash) keyed by `email + IP` with sliding-window decay; serverless invocations have no shared in-memory state, so the counter cannot be in-process.

- **Login response timing is not equalised across reject reasons.**
  - **Context:** known-user-with-wrong-password runs the bcrypt compare; unknown-user does not. An attacker measuring response time can distinguish "user exists" from "user does not."
  - **Trigger:** any public-facing login surface (Phase 1's 10 known testers do not need timing equalisation).
  - **Implementation:** run bcrypt against a placeholder hash on every code path so the bcrypt cost is constant regardless of branch.

- **Multi-device sessions accepted.**
  - **Context:** session cookie is JWT-based with no server-side session list, so the same user-id from multiple IPs is allowed simultaneously.
  - **Trigger:** the audit log shows a single user-id session used from geographically-distant IPs in a short window, suggesting credential leak.
  - **Implementation:** add `sessions.json` with a per-user concurrency limit (1 active or 2 active typical), enqueue a queue write per login that revokes prior sessions, and read-check on every authenticated request.

- **API rejection message clarity when role gating returns is terse.**
  - **Context:** when an API write fails the permission check, the route 303-redirects back with `?error=permission`; the destination page renders a generic "Editing requires Admin" string. The user does not learn which permission was denied or how to escalate.
  - **Trigger:** non-Admin testers report confusion about what they cannot do or whom to ask.
  - **Implementation:** extend the error rail to surface the action attempted (e.g., `lifecycle-rule:edit`) and a "Contact Anish" affordance; the lib mutators already return a structured `reason` so the route handler can pass it through verbatim.

- **Lifecycle-rules permission shows error post-attempt rather than pre-attempt.**
  - **Context:** W3-B disabled UI gating; SalesRep, OpsHead, etc., all see `/admin/lifecycle-rules` and the edit form. Submission triggers the server-side `lifecycle-rule:edit` Admin-only check, which 303-redirects with `?error=permission`. The user fills out the form and only then learns they cannot save.
  - **Trigger:** testers complain that the lifecycle-rules page lets them write a value they cannot submit.
  - **Implementation:** either (a) re-enable UI gating on this single surface so non-Admin sees a read-only view with a "Contact Anish to change rules" footer, or (b) keep the current open-access shape but disable the form inputs + Save button when `user.role !== 'Admin'`. (a) is cleaner; (b) preserves the W3-B "everyone sees everything" principle.

### 10.2 Data and schema

- **SPOC entity model deferred to Phase 1.1.**
  - **Context:** the devex review assumed a separate `Spoc` entity managed at `/admin/spocs/new`; the eng review modelled SPOC contact as embedded fields on `School` (`contactPerson`, `email`, `phone`). Phase 1 ships the embedded-fields shape; `/admin/spocs` is a placeholder pointing testers to `/schools/[id]/edit`.
  - **Trigger:** tester feedback that resolves SPOC cardinality (single-per-school vs multi-per-school vs per-MOU-overrides).
  - **Implementation:** add a `Spoc` interface in `src/lib/types.ts`, `src/data/spocs.json` fixture, the `'spoc'` `PendingUpdateEntity`, and a real admin surface; backfill the existing School embedded fields into the new entity in a one-shot migration script.

- **`installmentSeq` schema identifiers stay American-English.**
  - **Context:** the schema uses American "installment" while user-facing strings (and most Indian English usage) prefer British "instalment". A pragmatic split landed on 2026-04-26: user-facing strings were Britishised in 4 files; schema identifiers (`installmentSeq`, `installment1Paid`, etc.) stayed American to avoid a 75-file refactor across types, fixtures, libs, routes, tests.
  - **Trigger:** any large-scale schema migration (e.g., when SPOC entity lands or fixtures move to a real database) creates a natural opportunity to rename in one shot.
  - **Implementation:** ts-codemod or rg-replace across the 75 files; update fixture files; rerun `npm run seed:dev`; verify all tests still pass; commit as a single rename PR.

### 10.3 Lifecycle and rules

- **PI vs Dispatch idempotency divergence.**
  - **Context:** `generatePi` advances the PI counter on every successful call; `raiseDispatch` idempotently re-renders already-raised dispatches and returns `wasAlreadyRaised: true`. Rationale: PI numbers have external GST-filing significance, so accidental duplicates are tracked as counter gaps (recoverable) rather than silent same-number re-render; dispatch state is internal only, so re-download is the right default.
  - **Trigger:** Finance reports of accidental duplicate-click PIs.
  - **Implementation:** add a per-`(mouId, instalmentSeq)` lookup pre-counter-advance; if a successful PI already exists for that pair, return `{ ok: true, piNumber: existing, wasAlreadyGenerated: true }` and re-stream the existing docx without advancing the counter.

- **Pre-Ops triage budget is hardcoded; not in the editable lifecycle-rules table.**
  - **Context:** the 7 forward-stage transitions (MOU signed → Actuals confirmed, etc.) are editable at `/admin/lifecycle-rules` per W3-D. The Pre-Ops Legacy 30-day triage budget stays hardcoded as `PRE_OPS_TRIAGE_DAYS` in `src/lib/kanban/stageDurations.ts`. Pre-Ops is structurally not a forward stage transition (it's a holding bay with one-way exit), so the JSON shape would need a separate row type to accommodate it.
  - **Trigger:** pilot operators want to tune the Pre-Ops triage budget (likely if real data shows the 30-day default is wrong for the imported MOU cohort).
  - **Implementation:** extend `lifecycle_rules.json` with an optional `kind: 'holding-bay'` discriminator alongside the existing forward-stage rows; teach `getStageDurationDays(stage)` to read Pre-Ops from JSON when present and fall back to the hardcoded 30-day default; add a Pre-Ops row to the `/admin/lifecycle-rules` UI that explains the holding-bay semantics.

- **D4 delivery-ack collapses physical delivery + paperwork acknowledgement into a single transition.**
  - **Context:** schema supports both events (`deliveredAt` and `acknowledgedAt` are distinct fields); the Phase 1 simplified flow sets all three timestamps + the signed-handover-form URL at once when an operator records the ack.
  - **Trigger:** courier integration confirms physical delivery before the school's signed paperwork is uploaded.
  - **Implementation:** split the form into two steps; the first sets `deliveredAt` (and optionally a tracking-number); the second sets `acknowledgedAt` + `signedHandoverFormUrl`. Both write through the same lib mutator; the form just gates which fields are required at which step.

- **`cc-rule:create` 30-day Admin-only flip is partially obsolete.**
  - **Context:** original design gated `cc-rule:create` to Admin for the first 30 days, with OpsHead flipping to allowed on day 31. The 2026-04-27 role-decisions change promoted Misba, Pradeep, Swati (and originally OpsHead Misba) to Admin, so they can already create CC rules via the Admin wildcard.
  - **Trigger:** any future OpsHead user who is *not* on the trusted core team is added before day 31 of their tenure.
  - **Implementation:** the day-31 action is a 1-line edit to add `'cc-rule:create'` to the OpsHead role's grant set in `src/lib/auth/permissions.ts`. The 30-day flip remains a per-user judgment call rather than calendar-driven.

### 10.4 UI and UX

- **Mobile drag is deliberately not in Phase 1.**
  - **Context:** kanban renders columns as a vertical stack on mobile (`md:flex-row` in `src/components/ops/KanbanBoard.tsx`); the W3-F.5 drag handle still renders, and TouchSensor (15px activation) is wired, but mobile is not a primary use case for Phase 1 (Anish + the Ops team work on desktop). Mobile cards are tap-to-detail; drag works in principle on tablets but is not the supported flow.
  - **Trigger:** testers report wanting kanban drag on phones.
  - **Implementation:** mobile-specific re-layout (e.g., a "move to..." dropdown alongside the handle) rather than relying on touch drag in a vertical-stack layout that does not visually accommodate drop zones.

- **No contextual helpers (per-page modals or tooltips) for first-time-tester confusion.**
  - **Context:** Anish considered adding inline `?` icons that pop a 1-2 sentence helper per surface. Decision: the `/help` orientation doc + the new W3-F.5 inline hint on `/` cover the discoverability gap; per-page contextual helpers would add maintenance burden and visual noise.
  - **Trigger:** round 2 testers report specific surfaces where `/help` or the inline hint did not orient them.
  - **Implementation:** add a `<HelpPopover>` component with target props pointing into the `HELP_*` content modules; mount on the surfaces testers flag.

- **Duplicate `<header><h2>Ops at a glance</h2></header>` in `/dashboard` layout.**
  - **Context:** `src/app/dashboard/layout.tsx` renders an extra header with the same title that `PageHeader` already shows. Pre-existing across the W3 series; the W3-F /dashboard alias did not introduce or fix it. Cosmetic; does not affect functionality or accessibility (single `<main>` invariant is still respected).
  - **Trigger:** any /dashboard layout cleanup pass, or tester feedback that the duplicate title looks unprofessional.
  - **Implementation:** delete the `<header>` block in `src/app/dashboard/layout.tsx` so the layout becomes a pass-through `<>{children}</>` (or remove the layout entirely if `/dashboard` no longer needs route-specific chrome). `PageHeader` in the page component continues to render the title.

- **`AuditLogPanel` renders all entries inline.**
  - **Context:** Phase 1 audit logs are small (most entities have 0-2 entries today; full-lifecycle MOUs project to 15-25 by 8-week pilot end), so unbounded inline rendering is fine.
  - **Trigger:** any entity's auditLog exceeds 30 entries in production.
  - **Implementation:** refactor `AuditLogPanel` to truncate-with-expand or paginate; extend `AuditFilterRail` to accept `entityId=<id>` for cross-route deep dives from detail pages back into `/admin/audit`.

- **`SyncFreshnessTile` is built but not mounted on `/overview`.**
  - **Context:** manual-trigger pattern means a "last sync N hours ago" tile does not add at-a-glance value. Operators click "Sync now" on `/admin` when they want fresh state; the timestamp + status surface there is sufficient.
  - **Trigger:** cron auto-sync lands.
  - **Implementation:** mount the existing `SyncFreshnessTile` component on `/overview` (the W3-F canonical Leadership Console route).

- **CC-rule disable confirmation uses `window.prompt` for the reason.**
  - **Context:** `CcRuleToggleRow.tsx` calls `window.prompt('Reason for disabling?')` on toggle-off. Functional, accessible-enough (screen readers handle native prompt), and small surface area; not a deal-breaker but visually inconsistent with the rest of the app.
  - **Trigger:** tester aesthetics feedback that the prompt feels like leftover debug UI.
  - **Implementation:** replace with the existing shadcn `Dialog` pattern used by `TransitionDialog`; require a non-empty reason; keep the same audit-write payload shape.

### 10.5 Email and templates

- **Email templates use modern CSS centring, not the legacy `align="center"` HTML attribute.**
  - **Context:** D3 `feedbackRequest` template uses `style="text-align:center;"`. Modern Outlook (365 / 2016+) and all webmail render this correctly; older Outlook (2007 / 2010) has patchier CSS support and may render the wrapper layout differently.
  - **Trigger:** older Outlook install surfaces in broader pilot and reports broken layout.
  - **Implementation:** swap to legacy `align="center"`, or include both attributes for redundancy. Same caveat applies to any future email templates.

- **PI / Dispatch / Delivery-Ack DOCX templates are authored programmatically with no embedded GSL logo.**
  - **Context:** the docx files in `public/ops-templates/` are production-quality but text-only. No image assets, no header band, no footer band. Output is correct and regulator-acceptable; the visual brand polish is missing.
  - **Trigger:** brand-polish ask from testers or from GSL's external-comms expectations.
  - **Implementation:** swap the docx files for designer-authored templates that embed the GSL logo and brand colours; the docxtemplater placeholders ({{piNumber}}, etc.) stay identical so no lib code changes.

- **D3 feedback request uses manual-send (Outlook clipboard) pattern; no SMTP integration.**
  - **Context:** the Compose surface renders the email body; the operator clicks "Copy to clipboard" and pastes into Outlook. Lib code that constructs the body is reusable and unit-tested.
  - **Trigger:** GSL wants automated sending (e.g., the Ops team is sending too many feedback requests for manual-clipboard to be tractable).
  - **Implementation:** swap the Copy button for a Send-via-provider button on the same compose surface; backend route accepts the same payload and dispatches via the chosen provider (SES, SendGrid, etc.). Audit log captures provider message id.

- **D4 delivery-ack URL is operator-pasted (Drive / SharePoint / Dropbox link).**
  - **Context:** there is no file-upload + storage infrastructure. Operators upload the signed handover form to their team's existing storage and paste the shareable link into the form.
  - **Trigger:** GSL wants centralised storage (e.g., compliance audit demands all signed handover forms in a single GSL-controlled location).
  - **Implementation:** add an S3-compatible storage layer (Vercel Blob or similar); replace the URL-paste field with a file-upload control; the lib mutator stores the resulting URL in the same field so consumers do not change.

### 10.6 Operational and runtime

- **No `/forgot-password` or `/account/password` route.**
  - **Context:** password recovery is a manual edit to `src/data/_fixtures/users.json` + `npm run seed:dev` per `docs/DEVELOPER.md` §"Password recovery (testers)".
  - **Trigger:** testers ask for self-service.
  - **Implementation:** standard email-token flow: POST `/api/forgot-password` enqueues a token, email contains a `/reset-password?token=...` link, GET renders a password form, POST `/api/reset-password` updates `passwordHash` via the queue. Reuse magic-link patterns already in the codebase.

- **`/api/health` is binary status only.**
  - **Context:** returns `{ status, timestamp, version }` for uptime monitors. The graded data-integrity view (queue depth, JSON validity, sync-runner pulse) lives on the dashboard tile instead.
  - **Trigger:** uptime monitor needs a graded health signal (e.g., paging on data-integrity drop, not just process up/down).
  - **Implementation:** extend `/api/health?detail=1` to surface the same checks the tile renders, gated behind a header token so external scrapers cannot enumerate internal state.

- **`config/company.json` ships with sample identity values.**
  - **Context:** Phase 1 testing uses `Get Set Learn Private Limited` + a sample GSTIN + sample bank so generated PIs / dispatch notes / delivery acks render end-to-end with realistic shapes.
  - **Trigger:** production launch (the first PI that leaves the system to a real school).
  - **Implementation:** Anish edits `config/company.json` with real registered legal entity, real GSTIN, real registered office address (multi-line array), real bank account details (multi-line array), and confirms the GST rate (18% standard for educational services per current CBIC notification). No code changes; the file edit propagates everywhere.

- **`import-tick` and `sync/tick` are admin-triggered manually via `/admin`.**
  - **Context:** Phase 1 keeps sync simple: an Admin clicks "Run import sync now" or "Run health check now" on `/admin`; lib code runs the same path that a cron-runner would. No GitHub Actions workflow attached yet.
  - **Trigger:** sister-project MOU volume grows beyond manual-trigger comfort (e.g., the Ops team forgets to run sync for several days and stale data starts confusing the kanban).
  - **Implementation:** port the gsl-mou-system GitHub Actions workflow YAML; add shared-secret bearer auth alongside session auth so the cron call does not need a logged-in user; mount `SyncFreshnessTile` on `/overview` (see 10.4).

- **No reverse-Excel-sync; the app is the single source of truth.**
  - **Context:** per `CLAUDE.md`, the legacy `Mastersheet-Implementation_-_AnishD.xlsx` in `ops-data/` is what we migrated AWAY from. The app does not write back to Excel. Reverse-sync is net-new work, not a deferral.
  - **Trigger:** GSL wants a spreadsheet view restored (likely for stakeholders who do not log in to the app).
  - **Implementation:** add a read-only `/admin/export-excel` route that streams a freshly-generated `.xlsx` from current state. Single-direction; consumers treat the export as a snapshot, not a sync target.

### 10.7 Operational notes (developer environment)

- **Windows: orphaned node processes after killed smoke-test or dev-server runs.** The `scripts/smoke-test.sh` trap-based cleanup occasionally leaves child node processes holding ports 3000-3003. On the next dev-server start, Next.js auto-shifts to port 3004 and serves through stale `.next` chunks, which can cause cascading 500s on routes (most often `/feedback/[tokenId]` because its placeholder is the simplest). Workaround when this happens: kill all node processes (`taskkill //F //IM node.exe` on Windows, `pkill -f "next dev"` on macOS/Linux) and `rm -rf .next` before restarting. Not a code defect; an artefact of the Windows process model + Next dev-cache interaction.

---

## 11. Week 4 redesign backlog (W4-A through W4-I)

The Week 3 walkthrough surfaced 12 substantive issues that needed deeper redesign than the W3 polish allowed. The user-approved Week 4 plan ships these across 9 batches (W4-A foundation cleanup through W4-I final verification). Items below capture decisions and deprecations that ship inside the W4 series; they are not Phase 1.1 deferrals (those stay in §10).

### 11.1 W3 dispatch-raise drag flow [CLOSED W4-D.4]

- **Original context:** dragging a kanban card from `actuals-confirmed` into `kit-dispatched` opened the forward-by-1 dialog and routed to `/mous/[id]/dispatch`. The form there posted to `/api/dispatch/generate` with only a hidden `mouId`; the route handler required `installmentSeq` and 303-redirected with `?error=invalid-installment-seq`. The W3 form never grew an `installmentSeq` `<select>`.
- **Closed by:** W4-D.4 (commit `59b6a60`). `/mous/[id]/dispatch` repurposed as the workflow-state-aware Ops surface. Direct-raise form now exposes a wired `installmentSeq` dropdown (installments already raised are disabled to prevent collisions). Pending DispatchRequests for the MOU surface in a top-of-page alert with linkbacks to the conversion admin so Ops does not raise duplicates. Multi-SKU and per-grade dispatches are routed to `/dispatch/request` via an inline link.

### 11.2 W4-A.1 chain-MOU heuristic exception (3 IDs whitelisted)

- **Context:** `src/lib/importer/fromMou.ts` quarantines MOU records when `studentsMou > 1500` (single-school plausibility ceiling) under the chain-MOU heuristic. The Week 3 import quarantined 4 MOUs this way: MOU-STEAM-2627-016 (Tathastu Innovations Meerut, 2000), -018 (SD Senior Secondary, 1700), -051 (Ramanarayana Education Trust, 7950), and MOU-STEAM-2526-027 (Narayana School, 2000).
- **Decision (W4-A.1):** the first three are legitimately large single-school sites in Anish's active 51-list, so a one-shot migration approves them as `schoolScope: 'SINGLE'` and lands them in `mous.json` with audit-trail entries explaining the override. The fourth (MOU-STEAM-2526-027) is not in the active list and stays quarantined; the heuristic correctly catches its chain-affiliation pattern.
- **No global threshold relaxation:** Tathastu and Narayana both carry `studentsMou: 2000`, so any global threshold raise above 1500 would auto-pass both. The whitelist approach is the only correct shape here.
- **Future imports:** the dedup-by-id check in `fromMou.ts` skips records whose IDs already exist in `mous.json`, so re-running the importer will not re-quarantine the 3 approved IDs. No code change to the heuristic itself; the audit log on each MOU records the W4-A.1 manual override.

### 11.3 cohortStatus orthogonal to MouStatus (W4-A.2)

- **Context:** prior to W4-A.2, MOU lifecycle (Active / Pending Signature / Completed / Expired / Renewed) was the only first-class status concept. The kanban + /mous list showed every MOU regardless of academic-year cohort, so prior-AY records (the 92 MOU-STEAM-2526-* and MOU-YP-2526-* rows) cluttered the operationally-current view.
- **Decision:** added `cohortStatus: 'active' | 'archived'` as an orthogonal field. The W4-A.2 fixture migration tagged the 51 IDs in Anish's active list as `'active'` and the remaining 92 as `'archived'`. A 'Pending Signature' MOU can be cohortStatus 'active' (pursuit-in-progress) or 'archived' (lapsed pursuit) independently.
- **W4-F implication:** when the sales-pipeline pre-MOU work lands, the type may grow a `'pre-launch'` value alongside active / archived. The kanban filter expression should keep working unchanged because its check is already strictly `cohortStatus === 'active'`.

### 11.4 Post-signing intake stage (W4-C)

- **Context:** GSL ran a 16-field Google Form (`MOU_Signing_Details_2026-2027__Responses_.xlsx`) for post-signing intake. The form's owner field had mixed semantics (sales rep / school principal / school name / co-owner string) and validation was untyped; data quality varied row-to-row.
- **Decision:** the intake moves on-system as the new `post-signing-intake` lifecycle stage (column 3 in the kanban; between mou-signed and actuals-confirmed). New `IntakeRecord` entity (1-to-1 with MOU in Phase 1) captures 22 fields per the W4-C recon table; Account Owner splits into `salesOwnerId` (FK; required) + `schoolPointOfContactName` + `schoolPointOfContactPhone`.
- **Cohort gate auto-skip for archived MOUs:** the intake stage is mandatory for active-cohort MOUs going forward; archived-cohort MOUs (the 92 prior-AY rows) bypass via the same inheritance pattern as cross-verification (`mou.cohortStatus === 'archived'` → intake's enteredDate inherits from signedDate). Without this auto-skip, archived MOUs would all collapse to the new column and the historical lifecycle visualisation on `/mous/[id]` would falsely claim they are blocked at intake.
- **Backfill (W4-C.4):** 23 of 24 historical Google Form responses auto-import via `scripts/w4c-backfill-intake.mjs` per the per-row mapping in that script's header. Row 24 (GMR International School) quarantines because no matching MOU exists in the active 51-list; deferred for Anish to add the MOU separately. 11 backfilled records preserve the original 2026-03-02-style thank-you-sent dates verbatim; 12 records have `thankYouEmailSentAt: null` and need a fresh send via the W4-C.3 compose-and-copy flow.
- **gslTrainingMode form-to-system enum mapping:** the form's `'GSL Trainer'` and `'Train The Trainer (TTT)'` are stored verbatim on the IntakeRecord; comparison against `MOU.trainerModel` (`'GSL-T'` / `'TT'` / `'Bootcamp'` / `'Other'`) maps `'GSL Trainer' ↔ 'GSL-T'` and `'TTT' ↔ 'TT'`. Variance flagged in the audit when they disagree; the lib does not auto-update `MOU.trainerModel` (record-on-intake-only per W4-C decision).
- **W4-D implication:** dispatch redesign should consume `IntakeRecord.gslTrainingMode` (the latest school-confirmed value) rather than `MOU.trainerModel` (historical baseline).
- **Don Bonsco typo fix:** `MOU-STEAM-2627-027` and the linked school had a "Bonsco" typo in their displayName. W4-C.1 fixed `mou.schoolName` and `school.name` but left `school.id` (`SCH-DON_BONSCO_KRISHNANA`) unchanged so existing audit FKs continue to resolve.

### 11.5 W4 backlog: items deferred from W4-C

- **`mou-signed` next-step label** retired pre-W4-C as `Confirm actuals`; W4-C.1 reframed to `Capture intake details`. Single-line update in `STAGE_NEXT_STEP` map; no further action needed.
- **W4-C.3 compose-and-copy panel + mark-sent UI**: lib (`composeThankYou`) + template authored. The panel UI (`<ComposedThankYouPanel>`) and mark-sent route are deferred to a polish batch within W4 (likely W4-I); the pattern mirrors `ComposedFeedbackRequestPanel.tsx` + `/api/communications/[id]/mark-sent`.
- **Payment-recorded audit join on `/mous/[id]`**: the AuditLogPanel reads `mou.auditLog` only; `Payment.auditLog` entries (W4-B.5) and the `IntakeRecord.auditLog` entries (W4-C.2) are NOT yet surfaced on the MOU detail page. Add the join in `aggregate.ts` during the W4-I documentation pass (or earlier if convenient).
- **`scripts/w4c-backfill-manual-review-2026-04-27.csv`**: emitted alongside the backfill report. Currently lists only Row 24 GMR (quarantined); future re-runs may add new entries if Anish adds further responses upstream.

### 11.6 W4-D dispatch redesign (multi-SKU + Sales request flow)

- **Schema (W4-D.1):** `Dispatch` extended with `lineItems: DispatchLineItem[]` (discriminated union: `flat` for TinkRworks-style single-quantity rows, `per-grade` for Cretile-style allocations), `requestId: string | null`, `raisedBy: string`, `raisedFrom: 'sales-request' | 'ops-direct' | 'pre-w4d'`. `Dispatch.mouId` flipped to nullable (P2 override pilots like DIS-002 carry null until the MOU lands). New `DispatchRequest` entity captures Sales-side intent before Ops conversion. 5 pre-W4-D fixtures migrated with placeholder line items + `raisedFrom='pre-w4d'` sentinel.
- **Sales flow (W4-D.2):** `/dispatch/request` Client form lets Sales submit DispatchRequests against active-cohort MOUs. `createRequest` lib runs the 8-rule validation matrix: V1 cohort + V2 sales-owner block submit; V3 intake / V4 SKU-programme / V5 student count variance / V6 grade range / V8 duplicate pending all surface as warnings (allow submit, captured in audit notes); V7 submitter-not-intake-owner is audit-only.
- **Ops flow (W4-D.3):** `/admin/dispatch-requests` queue with status filters; `/admin/dispatch-requests/[id]` detail with approve / reject / cancel forms. Approve creates a Dispatch with `raisedFrom='sales-request'` and `requestId` set; `lineItemsOverride` (Specific B path b) lets Ops edit line items during conversion, with the audit recording the edit. Cancel-by-requester is the implicit ownership rule; Ops with `dispatch-request:review` can also cancel. New permissions: `dispatch-request:create` (Admin + SalesHead + SalesRep), `dispatch-request:review` (Admin + OpsHead).
- **Workflow-aware /mous/[id]/dispatch (W4-D.4):** Specific C path (a). Pending DispatchRequests for the MOU surface at top with linkbacks to the conversion admin (avoids duplicate Dispatches). Direct-raise form now wires `installmentSeq` (closes W3 form bug §11.1). Existing-dispatches list shows a `raisedFrom` badge.
- **DOCX (W4-D.5):** single template with conditional sections via docxtemplater `{#hasFlatItems}{/hasFlatItems}` + `{#hasPerGradeItems}{/hasPerGradeItems}`. Three rendering shapes: flat-only, per-grade-only, mixed. `flatItems` and `perGradeRows` (flattened from per-grade allocations) feed the table loops. `TOTAL_QUANTITY` replaces the old `TOTAL_KITS`. Re-run `node scripts/generate-dispatch-template.mjs` after editing the generator.
- **Kanban (W4-D.6):** `STAGE_NEXT_STEP['kit-dispatched']` renamed from "Record signed form" to "Confirm delivery"; same rename applied on `/mous/[id]/delivery-ack` page + help orientation. **Audit fidelity:** historical audit entries that used "Record signed form" wording stay verbatim. Only NEW entries from W4-D.6 onward use "Confirm delivery". The principle: audit captures what happened, not what we currently call it.
- **Round-2 fixtures:** `dispatch_requests.json` ships 2 pending DRs (one flat MOU-STEAM-2627-001, one per-grade MOU-STEAM-2627-009) so the queue + detail render meaningful data and round-2 testers have approve targets.

### 11.7 W4-E SPOC + reminders + notifications redesign

W4-E adds the "between-people" layer of the operational system: per-school SPOC directory, manual-cadence chase reminders, internal in-app notifications, and a subtle UX colour pass that distinguishes urgency / programme / category at a glance. Eight sub-tasks (W4-E.1 schema → W4-E.7 docs); pause-and-report after each.

- **Schema foundation (W4-E.1):** new `SchoolSPOC` entity (1-to-many with School; primary | secondary role) and `Notification` entity (recipient-scoped; 6 trigger kinds initially, grew to 8 in W4-E.5). 4 new `CommunicationType` reminder values (`reminder-intake-chase` / `reminder-payment-chase` / `reminder-delivery-ack-chase` / `reminder-feedback-chase`). 4 new `AuditAction` values (`school-spoc-imported-from-db`, `reminder-composed`, `reminder-marked-sent`, `notification-marked-read`). 5 new permission Actions: `spoc:import` (Admin only), `reminder:create` (Admin + OpsHead + SalesHead + SalesRep), `reminder:view-all` (Admin only), `notification:read` + `notification:mark-read` (baseline-granted to every authenticated role).

- **SPOC DB import (W4-E.2):** independence-axis verification table generated at `scripts/w4e-spoc-import-verification-2026-04-28.json` using city + location-weighted token match (different code path from W4-C.7 + W4-D.8). 57 source rows from `ops-data/SCHOOL_SPOC_DATABASE.xlsx` (3 sheets: South-West 23 + East 19 + North 15) expanded to 59 verification entries (1 multi-POC source row → 3 entries). Phase 2 mutation landed 44 SchoolSPOC records in `school_spocs.json`; 15 rows quarantined to D-019 (Chennai cluster + St. Anns + East11 St. John's contingency demote + 5 ambiguous + SW9 Xavier conservative). Cross-reference statistics on imports: intake-only 9, dispatch-only 4, both 3, none 28. Re-run-match overrides: East15 St. Monforts → SCH-ST_MONTFORT_S_SR_SEC, East16 St. Pauls Mission → SCH-ST_PAUL_S_MISSION_SC, North11 BIT Global Meerut → SCH-B_I_T_GLOBAL_SCHOOL.

- **CC rules audit pass (W4-E.3):** 10 SPOC DB top-of-sheet rules audited against 10 `cc_rules.json` entries. Findings: 3 clean-match, 4 context-drift, 3 unmatched-spoc-db, 4 derived-cc-rules. Phase 2 mutation: 2 added (CCR-SW-TAMIL-NADU with sp-balu_r, CCR-NORTH-GR-INTERNATIONAL with sp-sahil tentative); 3 deferred to D-022 (CCR-SW-HYDERABAD, CCR-SW-MAHARASHTRA, CCR-TTT-ALL; all blocked on Shushankita / Kranthi / Pooja Sharma not yet mapped to User rows); CCR-NORTH-1-7 stays at all-communications scope per Anish (operational practice, D-021 captures the upstream SPOC DB header text fix). cc_rules.json grew 10 → 12 entries. ccResolver union behaviour proven by synthetic test in `src/lib/ccRules/w4eAuditFixes.test.ts` so CCR-TTT-ALL can land later as a config-only change.

- **Reminder lib + 4 templates + /admin/reminders (W4-E.4):** thresholds in `src/data/reminder_thresholds.json` (intake 14d, payment 30d, delivery-ack 7d, feedback-chase 7d) editable without code change. `detectDueReminders.ts` produces `DueReminder[]` sorted by daysOverdue desc; archived cohort + missing-related-entity short-circuits skip silently. `composeReminder.ts` renders the per-kind template via mustache placeholders, resolves CC list via `resolveCcList` on the new `CcRuleContext` values (`intake-reminder` / `payment-reminder` / `delivery-ack-reminder` / `feedback-chase`), writes a Communication with status='queued-for-manual', and audits with the `reminder-composed` action. `markReminderSent.ts` is the idempotent flip companion. `/admin/reminders` lists due reminders with kind-chip + sales-owner filters; per-row Compose link routes to a preview / compose-and-copy panel. Phase 1 is one reminder type per scenario; D-023 captures the Phase 2 cadence escalation if round-2 testers report manual re-trigger friction.

- **Notification lib + trigger wiring (W4-E.5):** `payload_contracts.ts` is the single source of truth for what each `NotificationKind` carries; runtime validators in `createNotification` reject calls with missing or wrong-typed fields. `createNotification` (single) + `broadcastNotification` (multi) implement self-exclusion (real-user `senderUserId === recipientUserId` drops with reason 'self'; system sender bypasses) + idempotency dedup on `(kind, recipientUserId, relatedEntityId)` within a 60s window. 7 trigger sites wired: createRequest (broadcast Admin + OpsHead), approveRequest (single → requester), rejectRequest (single → requester), cancelRequest (broadcast Admin + OpsHead), recordIntake (broadcast Admin + OpsHead), recordReceipt (broadcast Finance + sales-owner via `SalesPerson.email` → `User.email` mapping), feedbackAutoEscalation (single → lane head; sender='system'), composeReminder (single → MOU sales-owner). Notification fan-out is best-effort: failures `console.error` but do NOT roll back the parent entity write; the entity is source of truth, a missed notification is recoverable from the queue surface.

- **TopNav bell + /notifications page (W4-E.6):** `<NotificationBell>` server component reads filtered notifications + delegates to `<NotificationBellClient>` for the dropdown open/close state. Badge: numeric 1..9 / "9+" cap at 10+ / hidden at 0. Click on a row routes through `/notifications/[id]/visit` (GET-only route handler that markRead + redirects to `actionUrl`). The `/notifications` page lists own notifications with 10 filter chips (All / Unread / 8 NotificationKind values) and a Mark-all-read form (visible only when unread > 0). Phase 1 is refresh-on-page-navigation; D-025 captures the Phase 2 real-time polling trigger.

- **UX colour polish (W4-E.6.5):** subtle functional colour using existing brand + signal tokens (no new design tokens introduced). MouCard left-edge stripe (4px) maps `daysInStage` vs lifecycle threshold to `ok` / `attention` / `alert` / `none` (terminal + holding stages render transparent stripe). Programme accent chip near school name (STEAM `bg-brand-teal/10`, TinkRworks `bg-brand-navy/10`, Young Pioneers `bg-violet-100`; Harvard HBPE + VEX render no chip). Trigger tile category tints on `/overview` (sales `bg-brand-teal/[0.06]`, ops `bg-brand-navy/[0.04]`, finance `bg-emerald-500/[0.06]`, cross `bg-amber-500/[0.05]`). Every colour decision pairs with text / icon / aria-label so colour is never the only signal (WCAG 2.1 AA). Broader-pass observations rejected reminders-row tint and notifications-row tint as redundant with existing kind-badge / unread-blue UI.

- **Deferred items added in W4-E:** D-015 (SPOC DB coverage gap, 67 schools) · D-016 (North sheet rule 1 typo "East Schools" inside North file) · D-017 (multi-POC primary/secondary heuristic confirmation) · D-018 (Phase 2 proactive dispatch confirmation email) · D-019 (15-row schools.json gap from SPOC import) · D-020 (Jaffaria Academy multi-POC parser fix; Hassan + Fiza unseparated cell) · D-021 (CCR-NORTH-1-7 scope vs SPOC DB header text mismatch) · D-022 (3 deferred cc-rules + 2 partial mappings; Shushankita / Kranthi / Pooja Sharma / Rajesh / Sahil-Sharma confirmation) · D-023 (Phase 2 reminder cadence escalations) · D-024 (Phase 2 sales-rep User onboarding for notification fan-out) · D-025 (Phase 2 real-time notification polling). 11 entries; round-2 triage email reads from W4-DEFERRED-ITEMS.md.

### 11.8 W4-F sales pipeline minimal container (option C)

W4-F adds a pre-MOU pipeline tracker. Anish chose option C (minimal container; no state machine, no approval workflow, no conversion-to-MOU flow) after the W4-F recon found that the Mastersheet Sheet1 sales-pipeline source was a 2-row stub template with zero operational data. Building a state machine without operational input would embed assumptions about Pratik's actual sales process that may not match reality. Post-round-2 interview with Pratik + Shashank (D-026) defines the workflow vocabulary; today's container captures the data so the round-2 conversation has actual examples to ground in.

- **Schema (W4-F.1):** `SalesOpportunity` entity with 12 mutable fields. `schoolName` is free-text; `schoolId` is nullable FK populated when a recce confirms a stable record. `programmeProposed` re-uses the existing `Programme` enum so the eventual conversion-to-MOU pre-fill stays consistent. `status` / `recceStatus` / `gslModel` / `approvalNotes` are FREE-TEXT (no enum normalisation). `schoolMatchDismissed: boolean` flags whether the operator has dismissed the did-you-mean inline suggestion. 3 new `AuditAction` values: `opportunity-created` / `opportunity-edited` / `opportunity-marked-lost`. 4 new permission Actions: `sales-opportunity:create` (SalesRep + SalesHead + Admin) · `sales-opportunity:edit` (same; lib enforces own-row vs any-row via `createdBy` comparison) · `sales-opportunity:view` (every active role baseline-granted) · `sales-opportunity:mark-lost` (SalesRep + SalesHead + Admin).

- **List + create (W4-F.2):** `/sales-pipeline` lists opportunities with three filters (sales rep default `mine` for SalesRep / `all` for Admin/SalesHead; region; free-text search across status / schoolName / city). `/sales-pipeline/new` is a 12-field form; SalesRep with email matching a SalesPerson sees the rep id pre-filled (hidden); Admin/SalesHead picks from a dropdown. Status help-text flags "round 2 will formalise". Form is server-action driven; no client-side state.

- **Detail + edit + mark-lost (W4-F.3):** `/sales-pipeline/[id]` renders all 12 fields plus the audit log. `/sales-pipeline/[id]/edit` is a 12-field edit form; status edits land verbatim in the audit log with before/after capture so the round-2 vocabulary review stays faithful. `/sales-pipeline/[id]/mark-lost` captures a mandatory free-text loss reason; the row stays visible for history. List page gains an Active / Lost / All chip group (default Active); lost rows render dimmed background + "Lost" pill. Did-you-mean inline panel surfaces when `schoolId === null` and `schoolMatchDismissed === false` and `findSchoolMatch` returns a candidate above the 0.7 token-overlap threshold; two action forms (Link to existing / Keep as new school) close the loop.

- **Held back per option C (explicit list of NOT-built features):**
  - No status enum or transition validation (status / recceStatus / gslModel free-text)
  - No `sales-opportunity:approve-l1` / `approve-l2` / `convert-to-mou` permission Actions
  - No approve / reject buttons; no approval queue (`/admin/sales-approvals` does not exist)
  - No convert-to-MOU button or pre-fill MOU form
  - No notification triggers on opportunity status changes
  - No backfill of the 2 historical Hirak T stub rows (Embee Rosebud + Learning Sanctuary already exist as MOU-STEAM-2627-010 / -011; adding `status='converted'` SalesOpportunity records would carry zero operational value)
  - No autocomplete for status / recceStatus / gslModel (zero starting rows make autocomplete value zero on day one)

- **Cross-reference with W4-D dispatch flow:** the W4-D `DispatchRequest` lifecycle is mature (V1-V8 validation, approval / rejection / cancellation, conversion-to-Dispatch with `lineItemsOverride`). W4-F is deliberately the opposite: minimal container; no validation beyond required fields; no transitions. The asymmetry reflects scope reality: W4-D had concrete operational data (the Mastersheet TWs + Cretile sheets + Pratik / Misba intel) to ground the design; W4-F does not.

- **Deferred items added in W4-F:** D-026 (workflow definition; 7 sub-bullets covering states / approval flow / conversion trigger / recce vocabulary / GSL Model alignment / ownership transfer / vocabulary autocomplete migration) · D-027 (Phase 1.1 AY rollover verification across all entity ID prefixes; first live rollover April 1, 2027). Deferred-items registry now spans D-001 through D-027 (27 entries); see "W4-I planning note" below for round-2 segmentation guidance.

### 11.10 W4-G inventory tracking

W4-G adds the per-SKU inventory layer: stock counts, reorder thresholds, automatic decrements at every Dispatch raise / approval, low-stock notifications, and pre-emptive V9 warnings on Sales-side DispatchRequests. Seven sub-tasks across ~8 commits (G.1 schema · G.2 verification table · G.3 backfill mutation · G.4 decrement integration · G.5 threshold edit lib · G.6 UI + dispatch integration · G.7 docs).

- **Schema foundation (W4-G.1):** new `InventoryItem` entity (12 fields including `currentStock`, `reorderThreshold`, `category` enum (`TinkRworks` | `Cretile` | `Other`), `cretileGrade` integer-or-null, `mastersheetSourceName` for audit, `active` flag for sunset). 4 new `AuditAction` values: `inventory-imported-from-mastersheet`, `inventory-stock-edited`, `inventory-threshold-edited`, `inventory-decremented-by-dispatch`. New `inventory-low-stock` `NotificationKind` (8 → 9). 2 new permission Actions: `inventory:view` (baseline-granted to every active role) · `inventory:edit` (OpsHead + Admin).

- **Backfill (W4-G.2 + W4-G.3):** independence-axis verification table at `scripts/w4g-inventory-import-verification.mjs` (SKU-normalisation + Dispatch-corroboration; verbose-Mastersheet-name to simple-Dispatch-name mapping via TINKR_NAME_MAP regex array). 21 verification entries: 17 AUTO-IMPORT, 3 MANUAL-REVIEW, 1 SKIP-HEADER. Anish row-by-row resolutions: P3 Project Kit AUTO-IMPORT (real SKU); Tinkrsynth + Tinkrsynth Mixer PCB AUTO-IMPORT with `active: false` (sunset). Mutation landed 20 InventoryItem records: 8 Cretile per-grade (G3-G10) · 10 TinkRworks (8 active + 2 sunset) · 2 placeholders (Push Pull Pin + Steam Academy with `currentStock: 0`; D-034 captures the placeholder fill).

- **Decrement integration (W4-G.4):** `decrementInventory.ts` is a pure plan-then-apply lib: walks `Dispatch.lineItems` (flat or per-grade), aggregates same-SKU deductions, validates aggregate stock against `currentStock`, applies. 5 hard-block scenarios (the Dispatch creation aborts with `inventory-decrement-failed`): `sku-not-found` (flat lineItem skuName has no matching InventoryItem), `cretile-grade-not-found` (per-grade allocation has no matching Cretile per-grade row), `insufficient-stock` (aggregate request exceeds `currentStock`), `sku-sunset` (matching item is `active: false`), `invalid-flat-cretile-line` (defensive: a flat lineItem must NOT use the Cretile generic SKU). The lib mirrors a single rolled-up `inventory-decremented-by-dispatch` audit on the Dispatch and a per-item audit on each InventoryItem. Each updated InventoryItem is enqueued separately. `raiseDispatch` and `approveRequest` both wrap the decrement BEFORE the parent enqueues so a stock failure prevents Dispatch creation.

- **Pre-W4-D safeguard:** the 22 historical dispatches backfilled via W4-D.8 carry `raisedFrom = 'pre-w4d'`. When `decrementInventory` sees that value at the top of the function, it returns `ok: true` with empty arrays (no decrement). Reason: Mastersheet "Current Inventory" already represents post-historical-shipment state; decrementing again would double-deduct.

- **V9 stock-availability-warning (W4-G.4 in createRequest):** non-blocking warning at DispatchRequest submission. The lib's `checkStockAvailability` helper aggregates demand per-SKU and per-Cretile-grade across this request plus all other pending DRs (self-excluded via `mouId + installmentSeq` dedup), and warns when `requested + pending > currentStock`. Surfaced in the form via `WARNING_LABELS['stock-availability-warning']`. The warning is informational; the hard-block at conversion is the final gate.

- **Low-stock notification (W4-G.4):** broadcast to active Admin + OpsHead the moment a SKU crosses its `reorderThreshold` downward via decrement. Trigger predicate: `previousStock > threshold && newStock <= threshold` (only the crossing transition fires; subsequent decrements while below threshold do not re-broadcast). Threshold `null` means no alert. Best-effort fan-out: failures `console.error` but do NOT roll the Dispatch back. D-028 captures the operational input from Misba/Pradeep on per-SKU thresholds.

- **Threshold + edit lib (W4-G.5):** `editInventoryItem.ts` covers the 4 mutable fields (currentStock, reorderThreshold, notes, active). Immutable: id, skuName, category, cretileGrade, mastersheetSourceName. Audit codes: `inventory-stock-edited` (umbrella) for stock-only / mixed / notes-only / active-only edits; `inventory-threshold-edited` for the threshold-only path. Before / after diff captures every changed field regardless of which audit code was picked. Validation: stock and threshold both non-negative integers (threshold also accepts null).

- **UI + dispatch integration (W4-G.6):** `/admin/inventory` list with category + status filters and Low / Out / Sunset chips (text-paired, never colour-only). `/admin/inventory/[id]` detail with the edit form (OpsHead + Admin), recent decrement history (last 10 dispatches), and full audit log; `?saved=1` confirmation banner. `InventoryStatusPanel` on `/mous/[mouId]/dispatch` shows the programme-derived SKU's current stock pre-emptively; explicit warning when the SKU is missing from inventory_items.json. V9 warning label wired into DispatchRequestForm. `/admin` index gains an Inventory tile.

- **Threshold config decision:** thresholds live on `InventoryItem.reorderThreshold` (per-SKU field already in W4-G.1 schema). NO separate `inventory_thresholds.json` file. Reasoning: the threshold is per-SKU, not global, so a separate file would duplicate the entity field. Contrast with `reminder_thresholds.json` which IS a separate file because reminder thresholds are global (same 14/30/7/7 day-counts for every MOU). Pattern: per-entity config = entity field; global config = JSON file. Logged in role-decisions.md.

- **TopNav inventory link decision:** deferred. The /admin tile is sufficient for OpsHead+Admin discovery in Phase 1; topnav real estate stays focused on cross-cutting links. Re-evaluate at round 2 per D-037 if Misba/Pradeep flag the extra hop.

- **Deferred items added in W4-G:** D-028 (reorder thresholds; Misba/Pradeep operational input) · D-029 (Phase 2 stock history sparklines) · D-030 (Phase 2 reorder PO generation + supplier directory) · D-031 (Phase 2 multi-warehouse stock locations) · D-032 (negative-stock policy revisit; current behaviour is hard-block) · D-033 (Mastersheet "TinkRworks - Reusable Kits 1330" header reconciliation; figure does not match column sum) · D-034 (Push Pull Pin + Steam Academy stock placeholder fill) · D-035 (Cretile per-grade demand markers Req: Grade N-M; formal modelling vs operator notes) · D-036 (Tinkrsynth tail-end stock decision; 3 units in sunset awaiting ship/write-off/reactivate) · D-037 (TopNav inventory link deferral). 10 entries; total registry now spans D-001 through D-037 (37 entries).

### 11.11 W4-H kits handover worksheet

W4-H adds the school-facing printable handover form (`Regular_Kits_Handover_template.xlsx` from `ops-data/`, re-rendered as a docxtemplater .docx) plus a re-download surface for the GSL-internal dispatch note. Five sub-tasks across 3 commits (H.1+H.2 template + lib · H.3+H.4 routes + UI · H.5 docs).

- **Template authoring (W4-H.1):** `public/ops-templates/handover-template.docx` (landscape, 11 columns) generated by `scripts/w4h-author-handover-template.mjs`. Mirrors the source xlsx layout: title row, header fields (SCHOOL NAME / BRANCH / TRAINERS ALLOCATED / dispatch metadata), band-label row with shading + gridSpan (HANDED OVER BY TRAINER over cols 1-8 · HANDED OVER TO SCHOOL RESPONSIBLE PERSON over cols 9-10 · COMMENTS IF ANY over col 11), column header row, single looped data row carrying `{#detailRows}` open at the SR cell and `{/detailRows}` close at the PERSON SIGNATURE cell (docxtemplater paragraphLoop:true mode handles row duplication). Footer: TOTAL_QUANTITY summary plus the bilateral-signature requirement copy.

- **Generator lib (W4-H.2):** `src/lib/dispatch/generateHandoverWorksheet.ts` is a pure render function. `flattenLineItems` walks the discriminated `DispatchLineItem` union: `kind='flat'` → 1 row with `grades: 'All grades'`; `kind='per-grade'` → N rows with `grades: 'Grade {n}'`. SR is a continuous 1..N counter so mixed dispatches read naturally on the printed page. `branchOf` derives BRANCH from `School.legalEntity` only when distinct from `name` (else blank). Header date prefers `Dispatch.poRaisedAt`; falls back to `now()` if absent. TIME and bilateral-signature columns ship blank for handwritten on-site fill (D-038 captures the Phase 1.1 trainer-roster lib trigger for TRAINER_NAMES pre-fill). 9 placeholders documented in `HANDOVER_TEMPLATE` spec; 10 unit tests cover all 3 shapes + SR continuity + TOTAL_QUANTITY accuracy + branch derivation + poRaisedAt vs now() + template-missing failure.

- **Smoke-test discipline:** for DOCX generation specifically, unit tests on the lib are necessary but not sufficient: they verify the render machinery, not that the .docx file on disk parses correctly when docxtemplater hits it. W4-H.2 included a real-template smoke render (rendered the actual handover-template.docx with sample data; output 9,949 bytes; layout verified end-to-end). For any future template change (this template, dispatch-template.docx, pi-template.docx, delivery-ack-template.docx), re-smoke-test before merge. Round-2 walkthrough should ask testers to download a sample handover worksheet + dispatch note + visually inspect in Word / Google Docs to surface any rendering regression early.

- **Download routes (W4-H.3 + W4-H.4.1):** `GET /api/dispatch/[id]/handover-worksheet` (W4-H.3 primary) + `GET /api/dispatch/[id]/dispatch-note` (W4-H.4.1 symmetry fix). Both: auth → 303 to /login if missing; 404 on dispatch / mou / school not-found; stream docx with `Content-Disposition: attachment` plus filename `HandoverWorksheet-<id>.docx` or `DispatchNote-<id>.docx`. The handover route adds `x-row-count` + `x-total-quantity` response headers for ops debugging. Both append a 60s-dedup'd audit entry on `Dispatch.auditLog` via fire-and-forget `enqueueUpdate` (queue failures `console.error` but do NOT block the download). 2 new `AuditAction` values: `handover-worksheet-downloaded` + `dispatch-note-downloaded`.

- **AUTHORISED_BY preservation on dispatch-note re-download:** the re-render route looks up `dispatch.raisedBy` against `users.json` and uses that user's name as `raisedByName` in the placeholder bag. Falls back to `dispatch.raisedBy` literal string when the user record is missing (deactivated user). `ts` for the bag is `dispatch.poRaisedAt` (not `now()`) so DISPATCH_DATE stays stable across re-downloads. The printed copy reflects historical reality of who authorised the shipment; the downloader's identity is captured in the audit log entry, not the document.

- **60s audit dedup helper:** `src/lib/dispatch/auditDownloadDedup.ts` is a pure function. Match key `(user, action)` so different users get separate audit entries (we want to know who downloaded and when), but the same user re-clicking within `DOWNLOAD_DEDUP_WINDOW_MS = 60_000` lands one entry. Mirrors the W4-E.5 createNotification idempotency pattern. 7 unit tests cover empty log, action-mismatch, time-cutoff boundary, multi-entry log selection.

- **UI integration (W4-H.4):** per-row Worksheet + Note download links on `/mous/[mouId]/dispatch` Existing dispatches list. Both: download icon SVG + text label, `min-h-11` (44px) touch target, `focus:ring-2` on `brand-navy`, `aria-label` naming the dispatch id, `data-testid` for test selectors, `download` attribute on the anchor.

- **raiseDispatch.ts minimal export change:** `buildPlaceholderBag` + `renderDispatchDocx` + `CompanyConfig` go from file-private to exported so the dispatch-note re-render route reuses the same bag/render path the raise flow uses. Zero behaviour shift; the existing 20 raiseDispatch tests still pass unchanged.

- **Implicit permission gate:** both download routes use the existing MOU read access (a user who can see the dispatch on /mous/[id]/dispatch can download). No `dispatch:download-handover-worksheet` Action defined; permission Action sprawl avoided. The worksheet contents are fully visible on /mous/[id]/dispatch already.

- **Deferred items added in W4-H:** D-038 (Phase 1.1 per-MOU trainer roster lib for handover-worksheet TRAINER_NAMES pre-fill; currently renders blank for handwritten fill). 1 entry; total registry now spans D-001 through D-038 (38 entries).

### 11.9 W4-I round-2 testing email composition guidance

The deferred-items registry has grown across W4-A through W4-H to 38 entries. The round-2 testing email risks becoming substantial if every entry surfaces flat. Composition guidance for W4-I:

- **Segment questions by audience.** Sales testers (Pratik, Vishwanath) own different deferred items than Ops (Pradeep, Misba), Finance (Shubhangi, Pranav), and Leadership (Ameet). Routing each tester only to questions relevant to their role keeps reply rates high.
- **Treat D-026 as a single substantive interview spec, not 7 bullets.** D-026 needs Pratik + Shashank in a 30-60 minute conversation, not a quick reply. The round-2 email points them to a calendar slot; the interview output (states, approval flow, conversion trigger, vocabulary) feeds a follow-up batch (likely "W4.5-A" or similar) that builds the workflow against actual operational language.
- **Provide testers context per item.** Naming a deferred ID without context ("review D-019") is friction; surface the operational question in plain language ("of these 15 schools we found in the SPOC DB but not in our system, which should we add?").
- **Estimate testing time per role.** A Sales tester reviewing D-006 + D-011 + D-022 + D-024 + D-026 needs ~45 minutes; an Ops tester reviewing D-002 / D-009 / D-013 / D-019 / D-020 / D-023 plus the W4-G inventory cluster D-028 / D-033 / D-034 / D-035 / D-036 / D-037 needs ~45 minutes; TrainerHead (Shashank) reviewing D-038 (per-MOU trainer roster shape) is a Phase 1.1 scoping conversation, not round-2 triage; Finance D-005 / D-007 alone is ~10 minutes. Setting expectations up front improves response quality.

### 11.12 W4-I.3 read-path architecture: auto-sync via GitHub Actions cron

The earlier drafts of this RUNBOOK and CLAUDE.md described a self-hosted sync runner that consumed `pending_updates.json` into the canonical entity files. The W4-I.3.1 reconnaissance (`plans/anish-ops-w4i3-recon-2026-04-30.md`) found that runner had never been built; queue commits accumulated without ever draining. The W4-I.3 batch closes the gap.

**Path C chosen** over B1 (read-merger), B2 (direct writes), B3 (real database). Reasoning archived in the recon plus `docs/role-decisions.md`. Production target is Azure migration post-Phase-1; the current architecture is interim and deliberately minimal.

**Trigger choice: GitHub Actions cron over Vercel cron.** Vercel Hobby tier does not support sub-daily cron cadence. Upgrading to Pro for `*/5` cadence costs more than the testing-phase budget warrants when GitHub Actions provides the same scheduler at zero marginal cost. Architecture stays trivially reversible: a future Pro upgrade or Azure cutover swaps the trigger layer without touching `drainQueue.ts` or the route handler.

**Mechanics.**

- GitHub Actions workflow at `.github/workflows/sync-queue-cron.yml` fires every 5 minutes (`*/5 * * * *`) plus a `workflow_dispatch` for manual triggers.
- The job runs on `ubuntu-latest`, takes ~10 seconds, and POSTs to `https://gsl-ops-automation.vercel.app/api/admin/sync-queue` with `Authorization: Bearer $CRON_SECRET` and a small JSON body.
- The endpoint validates the bearer token against its own `CRON_SECRET` env var. Both halves of the secret (GitHub repo secret + Vercel env var) must hold the same value.
- On valid auth, the route calls `drainQueue` from `src/lib/sync/drainQueue.ts`. The drain reads `pending_updates.json` via the GitHub Contents API, groups entries by entity, applies each batch to the matching entity JSON (`schools.json`, `mous.json`, etc.), then trims drained ids from the queue.
- Per-entity writes use `chore(sync): apply <entity> batch (n=N)` commit subjects. These DO trigger Vercel rebuilds (the canonical file changed, so the bundle needs the new state).
- The queue-trim write uses `chore(queue): drain N entries`, which `vercel.json` `ignoreCommand` matches and skips. Original write commits also use `chore(queue):` and skip rebuild.
- A `sync_health` entry of kind `sync` is appended on every drain (success or failure) and surfaces on `/admin`.

**Idempotency by construction.** Re-running the drain is safe:

- `create` skips if the id already exists in the entity file.
- `update` replaces by id; if the id is missing, it falls through as a defensive append AND annotates the entity's `auditLog` with a `create-by-fallback` entry (user `sync-drain`, notes pointing back at the original update).
- `delete` filters by id; absent id is a no-op.

**Per-entity isolation.** A failure on one entity (network blip, malformed payload, GitHub API rate limit) leaves the other entities' work in place. Failed entries stay in the queue for the next tick.

**Manual recovery.** `scripts/sync-queue.mjs` POSTs to the same endpoint with the same auth contract:

```
CRON_SECRET=<value> GSL_OPS_BASE_URL=https://gsl-ops-automation.vercel.app node scripts/sync-queue.mjs
```

Useful when the cron pauses (Vercel maintenance, account billing issue) or after an incident where the queue grew large and a fresh drain is wanted out-of-cycle.

**Trigger for revisit.** Migrate to Azure Postgres (D-041) when ANY of:
- Queue depth regularly exceeds 50 entries between ticks (sustained; transient spikes are normal).
- Per-tick latency exceeds 30s (sustained; suggests GitHub Contents API rate-limit pressure).
- Tester count grows beyond 20 active concurrent users.
- Phase 1 closes formally and round 2 testing concludes successfully.

**Cross-references:**
- `plans/anish-ops-w4i3-recon-2026-04-30.md`: full reconnaissance + decision rationale.
- `docs/role-decisions.md`: architectural decision capture.
- `docs/W4-DEFERRED-ITEMS.md` D-041 / D-042 / D-043: Azure migration backlog plus the 3-consecutive-failures detection deferral.
- `src/lib/sync/drainQueue.ts`: the lib.
- `src/app/api/admin/sync-queue/route.ts`: the endpoint.
- `.github/workflows/sync-queue-cron.yml`: the trigger layer.
- `vercel.json`: ignoreCommand for queue-prefix rebuild skip.

**First-fire verification (2026-04-30).** Manual `workflow_dispatch` triggered after `CRON_SECRET` was provisioned in both halves and the middleware allow-list fix landed (`ccf1bc1`). Result: HTTP 200, `ok=true`, drained=8 (2 schools, 3 MOUs, 2 inventory edits, 1 duplicate-create skipped via idempotency), remaining=0, duration 2964ms. Zero failures across 8 entries spanning 3 entity types confirms per-entity isolation, the audit-log defensive-append annotation path, and the chore(sync) / chore(queue) commit-message contract. The architecture is live for round-2 testing.

### 11.13 W4-I.5 dashboard rebuild + smart templates + design system

W4-I.5 closed the round-2 readiness work in five phases: P1 reconnaissance, P2 dashboard rebuild, P3 smart templates, P4 design system polish (P4C0 through P4C7), P5 verification. The batch added 279 tests (1515 -> 1794) and touched every primary surface without changing routes (except the / and /kanban swap; see below) or breaking existing workflows.

**P2 dashboard rebuild.** Pre-W4-I.5 the home route / served the kanban directly. P2C5 swapped that: / now renders the Operations Control Dashboard (StatCard-style tiles for actuals, payments, dispatches, escalations, MOU-status counts, plus filter row + Recent Updates table), and the kanban moved to /kanban. The TopNav surfaces both as sibling links labelled "Dashboard" and "MOU Pipeline" (the in-app surface label rename landed in P4C4 incidental polish; the URL stays /kanban). The kanban content + drag-and-drop interactions are byte-for-byte preserved.

**P3 smart templates.** P3C1 ships the per-MOU send-template launcher route (/mous/[id]/send-template/[templateId]) which renders a server-composed email + a copy-to-clipboard panel. P3C4 wires lifecycle-stage-keyed suggestions into a SmartSuggestionsPanel that mounts on the MOU detail page; templates are scored by use-case (welcome=100, payment-reminder=80, dispatch-confirmation=70, feedback-request=60). P3C5 adds the Communications history panel that filters MOU.auditLog for `communication-sent` entries.

**P4 design system primitives.** Three primitives factored at the 3-or-more usages threshold:
- **OpsButton + opsButtonClass** (`src/components/ops/OpsButton.tsx`): 4 variants (primary / action / outline / destructive), 3 sizes (sm / md / lg). 25-plus call sites across the app share this primitive.
- **StatusChip** (`src/components/ops/StatusChip.tsx`): 6 tones (ok / attention / alert / neutral / navy / teal). Used by every list page that surfaces status, every detail-page metadata cell, every collapsible card count.
- **CollapsibleCard** (inlined on `src/app/mous/[mouId]/page.tsx`): the right-column primitive on the MOU detail page. Uses native `<details>/<summary>` so collapse state is browser-native (no React client state, chevron animates via Tailwind's group-open variant).

Two shared tone-mapping helpers also factored to prevent chip vocabulary drift between list + detail surfaces:
- `src/lib/ui/mouStatusTone.ts`: MOU.status -> StatusChipTone (Active=ok, Pending Signature=attention, Completed=teal, Expired=alert, Renewed=navy, Draft=neutral).
- `src/lib/ui/escalationTones.ts`: Escalation.status + Escalation.severity tone maps.

**P4C5.5 admin sub-page restructure.** Eight admin sub-pages (`/admin/inventory` + `[id]`, `/admin/schools`, `/admin/cc-rules/new` + `[ruleId]`, `/admin/audit`, `/admin/mou-import-review`, `/admin/reminders/[id]`, `/admin/pi-counter`, `/admin/templates`) migrated off the legacy `bg-[var(--brand-navy)]` arbitrary-value syntax + hand-rolled status spans + inline button strings. Each admin surface now mounts TopNav + PageHeader + breadcrumb consistent with the rest of the app. The `signal-warn` token cleanup landed alongside (3 files referenced a non-existent `signal-warn` token; `tailwind.config.ts` only defines `signal-attention`, so the warning styling was being silently dropped).

**Region filter taxonomy locked.** P4C4 reduced the kanban region filter to 2 super-region values (NE / SW); P4C5.5b reverted to the original 3 primary values (East / North / South-West) plus the NE / SW shortcuts. Anish's "4 separate region tags (N / S / E / W)" ask resolves to "3 tags as-is" because schools.json carries no standalone South or West records (only the compound South-West, which is real GSL operational geography for Maharashtra / Karnataka / Goa). New schools in real South or West territory may grow the taxonomy at the next data review. Tracked at D-044.

**Operations Control Dashboard SyncFreshnessTile.** The component exists at `src/components/ops/SyncFreshnessTile.tsx` but is intentionally NOT mounted on the dashboard in Phase 1. The auto-sync runs every 5 minutes and the latest `sync_health` entry surfaces on `/admin`; a separate freshness tile on / is the next step if testers say they need it. See CLAUDE.md "Non-negotiable conventions".

**MOU detail page restructure (P4C4).** Sticky action bar on md+ (status chip + action buttons + status notes textarea); two-column body (60% left = metadata + lifecycle + audit log; 40% right = collapsible cards for Smart Suggestions, Intake, Instalments, Dispatches, Communications, Escalations). Mobile collapses to single column. The audit log keeps its existing `max-h-96 overflow-y-auto` scroll container; virtualization deferred to D-046 (trigger: any MOU's auditLog crossing 30 entries in production).

**Cross-references:**
- `plans/anish-ops-w4i5-recon-2026-04-30.md` (if present) and the W4-I.5 commit cluster (P1 through P5C0) for the full scope.
- `DESIGN.md`: the canonical design surface contract; primitives + tones are referenced here.
- `docs/role-decisions.md`: the W4-I.5 close note.
- `docs/W4-DEFERRED-ITEMS.md`: D-044 through D-047 surfaced during W4-I.5.
