# Role decisions

This document records the rationale behind non-default role assignments on the test roster. New decisions append here as they happen; existing entries are NOT silently re-litigated.

---

## 2026-04-27: Trusted core team granted Admin (Pradeep, Misba, Swati, Shashank)

**Decision:** Five of the ten testers are granted the `Admin` role rather than their nominal functional role per Anish's directive on 2026-04-27. Specifically:

- `anish.d`: Admin (originally Admin)
- `pradeep.r`: OpsHead -> Admin
- `misba.m`: OpsEmployee with OpsHead testingOverride -> Admin
- `swati.p`: Admin from creation (added 2026-04-27)
- `shashank.s`: TrainerHead -> Admin

The remaining five testers preserve role-scoping verification: `ameet.z` (Leadership), `pratik.d` (SalesHead), `vishwanath.g` (SalesRep), `shubhangi.g` (Finance), `pranav.b` (Finance).

**Trade-off accepted:** The role-based separation of duties the system was originally designed around is largely collapsed for the trusted core team. Specifically:

- `cc-rule:create` is no longer Admin-only-for-30-days for the core team. They can create CC rules from day one. The 30-day flip semantic still applies to any FUTURE OpsHead user who is not on the core team.
- Audit-route visibility scoping (OpsHead sees OPS-lane only; TrainerHead sees ACADEMICS-lane only) does not constrain the core team. They see all lanes via the Admin wildcard.
- The `testingOverride` pattern previously used to grant Misba scoped OpsHead permissions while keeping audit-log attribution at her base `OpsEmployee` role is no longer in use on the test roster. The code path remains in `src/lib/auth/permissions.ts` for any future user that needs scoped temporary elevation.

**Why this matches operational reality:** The core team needs to drive every flow end-to-end during the 10-tester pilot: schools, sales reps, school groups, cc rules, MOU import review, dispatch, feedback, delivery acks, audit log review, training-quality escalations. Splitting their permissions across multiple non-Admin roles would create awkward "ask Anish for a one-line PR to flip Y on" moments that interrupt the pilot. Full Admin matches the work they actually do.

**Why the remaining 5 stay non-Admin:** Ameet (Leadership), Pratik (SalesHead), Vishwanath (SalesRep), Shubhangi (Finance), Pranav (Finance) preserve role-scoping verification; the pilot still needs evidence that an Admin redirect, an audit-route lane filter, and a SalesRep's own-MOU scope all behave correctly under realistic use.

**Future review:** A follow-up role-design conversation may revisit the separation-of-duties question once the pilot ends and we know which permissions the core team actually exercised vs which they would have happily lived without. For Phase 1 this is the operational answer.

**References:**
- `docs/PHASE-F-VERIFICATION.md` §2.5 / §2.6 / §2.7 / §2.10: per-tester walkthroughs reflect Admin capabilities for the four core-team promotions.
- `docs/DEVELOPER.md` §"Test users": roster table.
- `docs/RUNBOOK.md` §10: partial obsolescence note on the cc-rule:create 30-day flip.
- `src/data/users.json` and `src/data/_fixtures/users.json`: source of truth.

---

## 2026-04-27: mou:edit-cohort-status Admin-only (W4-A.5)

W4-A added a per-MOU `cohortStatus: active | archived` flag and two surfaces (`/mous/archive` Reactivate + `/admin/mou-status` per-row + bulk). The `mou:edit-cohort-status` Action gates writes through both. **Admin-only via the Admin wildcard; OpsHead is intentionally not granted.**

**Why Admin-only:** cohort decisions are leadership-level (which academic year counts as the operationally-current pursuit). OpsHead can manage day-to-day operations on the active cohort without needing to flip MOUs in or out of the cohort itself; the AY rollover that produces the "92 archive candidates" pattern is a once-per-AY event that benefits from a deliberate Admin touch.

