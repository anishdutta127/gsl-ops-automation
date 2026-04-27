# PHASE F + WEEK 3: Verification + Per-Tester Walkthrough

Verification gate covering the Week 2 build (Phases A through F) plus the Week 3 redesign (W3-A through W3-G). Run before distributing tester credentials for round 2. This doc is the testing-email backbone; sections 2 and 4 below copy directly into the launch email. The Phase 1.1 backlog has moved to `docs/RUNBOOK.md` §10 (single source of truth); this doc keeps only the Week-3-specific verification gates.

---

## 1. Verification summary

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean (0 errors) |
| `npm run docs-lint` | passed with 8 warnings (AI-slop vocab in pre-existing plan / design docs; reviewer-judged) |
| em-dash zero across `src/` | 0 occurrences |
| em-dash zero across committed `docs/` and `CLAUDE.md` | 0 occurrences |
| `npm test` (3 consecutive runs at end of W3-G) | 1127 / 1127 passing each run; 0 flakes |
| `npm run smoke:test` | passing (wraps `npm test`) |
| Total commits across Week 2 + Week 3 builds | ≈85 (63 Week 2 + ≈22 Week 3) |
| Total test files / tests | 135 / 1127 |
| TypeScript strict + `noUncheckedIndexedAccess` | enabled and clean |
| W3-G commit hash | filled in on final merge |

### Week 3 changes since the Phase F build (testers should expect)

- **Kanban-first navigation (W3-F).** Homepage at `/` is now the kanban (9 columns, every Active MOU as a card). The Leadership Console (5 health tiles + exception feed + escalation list + 10 trigger tiles) moved to `/overview`. A `Kanban` / `Overview` tab strip lives at the top of both routes. `/dashboard` keeps resolving (alias of `/overview`) so existing bookmarks work.
- **Drag handle + cursor differentiation (W3-F.5).** Each kanban card has a small grip icon at its top-right corner. Click anywhere on the card body to navigate to detail; click-and-drag the handle to move the card to another column. Mouse activation 8px, touch activation 15px, keyboard via Space/Enter on the focused handle.
- **Login lands on `/` (W3-G).** Post-login default redirect target flipped from `/dashboard` to `/`; consistent with kanban-first nav. Deep-link `?next=...` still honoured if valid.
- **TopNav rename (W3-F).** First nav link is now "Home" (points at `/`). The "Dashboard" label is gone from the global nav; the in-page tabs handle the kanban / overview switch.
- **Roles open up for testing (W3-B).** UI-side role gating is dropped on most surfaces so every tester sees every page; server-side enforcement at submit time still rejects writes that exceed the role's grant set. This means a SalesRep can navigate to `/admin/lifecycle-rules` and see the form; the server rejects on submit with `?error=permission`.
- **Editable lifecycle rules (W3-D).** `/admin/lifecycle-rules` shows 7 rows (one per stage transition). Admins can change the `defaultDays` value; changing a rule retroactively recomputes overdue badges across all MOUs at that stage. Audit log captures who-changed-what.
- **GSTIN tile + data-completeness signal (W3-C).** A "Schools needing data" tile sits above the kanban; clicking it deep-links to `/schools?incomplete=yes`.
- **In-app help (W3-E).** Help link in TopNav opens an orientation doc with role-by-role capabilities, lifecycle stages, glossary (38 entries), and 18 step-by-step workflows. Sticky sidebar on desktop ≥1024px; jump-anchors throughout.
- **Phase 1.1 backlog consolidated.** `docs/RUNBOOK.md` §10 is now the canonical Phase 1.1 deferral list (24 items grouped into Auth, Data, Lifecycle, UI, Email, Operational, Operational-developer-environment).

### Suite-stability investigation

Three full-suite runs prior to the Phase F fix surfaced three tests that timed out under heavy parallel load. Each passed in isolation in under 4 seconds; under full-suite contention they hit the 15-second per-test ceiling. Pattern was consistent across runs (always the same three tests, never different):

