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

- [ ] User accounts created for the locked 9-tester roster: anish.d, ameet.z, pratik.d, vishwanath.g, misba.m (testingOverride=true), pradeep.r, shubhangi.g, pranav.b, shashank.s.
- [ ] Each user's bcrypt hash verifies against the launch password (rotate from `GSL#123` to a per-user value if needed before first prod login).
- [ ] Login URL communicated to all 9 testers via the launch email.
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

- Send credential email to all 9 testers with: login URL, username, initial password, link to `/dashboard` and `/admin/audit`.
- The email is direct voice, no AI slop, British English, em-dash-free.

### 2.4 T+03h: Misba briefing

- 30-minute walkthrough with Misba: dashboard tour, exception feed, escalation list, CcRule toggles, audit route filter rail.
- Hand over the testingOverride context: her base role is OpsEmployee; the flag grants OpsHead permissions during testing.

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

### 3.3 Pradeep (OpsHead)

- Log in.
- Review escalation list at `/escalations`.
- Walk through dispatch flow on a non-real test MOU to verify the override-gate behaviour without committing real state.

### 3.4 Misba (OpsEmployee + testingOverride: ['OpsHead'])

- Log in.
- Review CcRule toggle state at `/admin/cc-rules` (10 rules, all enabled by default).
- Spot-check dashboard tile values match the imported cohort.
- Audit route accessibility verified at `/admin/audit`.

### 3.5 Ameet (Leadership)

- Log in.
- Verify Leadership Console at `/dashboard` renders with all 5 health tiles + 10 trigger tiles.
- Walk through P2 override UI on a test Dispatch (do NOT click through on real data).

### 3.6 Sales reps (Vishwanath, plus any others added pre-launch)

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