**Phase 2 trigger:** if pilot operators report friction on this gate (e.g., Misba routinely needs to reactivate a wrongly-archived MOU and Anish is unavailable), revisit by adding `mou:edit-cohort-status` to the OpsHead grant set in `src/lib/auth/permissions.ts`. The 1-line change matches the cc-rule:create flip pattern.


---

## 2026-04-28: dispatch-request:create + dispatch-request:review (W4-D)

W4-D introduced the Sales-initiated dispatch flow. Two new Action gates landed in `src/lib/auth/permissions.ts`:

- `dispatch-request:create`: Admin wildcard + SalesHead + SalesRep. Sales submits a DispatchRequest at `/dispatch/request`; the lib enforces this gate at submit time.
- `dispatch-request:review`: Admin wildcard + OpsHead. Ops approves / rejects via `/admin/dispatch-requests/[id]`; cancel-by-requester is implicit ownership (compares `user.id` against `DispatchRequest.requestedBy`) and does not need an Action gate.

**Phase 2 trigger awareness:** the OpsHead grant on `dispatch-request:review` is for the post-pilot role re-introduction. During the current pilot, the Ops core team (Pradeep, Misba, Swati, Shashank) all carry Admin role per the 2026-04-27 promotion, so they exercise the gate via the Admin wildcard. When the role-design conversation revisits separation-of-duties post-pilot, the OpsHead grant kicks in for any future OpsHead user not on the core team.

**`dispatch:override-gate` stays Leadership-only.** The pre-payment override is a P2 exception that lives outside the Sales request workflow; Leadership (Ameet) authorises, Finance (Shubhangi / Pranav) acknowledges via `dispatch:acknowledge-override`. The Sales request flow only handles the standard payment-then-dispatch path.

**References:**
- `src/lib/dispatch/createRequest.ts`: Sales submission lib.
- `src/lib/dispatch/reviewRequest.ts`: approve / reject / cancel lib.
- `docs/RUNBOOK.md` §11.6: W4-D dispatch redesign overview.

---

## 2026-04-28: W4-E permission grants + notification fan-out routing

W4-E introduced 5 permission Actions plus 7 trigger-wired notification fan-out sites. Permission grants are minimal-surprise extensions of the existing role matrix.

**5 new Action grants in `src/lib/auth/permissions.ts`:**

- **`spoc:import`**: Admin only (via wildcard). Used by the `scripts/w4e-spoc-import-mutation.mjs` write path. SPOC DB import is a one-shot operational migration, not a runtime user action; OpsHead is intentionally not granted because the import touches schools.json + school_spocs.json + audit logs and the current pilot has Admin-level operators (Pradeep, Misba, Swati, Shashank) covering the Ops core team.
- **`reminder:create`**: Admin + OpsHead + SalesHead + SalesRep. Sales composes reminders for their own MOUs; Ops composes for any. The action gates both `composeReminder` and `markReminderSent`.
- **`reminder:view-all`**: Admin only. Today the `/admin/reminders` list page renders the full list to every authenticated user (W3-B UI gating is off); the gate exists for the future Phase 2 surface where SalesRep would see only own-MOU reminders.
- **`notification:read`**: baseline-granted to every active role (Admin / Leadership / OpsHead / OpsEmployee / SalesHead / SalesRep / Finance / TrainerHead). The lib filters by `recipientUserId` regardless; this gate is defense in depth for the bell + `/notifications` page.
- **`notification:mark-read`**: baseline-granted to every active role. The lib enforces `notification.recipientUserId === markedBy.id` so a user cannot mark another user's notification read; the gate is the second-layer check.

**Notification fan-out routing (W4-E.5 trigger wiring; declared per site):**

