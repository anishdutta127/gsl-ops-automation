# PHASE F: Verification + Per-Tester Walkthrough

Final verification gate for Week 2 build. Run before distributing tester credentials. This doc is the testing-email backbone; sections 2 and 4 below copy directly into the launch email.

---

## 1. Verification summary

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean (0 errors) |
| `npm run docs-lint` | passed with 8 warnings (AI-slop vocab in pre-existing plan/design docs; reviewer-judged) |
| em-dash zero across `src/` | 0 occurrences |
| em-dash zero across committed `docs/` and `CLAUDE.md` | 0 occurrences |
| `npm test` (3 consecutive runs post-fix) | 910 / 910 passing each run; 0 flakes |
| `npm run smoke:test` | passing (wraps `npm test`) |
| Total commits across Week 2 build | 63 |
| Total test files / tests | 114 / 910 |
| TypeScript strict + `noUncheckedIndexedAccess` | enabled and clean |

### Suite-stability investigation

Three full-suite runs prior to the Phase F fix surfaced three tests that timed out under heavy parallel load. Each passed in isolation in under 4 seconds; under full-suite contention they hit the 15-second per-test ceiling. Pattern was consistent across runs (always the same three tests, never different):

- `src/app/admin/audit/page.test.tsx > /admin/audit page wiring (Fix-15a) > SalesRep viewing ?action=p2-override gets zero entries; role check ran first, URL filter could not widen`
- `src/app/mous/[mouId]/page.test.tsx > /mous/[mouId] detail page > renders MOU detail for Admin`
- `src/app/portal/status/[tokenId]/page.test.tsx > /portal/status/[tokenId] page > renders header + lifecycle + summary + next milestone on valid token`

Root-cause hypothesis: each test does a dynamic `await import('./page')` on a Server Component that transitively loads many `*.json` data fixtures (mous, schools, dispatches, communications, payments, magic_link_tokens, sync_health, etc.). When several such imports race in parallel, the per-test 15-second budget is occasionally exceeded.

Surgical fix landed in Phase F: per-test timeout extended from 15s to 30s on the three offenders, with a TODO comment in each pointing at the load-contention pattern. Three consecutive 910/910 runs after the fix confirm the suite is now stable.

Phase 1.1 trigger: investigate `vitest.config` pool / `vmThreads` settings or hoist the heavy data-fixture imports out of the per-test loadPage path so the underlying race goes away rather than being absorbed by a wider timeout.

### Known issues / Phase 1.1 backlog

A consolidated list of Phase 1 deferrals captured across Week 2. Each carries a Phase 1.1 trigger condition.

