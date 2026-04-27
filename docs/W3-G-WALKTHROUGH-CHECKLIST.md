# W3-G Walkthrough Checklist (Anish on the deployed Vercel URL)

This is the verification gate Anish runs on the deployed URL after the Week 3 redesign lands. Validates that the kanban-first navigation, the W3-F.5 drag-discoverability improvements, and the lifecycle-rules editing surface all behave as intended in the production build before the round 2 testing email goes out.

The checklist is split into 11 sections (A through K). Each section has an Action, an Expected result, and a "Report if broken" line. Tick each box as you go; if anything fails or feels off, capture a screenshot + the URL bar + the user account you were logged in as and reply on the W3-G triage thread before moving on.

You will need 3 tester accounts: Anish (Admin), Pratik (SalesHead), Ameet (Leadership). The other 7 testers can be exercised after this checklist lands clean.

## A. Login redirect lands users on `/` (kanban), not `/dashboard`

1. **Action:** in an Incognito / Private window, visit `<deployed-url>/login`. Sign in as `anish.d@getsetlearn.info`.
   - **Expected:** the URL bar settles at `<deployed-url>/` (the kanban homepage). The TopNav shows `Home`, `MOUs`, `Schools`, `Escalations`, `Admin`, `Help`. There is no "Dashboard" label anywhere in the nav. The GSL Ops logo at the top-left also points to `/`.
   - **Report if broken:** any redirect target other than `/`, or any nav showing "Dashboard" instead of "Home".
2. **Action:** Sign out. Sign back in as `pratik.d@getsetlearn.info` (SalesHead).
   - **Expected:** lands on `/`. TopNav: `Home`, `MOUs`, `Schools`, `Escalations`, `Help` (no `Admin` link).
   - **Report if broken:** Pratik landing anywhere other than `/`, or seeing the `Admin` link.
3. **Action:** Sign out. Sign back in as `ameet.z@getsetlearn.info` (Leadership).
   - **Expected:** lands on `/`. TopNav: `Home`, `MOUs`, `Schools`, `Escalations`, `Help` (no `Admin` link).
   - **Report if broken:** Ameet landing anywhere other than `/`, or seeing the `Admin` link.

## B. Kanban renders ~140 MOUs distributed across 9 columns

Logged in as Anish (Admin) on `/`.

1. **Action:** Count column headers; read the totals in each column header.
   - **Expected:** 9 columns from left to right: Pre-Ops Legacy, MOU signed, Actuals confirmed, Cross-verification, Invoice raised, Payment received, Kit dispatched, Delivery acknowledged, Feedback submitted. Subtitle below the page title reads `<n> MOUs across 9 stages` where `<n>` is roughly 140 (the imported count).
   - **Report if broken:** wrong column count, columns in wrong order, or subtitle missing / wrong number.
2. **Action:** Note the count in each column. They should approximately match (numbers are imported-data dependent and can drift):
   - Pre-Ops Legacy: ~9
   - MOU signed: small (single digits)
   - Actuals confirmed: ~21
   - Cross-verification: small
   - Invoice raised: ~91
   - Payment received: ~19
   - Kit dispatched: small
   - Delivery acknowledged: small
   - Feedback submitted: small
   - **Expected:** column counts sum to roughly the subtitle total. Bulk of MOUs are in Invoice raised (the import is mid-cohort).
   - **Report if broken:** total mismatch (counts do not sum to subtitle), or any column visibly missing cards when it should have many (e.g., Invoice raised showing 0).
3. **Action:** Scroll the kanban horizontally on desktop; verify all 9 columns reachable.
   - **Expected:** smooth horizontal scroll; no clipped columns; column headers stay aligned with their card stacks.
   - **Report if broken:** column appears clipped, scroll bar not present when content overflows.

## C. Drag mechanics: 4 transition kinds + navigation-on-confirm

Logged in as Anish on `/`. Pick a MOU card you can afford to mess with (the imported data is fixture-stable; transitions write through the queue but do not touch real production data).

1. **Action: Forward-by-one drag.** Pick a card in `Actuals confirmed`. Drag its grip icon to the `Invoice raised` column. Confirm the dialog.
   - **Expected:** dialog opens showing "Move to Invoice raised". Confirming routes the browser to `/mous/<that-id>/pi` (the matching per-stage form). No reason field is required for forward-by-1.
   - **Report if broken:** dialog does not open, dialog asks for a reason, navigation lands somewhere other than `/mous/[id]/pi`.