| Site | Kind | Recipients |
|---|---|---|
| `createRequest.ts` | `dispatch-request-created` | broadcast: active Admin + OpsHead |
| `reviewRequest.ts` approve | `dispatch-request-approved` | single: requester |
| `reviewRequest.ts` reject | `dispatch-request-rejected` | single: requester |
| `reviewRequest.ts` cancel | `dispatch-request-cancelled` | broadcast: active Admin + OpsHead |
| `recordIntake.ts` | `intake-completed` | broadcast: active Admin + OpsHead |
| `recordReceipt.ts` | `payment-recorded` | broadcast: active Finance + sales-owner of MOU (mapped via `SalesPerson.email` → `User.email`) |
| `autoEscalation.ts` | `escalation-assigned` | single: lane head (`escalationLevelDefault(lane, 'L2')`); sender='system' bypasses self-exclusion |
| `composeReminder.ts` | `reminder-due` | single: MOU's sales-owner (mapped via `SalesPerson.email` → `User.email`) |

Self-exclusion when `senderUserId === recipientUserId` (real user sender). System sender bypasses. Idempotency dedup on `(kind, recipientUserId, relatedEntityId)` within a 60-second window. **Notification fan-out is best-effort:** failures `console.error` but do NOT roll back the parent entity write; the entity is source of truth, a missed notification is recoverable from the queue surface.

**`/notifications/[id]/visit` GET handler** (W4-E.6): markRead-then-redirect pattern. `markRead` runs first, errors are caught + logged but do NOT block the redirect to `notification.actionUrl`. The user clicked with intent to navigate; the notification system is secondary. Missing notification (deleted, etc.) bounces to `/notifications`.

**Phase 2 trigger awareness:**
- D-022: 3 deferred cc-rules (`CCR-SW-HYDERABAD`, `CCR-SW-MAHARASHTRA`, `CCR-TTT-ALL`) need Shushankita / Kranthi / Pooja Sharma / Rajesh / Sahil-Sharma confirmation before they can land.
- D-024: most current sales reps are SalesPerson records without User rows; the `payment-recorded` and `reminder-due` sales-owner fan-out silently skips when no User row matches. As Phase 2 expands the tester pool to the actual sales team, each rep needs a User row.
- D-025: Phase 1 is refresh-on-page-navigation. If round-2 testers report friction with bell-badge staleness, Phase 2 adds a 30s setInterval poll on the bell client component (cheap; reuses the same notifications.json read).

**References:**
- `src/lib/notifications/createNotification.ts`: lib + payload validation + recipient resolvers.
- `src/lib/notifications/markRead.ts`: idempotent flip + markAllRead helper.
- `src/lib/notifications/payload_contracts.ts`: per-kind payload type contracts.
- `src/app/notifications/[notificationId]/visit/route.ts`: visit GET handler.
- `docs/RUNBOOK.md` §11.7: W4-E redesign overview.

---

## 2026-04-28: W4-F SalesOpportunity permission grants (option C minimal container)

W4-F adds the pre-MOU sales pipeline tracker. Anish chose option C (minimal container; no state machine, no approval workflow, no conversion-to-MOU flow) after the recon found Mastersheet Sheet1 was a 2-row stub with zero operational data. The 4 permission Actions are deliberately scoped to the data-capture surface; approval / conversion Actions are intentionally NOT defined until the round-2 Pratik + Shashank interview formalises the workflow vocabulary (D-026).

**4 new Action grants in `src/lib/auth/permissions.ts`:**

- **`sales-opportunity:create`**: SalesRep + SalesHead + Admin. The form auto-fills `salesRepId` to the session user when SalesRep (email-mapped to SalesPerson); Admin / SalesHead pick from a dropdown.
- **`sales-opportunity:edit`**: SalesRep + SalesHead + Admin. The lib (`editOpportunity.ts`) enforces own-row vs any-row via `createdBy` comparison: SalesRep can only edit own (`not-creator-and-not-lead` failure otherwise); SalesHead + Admin can edit any. The central `canPerform` gate covers role membership; per-row ownership is the lib's responsibility.
- **`sales-opportunity:view`**: every active role baseline-granted (Admin / Leadership / OpsHead / OpsEmployee / SalesHead / SalesRep / Finance / TrainerHead). Read-only access for cross-team awareness; aligns with the Phase 1 W3-B principle "every authenticated user can view".
- **`sales-opportunity:mark-lost`**: SalesRep + SalesHead + Admin. Same own-row vs any-row enforcement as edit.