- `src/app/admin/audit/page.test.tsx > /admin/audit page wiring (Fix-15a) > SalesRep viewing ?action=p2-override gets zero entries; role check ran first, URL filter could not widen`
- `src/app/mous/[mouId]/page.test.tsx > /mous/[mouId] detail page > renders MOU detail for Admin`
- `src/app/portal/status/[tokenId]/page.test.tsx > /portal/status/[tokenId] page > renders header + lifecycle + summary + next milestone on valid token`

Root-cause hypothesis: each test does a dynamic `await import('./page')` on a Server Component that transitively loads many `*.json` data fixtures (mous, schools, dispatches, communications, payments, magic_link_tokens, sync_health, etc.). When several such imports race in parallel, the per-test 15-second budget is occasionally exceeded.

Surgical fix landed in Phase F: per-test timeout extended from 15s to 30s on the three offenders, with a TODO comment in each pointing at the load-contention pattern. Three consecutive 910/910 runs after the fix confirm the suite is now stable.

Phase 1.1 trigger: investigate `vitest.config` pool / `vmThreads` settings or hoist the heavy data-fixture imports out of the per-test loadPage path so the underlying race goes away rather than being absorbed by a wider timeout.

### Known issues / Phase 1.1 backlog

The canonical Phase 1.1 backlog now lives in `docs/RUNBOOK.md` §10. Each item there carries `Context` / `Trigger` / `Implementation` for the deferred behaviour.

The §10 sections are:

- **§10.1 Auth and access:** rate limiting, login timing, multi-device sessions, API rejection clarity, lifecycle-rules permission post-attempt.
- **§10.2 Data and schema:** SPOC entity model, `installmentSeq` American identifiers.
- **§10.3 Lifecycle and rules:** PI vs Dispatch idempotency divergence, Pre-Ops triage budget hardcoded, `cc-rule:create` 30-day Admin-only flip, D4 delivered + acknowledged collapse.
- **§10.4 UI and UX:** mobile drag, contextual helpers per page, duplicate `/dashboard` layout header, AuditLogPanel pagination, SyncFreshnessTile mounting, CC-rule disable `window.prompt`.
- **§10.5 Email and templates:** Outlook 2007 / 2010 CSS centring caveat, no GSL logo on DOCX templates, D3 manual-send Outlook-clipboard pattern, D4 operator-pasted URL.
- **§10.6 Operational and runtime:** no `/forgot-password`, `/api/health` binary, `config/company.json` sample values, manual `import-tick` + `sync/tick`, no reverse-Excel-sync.
- **§10.7 Operational notes (developer environment):** Windows orphaned-node-processes after smoke-test interruption.

Testers do not need to memorise this list; the Universal launch-day instruction §2.5 says "do not report items already on the Phase 1.1 backlog." If a tester is unsure whether their finding is on the backlog, they report it; Anish triages.

---

## 2. Per-tester walkthrough checklist

Each section below is what a tester should walk through after first login. Format is identical for all 10 so the launch email can copy directly.

**Role decision (2026-04-27):** Five of ten testers are granted Admin per `docs/role-decisions.md`. Specifically: Anish (Admin originally), Pradeep (OpsHead → Admin), Misba (OpsEmployee with OpsHead testingOverride → Admin), Swati (Admin from creation), Shashank (TrainerHead → Admin). Trade-off accepted: separation of duties is largely collapsed for the trusted core team. The remaining 5 non-admin testers (Ameet Leadership, Pratik SalesHead, Vishwanath SalesRep, Shubhangi Finance, Pranav Finance) preserve role-scoping verification. Future role-design conversations may revisit; for the 10-tester pilot, this matches operational reality. Walkthroughs in sections 2.5, 2.6, 2.7, and 2.10 reflect Admin capabilities; those four testers see and do everything Anish does.

**Universal launch-day instructions (apply to every tester):**