2. **Action: Forward-skip drag.** Find a card in `Actuals confirmed` and drag past `Invoice raised` into `Payment received`.
   - **Expected:** dialog opens with a required reason field. Submitting routes to the appropriate form (or `/mous/[id]` if no form gates the destination); the audit log records `kanban-stage-transition` with kind=forward-skip.
   - **Report if broken:** reason field missing, dialog does not require a reason before allowing confirm, or no audit entry written.
3. **Action: Backward drag.** Drag a card from `Payment received` back to `Actuals confirmed`.
   - **Expected:** dialog opens with a required reason field. Submitting writes a `kanban-stage-transition` audit entry but the card does NOT visually move (backward drags capture intent only). A toast appears at the bottom-right pointing you to `/mous/[id]` for the actual data revert; toast can be dismissed via the X button.
   - **Report if broken:** card visually moves, no toast, toast wording missing the link to /mous/[id].
4. **Action: Pre-Ops exit drag.** Find a card in `Pre-Ops Legacy`. Drag it to any other column.
   - **Expected:** dialog opens with a required reason field; the card visually moves; audit log records the transition.
   - **Report if broken:** Pre-Ops drag rejected, no reason required.
5. **Action: Pre-Ops drop-into is rejected.** Drag any non-Pre-Ops card and try to drop it INTO Pre-Ops.
   - **Expected:** the drop is rejected; a toast says "Pre-Ops Legacy is a one-way exit; cards cannot move into it." The card does not move.
   - **Report if broken:** drop succeeds, no toast, or toast wording differs.

## D. Schools-needing-data tile + deep link

Logged in as Anish on `/`.

1. **Action:** Locate the "Schools needing data" tile above the kanban grid.
   - **Expected:** a small tile with a count of schools missing required fields (e.g., GSTIN, contact email). Count is non-zero (the imported school cohort has known gaps).
   - **Report if broken:** tile missing, count showing 0 when imported data has known gaps.
2. **Action:** Click the tile.
   - **Expected:** navigates to `/schools?incomplete=yes`. The school list filters to those with at least 1 incomplete field. The filter rail shows the active "Incomplete" filter.
   - **Report if broken:** wrong target URL, list not filtered, filter rail not showing the active state.
3. **Action:** Click any school in the filtered list.
   - **Expected:** navigates to `/schools/[id]/edit`. The form renders; the missing field(s) are visible (highlighted or empty).
   - **Report if broken:** lands on /schools/[id] (read-only) instead of /edit, or the form does not render.

## E. Help orientation doc

Logged in as any role (Admin gives full content; Pratik / Ameet see same content).

1. **Action:** Click `Help` in the TopNav.
   - **Expected:** lands on `/help`. The page renders 7 sections in this order: Roles, Lifecycle stages, Glossary, Workflows, Changeable settings, Change semantics, Feedback paths.
   - **Report if broken:** any section missing, sections in wrong order.