**Deliberately NOT defined in Phase 1 (held back per option C):**

- `sales-opportunity:approve-l1` (Pratik approval gate)
- `sales-opportunity:approve-l2` (Shashank approval gate)
- `sales-opportunity:convert-to-mou` (post-approval handoff)

The approval flow architecture is unknown: sequential dual / parallel / role-context-specific / threshold-based (deal size triggers different routes) / something else. Defining permission Actions before defining the workflow embeds assumptions. D-026 captures the round-2 interview path; the post-interview batch adds these Actions against the actual operational design.

**Audit fidelity for W4-F.3 status edits:**

`opportunity-edited` audit entries capture verbatim before / after strings on every changed field; no normalisation, no autocorrect, no enum coercion. The status field is the most operationally interesting because round-2 review will analyse "what status vocabulary did operators actually use?" against the audit history. The lib's diff capture is field-by-field rather than whole-record so the audit reader can isolate the status-change rows when the interview happens.

**`schoolMatchDismissed` boolean field:**

The W4-F.3 did-you-mean inline panel surfaces only when `schoolId === null` AND `schoolMatchDismissed === false` AND `findSchoolMatch` returns a candidate above the 0.7 token-overlap threshold. Two action forms close the loop: "Link to existing" calls `editOpportunity` with `schoolId` set; "Keep as new school" calls `editOpportunity` with `schoolMatchDismissed: true`. Both flips land in the audit log via the standard `opportunity-edited` action. The flag is intentionally separate from `schoolId === null` because operators may keep an opportunity unlinked deliberately (the school is genuinely new); we do not want to repeatedly resurface the suggestion on every detail-page view.

**Phase 2 trigger awareness:**
- D-026 captures the 7-sub-bullet workflow definition spec for the round-2 Pratik + Shashank interview.
- D-027 captures the Phase 1.1 AY rollover verification (first live rollover April 1, 2027).

**References:**
- `src/lib/salesOpportunity/createOpportunity.ts`: 12-field validation + OPP-{AY}-### sequence.
- `src/lib/salesOpportunity/editOpportunity.ts`: per-field diff capture + ownership enforcement.
- `src/lib/salesOpportunity/markOpportunityLost.ts`: idempotent loss flip with mandatory reason.
- `src/lib/salesOpportunity/findSchoolMatch.ts`: pure jaccard threshold helper.
- `docs/RUNBOOK.md` §11.8: W4-F minimal container overview.
- `docs/RUNBOOK.md` §11.9: W4-I round-2 testing email composition guidance.

---

## 2026-04-28: W4-G inventory permission grants + threshold config + safeguards

W4-G adds the per-SKU stock layer with auto-decrement, low-stock alerts, and threshold edits. 2 new permission Actions plus 3 architectural decisions worth recording.

**2 new Action grants in `src/lib/auth/permissions.ts`:**

- **`inventory:view`**: baseline-granted to every active role (Admin / Leadership / OpsHead / OpsEmployee / SalesHead / SalesRep / Finance / TrainerHead). Read-only access to /admin/inventory list and detail; aligns with the Phase 1 W3-B principle "every authenticated user can view operational state". Sales reps benefit from cross-team awareness (e.g., spot-checking stock when filing a DispatchRequest).
- **`inventory:edit`**: OpsHead + Admin only. Covers editing currentStock (manual cycle counts or corrections), reorderThreshold (set / clear; null suppresses low-stock alert), notes, and the active flag (sunset / reactivate). The `editInventoryItem` lib enforces this gate; SalesRep / Finance / Leadership / TrainerHead all hard-block.