- **Rate limiting on /api/login is absent.** Phase 1 testers are 9 known internal staff; Vercel platform rate limits handle trivially-malicious traffic. Phase 1.1 trigger: any unauthenticated route exposed beyond staff IPs. Implementation: external counter store (Vercel KV).
- **Login response timing is not equalized across reject reasons.** Known-user-with-wrong-password runs bcrypt; unknown-user does not, leaking enumeration via timing. Phase 1 acceptable (9 known testers). Phase 1.1 trigger: any public-facing login surface.
- **Multi-device sessions accepted.** No server-side session list; same user-id from multiple IPs is allowed. Phase 1.1 trigger: audit-log shows credential-leak suggestive pattern.
- **No /forgot-password.** Recovery is manual edit to fixtures + reseed per `docs/DEVELOPER.md`. Phase 1.1 trigger: testers ask for self-service.
- **/api/health is binary status only.** Graded data-integrity view lives on the dashboard tile.
- **AuditLogPanel renders all entries inline.** Phase 1.1 trigger: any entity's auditLog exceeds 30 entries.
- **SPOC entity model deferred.** Phase 1 ships SPOC contact as embedded fields on School. /admin/spocs is a placeholder pointing testers at /schools/[id]/edit. Phase 1.1 trigger: tester feedback on SPOC cardinality (single-per-school vs multi-per-school vs per-MOU-overrides).
- **`config/company.json` ships with sample identity values.** Production swap (real registered legal entity, real GSTIN, real bank, real address) is a single file edit + commit before the first production PI leaves the system.
- **PI vs Dispatch idempotency divergence.** `generatePi` advances counter every call (PI numbers have external GST-filing significance); `raiseDispatch` re-renders idempotently (state has internal significance only). Phase 1.1 trigger: tester reports of accidental duplicate-click PIs.
- **Email template uses `style="text-align:center;"` not legacy `align="center"`.** Modern Outlook renders correctly; older Outlook (2007 / 2010) may render the wrapper layout differently. Phase 1 testers run Outlook 365. Phase 1.1 trigger: older Outlook install in broader pilot reports broken layout.
- **PI / Dispatch / Delivery-Ack templates authored programmatically.** Production-quality but text-only with no embedded GSL logo. Phase 1.1 trigger: brand polish ask from testers.
- **D3 feedback request uses manual-send (Outlook clipboard) pattern.** No SMTP integration. Lib code is reusable. Phase 1.1 trigger: GSL wants automated sending; swap the Copy button for a Send-via-provider button on the same compose surface.
- **D4 delivery-ack URL is operator-pasted (Drive / SharePoint / Dropbox link).** No file upload + storage infrastructure. Phase 1.1 trigger: GSL wants centralised storage.
- **D4 collapses delivered + acknowledged into a single transition.** Schema supports both; Phase 1 simplified flow sets all three timestamps + URL at once. Phase 1.1 trigger: courier integration that confirms physical delivery before paperwork lands.
- **Phase 1: import-tick + sync/tick are admin-triggered manually via /admin.** Phase 1.1 trigger: sister-project MOU volume grows beyond manual-trigger comfort. Implementation: port MOU's GitHub Actions workflow yml + add shared-secret bearer auth alongside session auth.
- **Cc-rule create flow allows Admin-only for first 30 days post-launch.** Documented in `permissions.ts:89-91`. Partially obsolete on the test roster after the 2026-04-27 role-decisions change (`docs/role-decisions.md`): Pradeep, Misba, Swati are now Admin and can create CC rules immediately via the Admin wildcard. The flip-to-OpsHead-allowed semantic still applies to any FUTURE OpsHead user who is not on the Ops team. Phase 1.1 trigger: day 31 + a non-Ops-team OpsHead user actually exists (1-line PR to add `cc-rule:create` to the OpsHead grant set).
- **Cc-rule disable confirmation uses `window.prompt` for the reason.** Functional + accessible-enough. Phase 1.1 trigger: tester aesthetics feedback. Upgrade path documented in `CcRuleToggleRow.tsx`: replace with shadcn Dialog.
- **Reverse-Excel-sync not built.** Per CLAUDE.md, the app is the single source of truth; the legacy `Mastersheet-Implementation_-_AnishD.xlsx` is what we migrated AWAY from, not a sync target. Reverse-sync is net-new work (not deferral) if GSL wants a spreadsheet view restored.
- **`SyncFreshnessTile` component built but not mounted on `/dashboard`.** Manual-trigger pattern means a "last sync N hours ago" tile does not add at-a-glance value (operators click Sync now on `/admin` when they want fresh state; the timestamp + status surface there is sufficient). Phase 1.1 trigger: when/if cron auto-sync lands, re-mount the tile on `/dashboard`.
- **`/help` page added post-Phase-F.** In-app help reachable from the Help link on TopNav (visible to every authenticated user). Four sections: capabilities by role, common workflows, glossary, feedback paths. Plain-language; not a substitute for the launch email walkthrough but a reference once testers are inside the system.

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

---

### 2.1 Anish Dutta (Admin) - `anish.d@getsetlearn.info`

**Role:** Admin. Wildcard permissions across the entire system.

**Expected landing:** `/dashboard` (Leadership Console).

**Visible chrome:**
- TopNav with Dashboard, MOUs, Schools, Escalations, Admin, and Help links.
- Five health tiles in the top row: Active MOUs, Accuracy Health, Collection %, Dispatches in Flight, Schools Needing Action. Sync state is surfaced on `/admin` (System sync panel), not the dashboard.

**Walkthrough:**