1. Go to `https://ops.getsetlearn.info` (or whichever production URL Anish provides).
2. Log in with the credentials below. Initial password is the same for all 10 testers and is in the launch email; rotate within 7 days of first login.
3. Walk through your role's checklist. Tick what works; report anything that surprises you.
4. **What to report:** anything that doesn't match the checklist, anything that feels confusing, anything that throws an error message you don't understand. Reply to the launch email with the section header and the unexpected behaviour.
5. **What NOT to report (yet):** items already on the Phase 1.1 backlog (section 1 above). Anish will surface those into a future iteration; we want to hear about new issues, not re-confirm known ones.

**Navigation note (W3-F):** The TopNav `Home` link points at the kanban board (`/`). Below the page title on `/` and `/overview`, a `Kanban` / `Overview` tab strip lets you switch between the kanban view and the Leadership Console (5 health tiles + exception feed + escalation list + 10 trigger tiles). The `/dashboard` URL still resolves and lands on the `Overview` tab; existing bookmarks keep working.

---

### 2.1 Anish Dutta (Admin) - `anish.d@getsetlearn.info`

**Role:** Admin. Wildcard permissions across the entire system.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav with Home, MOUs, Schools, Escalations, Admin, and Help links.
- On `/` (Home / kanban): a one-line interaction hint, the "Schools needing data" tile, and the kanban grid (9 columns; cards have a grip icon at the top-right).
- On `/overview` (Overview tab): five health tiles in the top row (Active MOUs, Accuracy Health, Collection %, Dispatches in Flight, Schools Needing Action), exception feed, open-escalation list, 10 trigger tiles. Sync state is surfaced on `/admin`, not on the Overview tab.

**Walkthrough:**

1. Kanban renders ~140 MOUs distributed across 9 columns; every Active MOU appears in exactly one column.
2. Click a MOU card body; verify it navigates to `/mous/[id]`. Drag the grip icon at the card's top-right; verify a transition dialog opens with the destination column. (Forward-by-1: routes you to the matching per-stage form. Forward-skip / backward / Pre-Ops exit: requires a reason; writes a `kanban-stage-transition` audit entry.)
3. Click the "Schools needing data" tile above the kanban; verify it deep-links to `/schools?incomplete=yes`. Click any school in that list; verify `/schools/[id]/edit` opens with the missing-field input(s) highlighted.
4. Click the `Overview` tab; verify the 5 health tiles render with current numbers. Click a tile or any exception row; verify it lands on the corresponding detail page. Click `Kanban` to switch back.
5. Visit `/help`; verify the orientation doc renders with all 7 sections (Roles, Lifecycle stages, Glossary, Workflows, Changeable settings, Change semantics, Feedback paths). On a desktop ≥1024px, the sticky sidebar should highlight the section you are reading; jump-anchor links scroll smoothly.
6. Visit `/admin`. The System sync panel should be visible at the top with two buttons: "Run import sync now" and "Run health check now". Click "Run health check now"; verify the page redirects with a green flash and the latest entry below shows kind=health, ok=true, your name as triggeredBy.
7. Visit `/admin/lifecycle-rules`. The page lists 7 rules (one per stage transition). Edit one rule's `defaultDays` (small change, e.g., 14 → 16); submit. Verify the green flash names the rule, and the audit log records `lifecycle-rule-edited`. Returning to the kanban, verify cards at that stage now use the new threshold for overdue badges.
8. Visit `/admin/cc-rules`. List shows all pre-seeded rules with toggle switches. Toggle one off; the system should prompt for a reason, then refresh with the rule disabled. Toggle back on; refresh shows it enabled again.
9. Visit `/admin/cc-rules/new`. As Admin you should see the form (any future non-team OpsHead would not for the first 30 days). Create a test rule, submit, verify it appears on the list.
10. Visit `/admin/audit`. Filter by entity, by action, by user. Confirm CSV export downloads.
11. Visit any MOU detail page. Click "Confirm actuals", "Generate PI", "Raise dispatch", "Compose feedback request", "Record delivery ack". Each should work end-to-end.

