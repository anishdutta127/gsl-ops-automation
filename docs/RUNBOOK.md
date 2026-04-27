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

### 1.5 Sync runner laptop state

- [ ] Anish's Windows laptop plugged in + awake.
- [ ] Windows Update auto-restart deferred for the launch week.
- [ ] GitHub Actions runner registered + tested on the new repo.
- [ ] Cron schedule active: `30 3-13 * * 1-5` UTC (IST business hours, hourly Mon-Fri).
- [ ] OneDrive symlink at `onedrive-data/` resolves to the live OneDrive folder.

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

### 5.1 Sync runner offline (laptop sleeping, Windows Update reboot)

- Symptom: dashboard "last sync" timestamp drifts past 1 hour during business hours.
- Recovery: wake laptop; check GitHub Actions runner status; trigger a manual sync run if needed.
- Phase 1.1 fix: cloud runner migration (eng review risk #7).

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
