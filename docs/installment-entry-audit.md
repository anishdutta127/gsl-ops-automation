# Instalment entry-point audit

**Date:** 2026-05-18
**Trigger:** Pranav (Finance) asked "How & where do we set the instalments?" while looking at an MOU detail page. He saw the empty-state "No instalments yet. They'll appear here once this MOU is Signed and a payment schedule is set" but found no CTA to actually set the schedule.

## TL;DR

The schedule editor exists and is fully functional, but it is **undiscoverable from the UI**. There is no link to it from the MOU detail page, no link from the Instalments listing (including the empty-state copy Pranav saw), no link from the workflow banner, and no link from the help index. The only way a user can reach `/mous/[id]/installments/schedule-edit` today is by typing the URL.

## 1. Every route / component / action that lets a user create or edit an instalment schedule

### 1a. The dedicated schedule editor (the right tool)

**Route:** `/mous/[mouId]/installments/schedule-edit`
**Page:** `src/app/mous/[mouId]/installments/schedule-edit/page.tsx`
**Form component:** `src/app/mous/[mouId]/installments/schedule-edit/ScheduleEditorForm.tsx`
**Submit API:** `POST /api/mou/[mouId]/schedule/save` → `src/app/api/mou/[mouId]/schedule/save/route.ts`
**Library:** `src/lib/scheduleEdit/saveSchedule.ts` (`saveScheduleNoPi`, `overrideLockedSchedule`)

This is the canonical surface. Two modes:

- **No-PI mode (unlocked):** add / remove rows, edit % due, due date, notes. Validates that percentages sum to 100% (±0.5% tolerance). Save replaces the structural payment list for the MOU.
- **Override mode (locked):** when at least one payment for the MOU has a `piNumber` or `piSentDate`, the editor locks row count and requires a ≥10-char override reason. Saving runs through `computeRecalcWithAdjustments()` so issued PI amounts stay correct and Adjustment rows are materialised for any re-priced locked instalment.

### 1b. The per-instalment row editor (only edits one row, doesn't create a schedule)

**Route:** `/mous/[mouId]/installments/[paymentId]/edit`
**Page:** `src/app/mous/[mouId]/installments/[paymentId]/edit/page.tsx`
**API:** `POST /api/mou/installments/edit` → `src/app/api/mou/installments/edit/route.ts`

Edits due date, expected amount, and notes for one already-existing Payment row. Cannot create the schedule from scratch. Reached via the pencil icon in the Actions column of the Instalments listing - visible only to `canEditFinanceData` (Finance + Admin).

### 1c. Initial seeding (where instalments come from in practice today)

`src/lib/imports/pranavApply.ts` (lines 224-274) - when an MOU is created or refreshed via the Pranav import, instalment rows are seeded from the Excel `installments` array on each parsed row (`${mouId}-i${seq}` IDs). This is the path that has actually populated `payments.json` for the 8 instalments on `MOU-STEAM-2627-001`. It is a CLI / admin-action flow, not a per-MOU UI flow.

There is no other UI affordance that creates the initial schedule for a brand-new MOU.

## 2. Is there a CTA from the MOU detail page?

**No.** I checked the action bar in `src/app/mous/[mouId]/page.tsx` (lines 434-477). The buttons rendered are: Actuals, Annexure, Signed values, **Instalments**, PI, Dispatch, Feedback, Delivery ack. The "Instalments" button routes to `/mous/[id]/installments` (the listing), not the schedule editor.

The Instalments listing page (`src/app/mous/[mouId]/installments/page.tsx`) renders the empty-state copy at lines 132-140:

> No instalments yet. They'll appear here once this MOU is Signed and a payment schedule is set.

It does **not** include a link, button, or any other affordance to set the schedule. Pranav saw the message and had nowhere to click. The bottom of the page only has a "Back to MOU detail" link (line 300-305).

The workflow banner stages in `src/lib/workflowState.ts` have CTAs pointing to `/mous/[id]/installments`, `/mous/[id]/intake`, `/finance/pi/pending`, `/schools/[id]`, `/dispatch/kits/[id]`, and `/mous/[id]` - none point to `schedule-edit`.

A global grep for `schedule-edit` returns exactly three sources: the page itself, the API route, and `BACKLOG.md`. No component, no Link, no nav, no help entry mentions it.

**This is the gap.** The route was built (Gate 5A.6 Step 1), but no entry point was wired up.

## 3. Canonical flow Pranav should follow today

Until an entry point lands, the only path is:

1. Open the MOU detail page, e.g. `/mou/MOU-STEAM-2627-001` - note the system convention is actually `/mous/MOU-STEAM-2627-001` (plural).
2. **Manually edit the URL** to `/mous/MOU-STEAM-2627-001/installments/schedule-edit`.
3. The editor renders. For an MOU with no existing instalments the form bootstraps a single 100%-row from `contractValue` (see `ScheduleEditorForm.tsx` lines 55-71); add rows with the "Add instalment row" button, set percentages so they total 100%, set due dates and optional notes.
4. Click "Save schedule". The API redirects back to the editor with a `?saved=1` flash. Within ~5 minutes the sync drain commits the new rows to `payments.json` and they appear on the Instalments listing.
5. If any instalment already has a PI issued (the "locked" case), use override mode: fill the reason ≥10 chars, click "Override and continue", then "Save override". Adjustment rows materialise for any re-priced locked rows.

There is no documentation entry for this flow in `src/content/help.ts` either - Pranav can't find it via the in-app help index.

## 4. Permission gates

From `src/app/mous/[mouId]/installments/schedule-edit/page.tsx` lines 90-91 and the lib at `src/lib/scheduleEdit/saveSchedule.ts`:

| Capability | Gate | Who passes (per `src/lib/access.ts`) |
|---|---|---|
| View the editor | authenticated + MOU visibility (`SalesRep` sees only their own MOUs) | Anyone with a session, modulo SalesRep scoping |
| Save in **no-PI mode** | `canEditMOU` OR `canEditFinanceData` | Sales department + Finance department + Admin wildcard (null department) |
| Save in **override mode** (PI issued) | `canEditFinanceData` only | Finance department + Admin wildcard |
| Hit the API submit endpoint | session required; lib re-checks the gates | Same as above (defence in depth) |

**Pranav (Finance)** has `canEditFinanceData` so he can save in both modes. The gate is not what's blocking him - discoverability is.

The `TESTING_OPEN_ACCESS` env default (CLAUDE.md "Testing-vs-production access defaults") opens VIEW gates wide but leaves EDIT gates strict, so even in testing mode Ops users wouldn't be able to save an override edit - that stays Finance-only by design.

## Summary of the gap

| What | State |
|---|---|
| Schedule editor route | ✅ exists, fully functional, gated correctly |
| Initial-seeding UI | ❌ none - relies on Pranav-refresh import or direct URL |
| Link from MOU detail page action bar | ❌ missing |
| Link from Instalments listing (populated case) | ❌ missing |
| Link from Instalments listing empty state | ❌ missing - Pranav was on this screen |
| Link from workflow banner CTA | ❌ missing |
| Help index entry | ❌ missing |

The minimal fix surface is the empty-state copy at `src/app/mous/[mouId]/installments/page.tsx` lines 132-140 (turn it into a CTA when `canSaveNoPi`) plus a "Set schedule" / "Edit schedule" button in the MOU detail action bar at `src/app/mous/[mouId]/page.tsx` lines 456-462 (next to or replacing the "Instalments" link, gated on `canEditMOU || canEditFinanceData`). Reporting only - no code changes per request.