1. Dashboard tiles render with current numbers (no "0" everywhere unless the seed is genuinely empty).
2. Click into any health tile or exception row; verify it lands on the corresponding detail page.
3. Visit `/admin`. The System sync panel should be visible at the top with two buttons: "Run import sync now" and "Run health check now". Click "Run health check now"; verify the page redirects with a green flash and the latest entry below shows kind=health, ok=true, your name as triggeredBy.
4. Visit `/admin/cc-rules`. List shows all pre-seeded rules with toggle switches. Toggle one off; the system should prompt for a reason, then refresh with the rule disabled. Toggle back on; refresh shows it enabled again.
5. Visit `/admin/cc-rules/new`. As Admin you should see the form (OpsHead does not for the first 30 days post-launch). Create a test rule, submit, verify it appears on the list.
6. Visit `/admin/audit`. Filter by entity, by action, by user. Confirm CSV export downloads.
7. Visit any MOU detail page. Click "Confirm actuals", "Generate PI", "Raise dispatch", "Compose feedback request", "Record delivery ack". Each should work end-to-end.

**Negative tests:**
- (none - Admin sees and does everything by design)

---

### 2.2 Ameet Zaveri (Leadership) - `ameet.z@getsetlearn.info`

**Role:** Leadership. Authorised to override the P2 dispatch gate and resolve escalations across all three lanes (OPS, SALES, ACADEMICS).

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav: Dashboard, MOUs, Schools, Escalations, Help.
- No Admin link (Leadership is not an admin role; admin areas redirect to /dashboard).

**Walkthrough:**

1. Dashboard tiles + escalation list load. Escalation list shows open items across OPS, SALES, ACADEMICS lanes (Leadership sees everything).
2. Visit any escalation detail page. Click "Resolve"; submit notes; the escalation status flips to resolved with your name on the audit entry.
3. Visit a Dispatch detail page where `installment1Paid: false` and `overrideEvent: null`. Click "Authorise pre-payment dispatch"; provide reason; the dispatch gets an overrideEvent and a paired Escalation auto-creates in the OPS lane.
4. Visit `/admin/audit`. Full visibility (Admin + Leadership see everything).

**Negative tests:**
- Visit `/admin`. Should redirect to `/dashboard` (admin area is Admin + OpsHead only).
- Visit `/admin/cc-rules/new`. Same redirect.

---

### 2.3 Pratik D. (SalesHead) - `pratik.d@getsetlearn.info`

**Role:** SalesHead. Approves drift on actuals confirmations; resolves SALES-lane escalations.

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav: Dashboard, MOUs, Schools, Escalations, Help.
- No Admin link.

**Walkthrough:**

1. Dashboard tiles render. Escalation list filters to SALES-lane items + items you can act on.
2. Visit any MOU detail page. Click "Confirm actuals" on an Active MOU; submit a value within 10% of the MOU's `studentsMou` baseline; verify the MOU's actuals fields update and the audit entry records `actuals-confirmed` with your user id.
3. Submit actuals with variance > 10% on a different MOU; the response should include `needsDriftReview: true`. (Phase 1: drift queue review surface lands later; for now the flag is captured but no separate queue page exists.)
4. Visit `/admin/audit`. Filter for entity=MOU action=actuals-confirmed; should show your action.

**Negative tests:**
- Visit `/admin`. Redirect to `/dashboard`.
- Visit `/admin/audit` directly. Page loads but only SALES-lane entries + reassignment + actuals-confirmed actions are visible (per role-scoping in `canViewAuditEntry`).

---

### 2.4 Vishwanath G. (SalesRep) - `vishwanath.g@getsetlearn.info`

**Role:** SalesRep. Confirms actuals on own assignments only. Scoped to MOUs where `salesPersonId === your id`.

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav: Dashboard, MOUs, Schools, Escalations, Help.
- No Admin link.

**Walkthrough:**

1. Dashboard tiles render. Numbers reflect own-MOU scope only.
2. Visit `/mous`. List shows only MOUs assigned to you (`salesPersonId` matches).
3. Click into one of your MOUs. Confirm actuals; verify the audit entry records your user id.

**Negative tests:**
- Visit `/admin`. Redirect to `/dashboard`.
- Visit a MOU detail page for a MOU NOT assigned to you (try any `MOU-...` you can guess). Page returns 404 (notFound) per the `isVisibleToUser` guard.
- Visit `/admin/audit`. Phase 1 ships SalesRep with no audit-route visibility at all; the page renders but the filtered list is empty.

---

### 2.5 Misba M. (Admin) - `misba.m@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change; see `docs/role-decisions.md`). Wildcard permissions across the entire system. This is your daily driver during the pilot.

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav with Dashboard, MOUs, Schools, Escalations, Admin, and Help links.
- Five health tiles in the top row.