2. **Action:** On a desktop window ≥1024px wide, scroll through the page.
   - **Expected:** a sticky table-of-contents sidebar is visible on the left or right (per DESIGN.md's choice). The sidebar item that matches the section currently in view is highlighted.
   - **Report if broken:** no sticky sidebar at desktop breakpoint, or active item never updates.
3. **Action:** Click any sidebar / inline anchor link (e.g., "Glossary" or "MOU lifecycle stages").
   - **Expected:** smooth scroll to that section's heading; the URL bar updates with `#<section-id>` so the anchor is shareable.
   - **Report if broken:** hard jump (no smooth scroll) is fine; broken anchor (404 or no movement) is not.
4. **Action:** Resize the window to phone width (or use DevTools mobile mode).
   - **Expected:** sticky sidebar collapses or moves to a top-of-page disclosure; the main content column becomes single-column readable.
   - **Report if broken:** sidebar overlaps content, content cropped, or jump-anchors stop working on mobile.

## F. Lifecycle rules editing + retroactive overdue recompute

Logged in as Anish (Admin) on `/admin/lifecycle-rules`.

1. **Action:** Confirm the page lists 7 rules (one per forward-stage transition).
   - **Expected:** rule rows for: MOU signed, Actuals confirmed, Cross-verification, Invoice raised, Payment received, Kit dispatched, Delivery acknowledged. Each row shows from-stage / to-stage labels, the current `defaultDays`, the last-changed timestamp + user, optional change notes.
   - **Report if broken:** wrong row count (not 7), missing labels, missing timestamps.
2. **Action:** Edit one rule. Change `defaultDays` from its current value to a small differential (e.g., 14 → 16). Optional: add a change note ("Walkthrough test - revert after"). Submit.
   - **Expected:** page redirects with a green flash naming the rule you saved. The row's `defaultDays` value updates; the last-changed timestamp shows "today" and your name.
   - **Report if broken:** flash missing, value not updated, timestamp not refreshed.
3. **Action:** Visit `/admin/audit`. Filter by `entity=LifecycleRule`.
   - **Expected:** the most recent entry shows `lifecycle-rule-edited` with your name, the stage you edited, and a before / after diff in the entry body.
   - **Report if broken:** entry missing, before / after fields empty.
4. **Action:** Return to `/` (kanban). Look at cards in the column whose rule you just edited.
   - **Expected:** if your new `defaultDays` is smaller than the original, more cards now show `Overdue Nd` badges (because the threshold tightened). If you increased it, fewer cards show the badge. The recompute is on-render, so refreshing the kanban shows the new state.
   - **Report if broken:** badges unchanged after a rule that should have recomputed them, or badges showing for cards in the wrong column.
5. **Action:** Edit the same rule back to its original value (revert your test change). Confirm the audit log records the second edit too.
   - **Expected:** audit log now has 2 entries for that rule; the second is the revert.
   - **Report if broken:** revert silent (no audit entry), or the value did not actually persist.

## G. Kanban / Overview tab navigation + /dashboard alias

Logged in as Anish on `/`.

1. **Action:** Locate the tab strip below the page title.
   - **Expected:** two tabs: `Kanban` and `Overview`. The `Kanban` tab carries `aria-current="page"` and a navy underline.
   - **Report if broken:** tab strip missing, both tabs underlined, no underline on the active tab.
2. **Action:** Click `Overview`.
   - **Expected:** navigates to `/overview`. The Leadership Console body renders (5 health tiles, exception feed, escalation list, 10 trigger tiles). The `Overview` tab now carries the navy underline; `Kanban` is unstyled.
   - **Report if broken:** wrong target URL, body does not render, both tabs underlined.
3. **Action:** Click `Kanban`. Verify the kanban view returns; underline moves back to `Kanban`.
4. **Action:** In the URL bar, manually type `/dashboard` and press Enter.
   - **Expected:** the URL bar stays at `/dashboard`; the page renders the same Overview body; the tab strip shows `Overview` underlined (NOT `Kanban`). Bookmark compatibility preserved.
   - **Report if broken:** /dashboard 404s, redirects to / (the alias should NOT redirect; it should render in place), or the tab strip shows the wrong active state.

## H. W3-B server-side enforcement: SalesHead navigates admin areas; writes are rejected

Sign out. Sign in as `pratik.d@getsetlearn.info` (SalesHead).

1. **Action:** Visit `/admin/lifecycle-rules` directly via the URL bar.
   - **Expected:** the page renders. The 7 rule rows are visible. The Save buttons are NOT pre-disabled (W3-B disabled UI gating, which is the expected behaviour).
   - **Report if broken:** redirect to `/`, "Access denied" page, or any UI-side gate.
2. **Action:** On any rule row, change the `defaultDays` value and click Save.
   - **Expected:** the page redirects with `?error=permission&stage=<stage-key>`. The error rail at the top of the page surfaces "Editing lifecycle rules requires the Admin role." The original `defaultDays` value is unchanged. No audit entry written.
   - **Report if broken:** the save succeeds (write should have been rejected by `lifecycle-rule:edit` Admin-only check), no error message, the value persists.
3. **Action:** Visit `/admin/audit`.
   - **Expected:** page renders. The filtered list shows only Pratik-relevant entries (SALES-lane, reassignment, actuals-confirmed). No CC-rule entries, no lifecycle-rule entries, no PI / dispatch entries.
   - **Report if broken:** Pratik sees entries outside SALES lane (role-scoping in `canViewAuditEntry` would be misfiring).

## I. W3-F.5 drag UX (the discoverability + safety improvements)

This section validates the Anish UX concern that prompted the W3-F.5 insertion: testers needed a clear visual affordance for click-vs-drag, not an invisible 8-pixel threshold.

Sign in as Anish on `/`.

1. **Action:** Hover over any kanban card.
   - **Expected:** a small grip icon (vertical dots, lucide `GripVertical`) is visible at the card's top-right corner. Hovering the icon area changes the cursor to `grab`.
   - **Report if broken:** icon missing, icon in wrong corner, cursor does not change.
2. **Action:** Click the card BODY (anywhere except the grip icon).
   - **Expected:** browser navigates to `/mous/[id]`. No drag activates, no dialog opens.
   - **Report if broken:** click on the body activates drag (the listeners are on the wrong element), or click is suppressed entirely.
3. **Action:** Click and hold the grip icon, drag to another column, release on the destination.
   - **Expected:** while dragging, the cursor shows `grabbing`; a translucent clone of the card follows the cursor; the original card stays at opacity-40 in its column. On release, the transition dialog opens for the target column.
   - **Report if broken:** drag does not activate from the handle, no overlay, no dialog on release.
4. **Action:** Set browser zoom to 125% via Ctrl/Cmd-+ (twice). Repeat the click-body-then-drag-handle sequence.
   - **Expected:** both still work. The grip icon enlarges proportionally; its hit area remains tappable.
   - **Report if broken:** at 125% zoom, the handle becomes hard to hit (overlap with card edge or screen edge), or click-vs-drag disambiguation fails.
5. **Action:** Reset zoom to 100% (Ctrl/Cmd-0). Set zoom to 75%. Repeat the sequence.
   - **Expected:** still works at 75%. Cards are smaller but the handle stays clickable / draggable.
   - **Report if broken:** handle too small to hit at 75%.
6. **Action: Keyboard drag.** Reset to 100% zoom. Click anywhere on the page to clear focus, then press Tab repeatedly.
   - **Expected:** Tab order moves through TopNav links, then the page hint, then the SchoolsNeedingDataTile, then card body link, then card drag handle, then next card body link, then next card handle, etc. Each focused element shows a 2px navy ring (DESIGN.md focus indicator).
   - **Report if broken:** tab order skips the handle, focus ring missing or wrong colour.
7. **Action:** Tab to a card's drag handle (focus ring appears on the grip icon). Press Space.
   - **Expected:** keyboard drag mode activates. dnd-kit's screen-reader announcement says "Picked up MOU <id>." Arrow keys move the card between columns; Space again drops; Esc cancels.
   - **Report if broken:** Space does not lift, arrow keys do not move, Esc does not cancel.

## J. Mobile spot-check (real phone OR DevTools mobile mode)

Sign in as Anish.

1. **Action:** Open `/` in a phone-width viewport (real phone or DevTools "iPhone 14" / "Pixel 7" simulator at 390x844 or similar).
   - **Expected:** kanban columns vertical-stack (one column per row). Each column renders with its full card list. Cards still show the grip icon at the top-right.
   - **Report if broken:** columns horizontal-scroll on mobile (would be unusable), columns clip, cards missing the icon.
2. **Action:** Tap a card body.
   - **Expected:** navigates to `/mous/[id]`. No drag mode entered.
   - **Report if broken:** tap activates drag (mobile drag is deliberately not the supported flow per RUNBOOK §10.4; the tap should always navigate).
3. **Action:** Try to long-press and drag the grip icon on mobile.
   - **Expected:** TouchSensor's 15px activation MAY pick up the drag; this is acceptable. If it does, the dialog opens normally. If it does NOT activate (because vertical-stack does not show drop zones cleanly), that is also fine; the rule is "do not break", not "support drag".
   - **Report if broken:** the touch starts a drag but then the column row layout makes it impossible to find a drop target (drop becomes a no-op trap).
4. **Action:** Tap `Help` in the TopNav.
   - **Expected:** orientation doc renders single-column readable. Sticky sidebar collapses or moves to a top-of-page disclosure (matches Section E step 4).
   - **Report if broken:** sidebar overlaps content, content unreadable on mobile.

## K. Audit log on MOU detail pages

Sign in as Anish on `/`.

1. **Action:** Click any kanban card to navigate to its detail page.
   - **Expected:** `/mous/[id]` renders. Scroll to the bottom; an "Audit log" section is visible.
   - **Report if broken:** audit log section missing.
2. **Action:** Read the audit log entries.
   - **Expected:** at least 1 entry per MOU (the import-tick `mou-imported` entry from the upstream backfill); MOUs that have moved through stages have multiple entries (`actuals-confirmed`, `pi-issued`, `dispatch-raised`, etc.). Each entry shows timestamp, user, action, and a 1-sentence summary or before / after diff where applicable.
   - **Report if broken:** entries missing, timestamps formatted weirdly, action names cryptic.
3. **Action:** Pick a MOU you exercised in Section C (drag transitions). The audit log should include the `kanban-stage-transition` entry from your drag, with the reason you provided.
   - **Expected:** the entry shows your name, the from-stage and to-stage, and the reason text verbatim.
   - **Report if broken:** entry missing, reason text not captured.

---

## Reporting

If any section above failed, reply on the W3-G triage thread with:

1. The section letter and step number (e.g., "C.3 backward drag").
2. The user account you were logged in as (for non-Anish steps).
3. A screenshot showing the URL bar + the broken state.
4. A 1-sentence description of what you saw vs what was expected.

Anish triages and decides whether the issue blocks the round 2 testing email or can be deferred to Phase 1.1.

If everything passes: reply "W3-G walkthrough clean" and we draft the round 2 testing email together.