**Negative tests:**
- (none - Admin sees and does everything by design)

---

### 2.2 Ameet Zaveri (Leadership) - `ameet.z@getsetlearn.info`

**Role:** Leadership. Authorised to override the P2 dispatch gate and resolve escalations across all three lanes (OPS, SALES, ACADEMICS).

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav: Home, MOUs, Schools, Escalations, Help. No Admin link (Leadership role does not include the Admin grant).
- On `/`: kanban with grip-handle cards.
- On `/overview`: 5 health tiles, exception feed, full escalation list (Leadership sees every lane), 10 trigger tiles.

**Walkthrough:**

1. Kanban renders on `/`; click `Overview` to see Leadership Console tiles. Both surfaces should load with current numbers.
2. On the Overview tab, the escalation list shows open items across OPS, SALES, ACADEMICS lanes (Leadership sees everything).
3. Visit any escalation detail page. Click "Resolve"; submit notes; the escalation status flips to resolved with your name on the audit entry.
4. Visit a Dispatch detail page where `installment1Paid: false` and `overrideEvent: null`. Click "Authorise pre-payment dispatch"; provide reason; the dispatch gets an overrideEvent and a paired Escalation auto-creates in the OPS lane.
5. Visit `/admin/audit`. Full visibility (Admin + Leadership see everything; the role-aware filter is wider for these two roles).
6. Click `Help` in the TopNav; skim the orientation doc.

**Negative tests:**
- Visit `/admin`. The page renders (W3-B disabled UI-side role gating; every authenticated user reaches admin surfaces). Click any admin-write surface (e.g., `/admin/cc-rules/new`); the form is visible. Attempting to submit the create form 303-redirects with `?error=permission`. This confirms server-side enforcement is the live gate, not the UI.

---

### 2.3 Pratik D. (SalesHead) - `pratik.d@getsetlearn.info`

**Role:** SalesHead. Approves drift on actuals confirmations; resolves SALES-lane escalations.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav: Home, MOUs, Schools, Escalations, Help. No Admin link.
- On `/`: kanban with grip-handle cards.
- On `/overview`: 5 health tiles + escalation list filtered to SALES-lane items + items you can act on.

**Walkthrough:**

1. Kanban renders on `/`. Click a card body to navigate to detail; drag a card's grip handle for a stage transition.
2. Click `Overview`; verify health tiles + the role-scoped escalation list render.
3. Visit any MOU detail page. Click "Confirm actuals" on an Active MOU; submit a value within 10% of the MOU's `studentsMou` baseline; verify the MOU's actuals fields update and the audit entry records `actuals-confirmed` with your user id.
4. Submit actuals with variance > 10% on a different MOU; the response should include `needsDriftReview: true`. (Phase 1: drift queue review surface lands later; for now the flag is captured but no separate queue page exists.)
5. Visit `/admin/audit`. Filter for entity=MOU action=actuals-confirmed; should show your action.
6. Click `Help` in the TopNav; skim the orientation doc.

**Negative tests:**
- Visit `/admin/lifecycle-rules`. The page is visible (W3-B). Edit a rule's defaultDays and submit; the system 303-redirects with `?error=permission` because `lifecycle-rule:edit` is Admin-only. The error rail surfaces "Editing lifecycle rules requires the Admin role."
- Visit `/admin/audit` directly. Page loads; only SALES-lane entries + reassignment + actuals-confirmed actions are visible (per role-scoping in `canViewAuditEntry`).

---

### 2.4 Vishwanath G. (SalesRep) - `vishwanath.g@getsetlearn.info`

**Role:** SalesRep. Confirms actuals on own assignments only. Scoped to MOUs where `salesPersonId === your id`.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav: Home, MOUs, Schools, Escalations, Help. No Admin link.
- On `/`: kanban with grip-handle cards (your scoping limits which cards you can drag forward; some cards may render as read-only).
- On `/overview`: tiles reflect own-MOU scope only.

**Walkthrough:**