**Walkthrough:**

1. Dashboard tiles render with full operational view.
2. Visit `/admin`. System sync panel + admin areas grid both visible. Try "Run import sync now"; verify it completes with a green flash.
3. Visit `/admin/cc-rules`. List + toggles work. The "New rule" button IS visible (Admin wildcard). Toggle one off, then back on; verify the audit entries.
4. Visit `/admin/cc-rules/new`. Create a test rule; submit; verify it appears on the list.
5. Visit `/admin/cc-rules/<existing-id>`. Edit form works; submit a small change; verify it persists.
6. Visit `/admin/mou-import-review`. Quarantined MOU records are shown with a Reject form. Pick one; reject with reason `data-quality-issue`; verify the queue shrinks.
7. Visit `/admin/pi-counter`. Health view shows current `next` value, monotonicity OK, last-issued PI summary.
8. Visit `/admin/audit`. Full visibility (Admin wildcard). Filter by entity, by action, by user. Confirm CSV export downloads.
9. Visit `/admin/sales-team` + `/admin/schools` + `/admin/school-groups`. Each list works; "New rep" / "New school" / "New group" forms work.
10. Visit `/admin/spocs`. Placeholder page redirects you to /schools/[id]/edit per the deferral.
11. Visit a MOU detail page. Click "Confirm actuals", "Generate PI", "Raise dispatch", "Compose feedback request", "Record delivery ack". Each should work end-to-end.

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

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav: Dashboard, MOUs, Schools, Escalations, Help.
- No Admin link.

**Walkthrough:**

1. Dashboard tiles render. Numbers reflect full operational view.
2. Visit a MOU detail page where actuals are confirmed and the school has a non-null `gstNumber`. Click "Generate PI"; verify a `.docx` downloads with PI number `GSL/OPS/26-27/000N` and the placeholder values from `config/company.json` (sample bank, sample GSTIN, etc.) rendered.
3. Visit a different MOU where the school's `gstNumber` is null. Click "Generate PI"; verify a friendly error: "GSTIN required" and a link to `/schools/[id]/edit`.
4. Visit a Dispatch with an unack'd `overrideEvent`. Click "Acknowledge override"; verify the audit entry + state.

**Negative tests:**
- Visit `/admin`. Redirect to `/dashboard`.
- Visit `/admin/audit`. Page loads; only Finance-relevant entries (pi-issued, p2-override-acknowledged) visible.
- Try raising a dispatch (button visible? No - that's OpsHead).

---

### 2.9 Pranav B. (Finance) - `pranav.b@getsetlearn.info`

**Role:** Finance. Identical capabilities to Shubhangi; different human, same flows. Phase 1 covers two Finance users for the same vacation/handover reason as the OpsHead pair.

**Walkthrough:** Same as section 2.8. Generate at least one PI on a MOU Shubhangi has not generated PIs for; the audit log captures real attribution differences.

**Negative tests:** Same as section 2.8.

---

### 2.10 Shashank S. (Admin) - `shashank.s@getsetlearn.info`

**Role:** Admin (per the 2026-04-27 role-decisions change; see `docs/role-decisions.md`). Wildcard permissions across the entire system. Originally TrainerHead with ACADEMICS-lane scope; promoted to Admin alongside the Ops team so the trusted core team can drive every flow end-to-end during the pilot.

**Expected landing:** `/dashboard`.

**Visible chrome:**
- TopNav with Dashboard, MOUs, Schools, Escalations, Admin, and Help links.
- Five health tiles in the top row.

**Walkthrough:**

1. Dashboard tiles render with full operational view.
2. Visit any escalation detail page in the ACADEMICS lane (e.g., one auto-created from a feedback record with rating <= 2 on training-quality or trainer-rapport). Click "Resolve"; submit resolution notes; your historical TrainerHead workflow remains unchanged in shape, only the role label has changed.
3. Visit `/admin/audit`. Full visibility (Admin wildcard); filter by lane, by entity, by user. Confirm CSV export downloads.
4. Visit `/admin`. System sync panel + admin areas grid both visible.
5. Spot-check a non-academics flow (e.g., open a MOU detail page; the Generate PI / Raise dispatch / Confirm actuals buttons are now visible to you because Admin grants every action).

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