**Decision: threshold config lives on `InventoryItem.reorderThreshold`, NOT a separate `inventory_thresholds.json` file.**

Reasoning: thresholds are per-SKU, not global. A separate JSON file would duplicate the entity field that already exists in the W4-G.1 schema. Contrast with `reminder_thresholds.json`, which IS a separate file because reminder thresholds are global (the same 14 / 30 / 7 / 7 day-counts apply to every MOU). The pattern is now:

- **Per-entity config** (varies by row): lives as a field on the entity itself; edited via the entity's detail page; audited per-row.
- **Global config** (one value applies to many rows): lives as a JSON file in `src/data/`; edited via a dedicated /admin surface; audited as a config change.

Future contributors picking between the two patterns: ask "does the value vary per row?" Yes → entity field. No → JSON file.

**Decision: TopNav inventory link deferred to D-037.**

Reasoning: the /admin tile is sufficient for OpsHead+Admin discovery in Phase 1. TopNav real estate is reserved for cross-cutting links (Home, MOUs, Schools, Sales pipeline, Escalations, Admin, Help). Adding inventory as a top-level link would dilute that. Re-evaluate at round 2 if Misba / Pradeep flag the extra hop as friction. The 1-line change matches the cc-rule:create flip pattern.

**Decision: pre-W4-D backfilled Dispatches do NOT decrement inventory (`raisedFrom === 'pre-w4d'` no-op).**

Reasoning: the 22 W4-D.8 backfilled Dispatches represent shipments that already happened pre-system. The Mastersheet "Current Inventory" sheet (the source for the W4-G.3 InventoryItem backfill) ALREADY represents post-historical-shipment state. Decrementing again would double-deduct: the historical shipment is reflected in `currentStock`, and decrementing the backfilled Dispatch would subtract it a second time.

The safeguard is the first check in `decrementInventory.ts`: `if (args.dispatch.raisedFrom === 'pre-w4d') return { ok: true, updatedItems: [], summary: [], lowStockTriggers: [] }`. Future backfill paths that also need this no-op should adopt the same convention (or factor a `BACKFILL_RAISED_FROM_VALUES` set). The pattern is auditable: every Dispatch is one query away from "did this decrement inventory?" via `raisedFrom`.

**Phase 2 trigger awareness:**
- D-028: Misba / Pradeep set per-SKU `reorderThreshold` values during round 2 or post-round-2 setup. Until set, no low-stock alerts fire (the lib treats null threshold as "never alerts").
- D-029 / D-030 / D-031: Phase 2 stock history sparklines / reorder PO automation / multi-warehouse stock locations.
- D-032: round 2 surfaces if the hard-block at `insufficient-stock` creates frequent friction; the policy may soften to "allow with operator-typed override reason" similar to dispatch P2 override.
- D-036: Tinkrsynth tail-end (3 sunset units) awaits Misba / Pradeep operational decision (ship as final dispatch / write off / reactivate).
- D-037: TopNav inventory link (deferred per this decision; revisit at round 2).

**References:**
- `src/lib/inventory/decrementInventory.ts`: pure plan-then-apply lib with 5 hard-block scenarios + threshold-crossing detection + pre-W4-D safeguard.
- `src/lib/inventory/editInventoryItem.ts`: 4-field edit lib with two audit codes (`inventory-stock-edited` umbrella · `inventory-threshold-edited` threshold-only path).
- `src/app/admin/inventory/page.tsx` and `src/app/admin/inventory/[id]/page.tsx`: list + detail surfaces.
- `src/components/ops/InventoryStatusPanel.tsx`: pre-emptive stock visibility on /mous/[mouId]/dispatch.
- `docs/RUNBOOK.md` §11.10: W4-G inventory tracking overview.
- `docs/W4-DEFERRED-ITEMS.md` D-028 / D-029 / D-030 / D-031 / D-032 / D-033 / D-034 / D-035 / D-036 / D-037: 10 W4-G deferred items.