1. Kanban renders on `/`. Click any card body; verify it navigates. If the MOU is assigned to you, the detail page is fully populated; if not, you get a 404 per the `isVisibleToUser` guard.
2. Visit `/mous`. List shows only MOUs assigned to you (`salesPersonId` matches).
3. Click into one of your MOUs. Confirm actuals; verify the audit entry records your user id.
4. Click `Help` in the TopNav; skim the orientation doc (your role's section spells out exactly what is in scope).

**Negative tests:**
- Visit `/admin/lifecycle-rules`. Page is visible (W3-B). Submit-attempt redirects with `?error=permission`; lifecycle-rule:edit is Admin-only.
- Visit a MOU detail page for a MOU NOT assigned to you (try any `MOU-...` you can guess). Page returns 404 (notFound) per the `isVisibleToUser` guard.
- Visit `/admin/audit`. Page renders; the filtered list is empty for SalesRep (no `canViewAuditEntry` matches in Phase 1).

---

### 2.5 Misba M. (Admin) - `misba.m@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change; see `docs/role-decisions.md`). Wildcard permissions across the entire system. This is your daily driver during the pilot.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav with Home, MOUs, Schools, Escalations, Admin, and Help links.
- On `/`: kanban with grip-handle cards; "Schools needing data" tile above the grid; one-line interaction hint.
- On `/overview`: five health tiles in the top row, exception feed, escalation list, 10 trigger tiles.

**Walkthrough:**

1. Kanban on `/` renders with current MOUs in 9 columns. Click a card body; verify it navigates. Drag a card's grip handle to the next column; verify the transition dialog opens; confirm it.
2. Click the `Overview` tab; verify the 5 health tiles + exception feed + escalation list + 10 trigger tiles render.
3. Click `Help` in the TopNav; skim the orientation doc to confirm it loads.
4. Visit `/admin`. System sync panel + admin areas grid both visible. Try "Run import sync now"; verify it completes with a green flash.
5. Visit `/admin/lifecycle-rules`. Edit one rule's `defaultDays` (small change, e.g., 14 → 16); submit. Verify the green flash; verify the audit log records `lifecycle-rule-edited`. Returning to the kanban, the new threshold drives overdue badges at that stage.
6. Visit `/admin/cc-rules`. List + toggles work. The "New rule" button IS visible (Admin wildcard). Toggle one off, then back on; verify the audit entries.
7. Visit `/admin/cc-rules/new`. Create a test rule; submit; verify it appears on the list.
8. Visit `/admin/cc-rules/<existing-id>`. Edit form works; submit a small change; verify it persists.
9. Visit `/admin/mou-import-review`. Quarantined MOU records are shown with a Reject form. Pick one; reject with reason `data-quality-issue`; verify the queue shrinks.
10. Visit `/admin/pi-counter`. Health view shows current `next` value, monotonicity OK, last-issued PI summary.
11. Visit `/admin/audit`. Full visibility (Admin wildcard). Filter by entity, by action, by user. Confirm CSV export downloads.
12. Visit `/admin/sales-team` + `/admin/schools` + `/admin/school-groups`. Each list works; "New rep" / "New school" / "New group" forms work.
13. Visit `/admin/spocs`. Placeholder page redirects you to `/schools/[id]/edit` per the deferral.
14. Visit a MOU detail page. Click "Confirm actuals", "Generate PI", "Raise dispatch", "Compose feedback request", "Record delivery ack". Each should work end-to-end.

**Negative tests:**
- (none; Admin sees and does everything by design)

---

### 2.6 Pradeep R. (Admin) - `pradeep.r@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change). Identical capabilities to Misba in section 2.5; different human, same daily-driver flows. The duplication is intentional: Phase 1 covers three Ops-team operators so vacation / handover days don't block the pilot.

**Walkthrough:** Same as section 2.5. The dispatch + PI + feedback-request + delivery-ack flows you exercise should be on different MOUs from Misba's and Swati's so the audit log captures real attribution differences.

**Negative tests:** Same as section 2.5.

---

### 2.7 Swati P. (Admin) - `swati.p@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change). Identical capabilities to Misba and Pradeep above; the third Ops-team operator added on 2026-04-27 to round out coverage during the pilot.

**Walkthrough:** Same as section 2.5. Pick MOUs that Misba and Pradeep have not yet exercised so the audit log captures real attribution differences across all three Ops-team operators.

**Negative tests:** Same as section 2.5.

---

### 2.8 Shubhangi G. (Finance) - `shubhangi.g@getsetlearn.info`

**Role:** Finance. Generates PIs, reconciles payments, acknowledges P2 overrides.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav: Home, MOUs, Schools, Escalations, Help. No Admin link.
- On `/`: kanban with grip-handle cards (you can drag actuals-confirmed cards toward invoice-raised; the dialog routes you to `/mous/[id]/pi`).
- On `/overview`: 5 health tiles + 10 trigger tiles; numbers reflect full operational view.

**Walkthrough:**

1. Kanban on `/` renders with current MOUs. Click `Overview`; verify tiles render. Click `Kanban` to switch back.
2. On the kanban, find a MOU at the actuals-confirmed stage; drag its grip handle to the invoice-raised column. The forward-by-1 dialog should route you to `/mous/[id]/pi`.
3. Visit a MOU detail page where actuals are confirmed and the school has a non-null `gstNumber`. Click "Generate PI"; verify a `.docx` downloads with PI number `GSL/OPS/26-27/000N` and the placeholder values from `config/company.json` (sample bank, sample GSTIN, etc.) rendered.
4. Visit a different MOU where the school's `gstNumber` is null. Click "Generate PI"; verify a friendly error: "GSTIN required" and a link to `/schools/[id]/edit`.
5. Visit a Dispatch with an unack'd `overrideEvent`. Click "Acknowledge override"; verify the audit entry + state.
6. Click `Help` in the TopNav; the Finance section of the orientation doc spells out the PI-generation + drift-flag flow.

**Negative tests:**
- Visit `/admin/lifecycle-rules`. Page renders (W3-B). Submit-attempt redirects with `?error=permission`.
- Visit `/admin/audit`. Page loads; only Finance-relevant entries (pi-issued, p2-override-acknowledged) visible per role-scoping.
- On a MOU detail page that has actuals confirmed, the "Raise dispatch" button is not visible to you (Finance does not have `dispatch:raise`); the kanban drag from actuals-confirmed → kit-dispatched would also be rejected by the server.

---

### 2.9 Pranav B. (Finance) - `pranav.b@getsetlearn.info`

**Role:** Finance. Identical capabilities to Shubhangi; different human, same flows. Phase 1 covers two Finance users for the same vacation/handover reason as the OpsHead pair.

**Walkthrough:** Same as section 2.8. Generate at least one PI on a MOU Shubhangi has not generated PIs for; the audit log captures real attribution differences.

**Negative tests:** Same as section 2.8.

---

### 2.10 Shashank S. (Admin) - `shashank.s@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change; see `docs/role-decisions.md`). Wildcard permissions across the entire system. Originally TrainerHead with ACADEMICS-lane scope; promoted to Admin alongside the Ops team so the trusted core team can drive every flow end-to-end during the pilot.

**Expected landing:** `/` (kanban homepage; click the `Overview` tab to see the Leadership Console).

**Visible chrome:**
- TopNav with Home, MOUs, Schools, Escalations, Admin, and Help links.
- On `/`: kanban with grip-handle cards.
- On `/overview`: 5 health tiles + exception feed + escalation list (full visibility) + 10 trigger tiles.

**Walkthrough:**

1. Kanban on `/` renders with current MOUs. Click `Overview`; verify tiles + escalation list render with full operational view.
2. Visit any escalation detail page in the ACADEMICS lane (e.g., one auto-created from a feedback record with rating <= 2 on training-quality or trainer-rapport). Click "Resolve"; submit resolution notes; your historical TrainerHead workflow remains unchanged in shape, only the role label has changed.
3. Visit `/admin/audit`. Full visibility (Admin wildcard); filter by lane, by entity, by user. Confirm CSV export downloads.
4. Visit `/admin`. System sync panel + admin areas grid both visible.
5. Visit `/admin/lifecycle-rules`. Edit one rule's `defaultDays`; verify the audit log + retroactive overdue-badge recompute.
6. Spot-check a non-academics flow (e.g., open a MOU detail page; the Generate PI / Raise dispatch / Confirm actuals buttons are now visible to you because Admin grants every action).
7. Click `Help` in the TopNav; skim the orientation doc.

**Negative tests:**
- (none; Admin sees and does everything by design)

---

## 3. Public-facing surfaces (SPOC walkthrough; not a tester role)

These surfaces are reached via magic-link emails sent to school SPOCs. During the pilot, ops-team testers can simulate by composing a feedback-request email (section 2.5 step 11) and clicking the magic link from the resulting Outlook draft.

### 3.1 /feedback/[tokenId] (SPOC feedback form)

- Mobile-first layout, max-width 640px on desktop.
- 4 category cards (training quality, kit condition, delivery timing, trainer rapport) with rating segments + per-category comment.
- Overall comment textarea below the cards.
- Submit button enabled when at least one rating is non-null OR overall comment is non-empty.
- On 201: redirect to `/feedback/thank-you`.
- On 410 / 403 (expired or HMAC-failed): redirect to `/feedback/link-expired`.

### 3.2 /portal/status/[tokenId] (read-only status portal)

- Mobile-first layout.
- 8-stage lifecycle progress visualisation.
- Per-installment summary with paid / pending / due-by amounts.
- Next milestone callout.
- Each GET fire-and-forgets a `lastViewedAt + viewCount` queue update; rendering must not fail if the queue is unavailable.

---

## 4. Operational notes (developer-side; testers can skip)

- **Windows: orphaned node processes after killed smoke-test or dev-server runs.** The `scripts/smoke-test.sh` trap-based cleanup occasionally leaves child node processes holding ports 3000-3003. Workaround: `taskkill //F //IM node.exe` (Windows) or `pkill -f "next dev"` (macOS / Linux), then `rm -rf .next` before restarting.
- **First production PI requires `config/company.json` swap.** Sample values render in Phase 1 testing PIs; replace with real GSL identity (legal entity name, GSTIN, registered address, bank details) via single file edit + commit.
- **Manual-trigger sync.** Phase 1 has no GitHub Actions cron runner. Use the System sync panel on `/admin` to trigger import-tick + health-check ticks. Phase 1.1 trigger: sister-project MOU volume grows beyond manual-trigger comfort.
- **Test-suite stability.** Three Server Component tests carry a 30s per-test timeout; reduce to 15s once the underlying load contention is fixed (Phase 1.1 vitest pool config investigation).

---

## 5. Pre-distribution checklist (Anish executes)

Before sending the launch email:

- [ ] Production deploy is live at the public URL.
- [ ] All 10 tester accounts exist in `users.json` with bcrypt hashes verified against the launch password.
- [ ] `config/company.json` swapped to production values (legal entity, GSTIN, address, bank).
- [ ] PI counter at expected starting value (`next: 1`, fiscalYear: `26-27`, prefix: `GSL/OPS`).
- [ ] PI / dispatch / delivery-ack templates exist at `public/ops-templates/` (committed).
- [ ] Sync runner... no, manually triggered (per Phase 1).
- [ ] Smoke test green on the production URL (curl `/api/health` returns `{ status: 'ok' }`).
- [ ] Launch email drafted using sections 2.1 through 2.10 above.

After sending:

- [ ] Monitor `/admin` System sync panel; run health check daily for the first week.
- [ ] Review `/admin/audit` daily for unexpected entries.
- [ ] Capture tester feedback in a single open-items doc; triage into "Phase 1 fix" vs "Phase 1.1 backlog" weekly.
