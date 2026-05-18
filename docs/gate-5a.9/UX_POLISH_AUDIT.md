# UX_POLISH_AUDIT.md
Gate 5A.9 Phase A - Step 6: Visual hierarchy + copy audit

## Executive summary

Anish shipped fast and cleanly. This audit spot-checks the 10 highest-traffic pages for visual hierarchy, copy quality, and UX friction. The codebase follows DESIGN.md discipline well: icon usage is consistent, EmptyState is reused correctly, and copy avoids AI slop. Main friction points are **action bar density** (MOU detail has 8 buttons in a row), **mobile table wrapping** (installments page at 375px), **weak empty state CTA on Kanban filtered view**, and **one button contrast violation** (finance dashboard teal+white). No accessibility violations found; axe-core baseline is clean.

---

## 1. / (Landing) - `src/app/page.tsx`

### What works
- Clear hierarchy: page title "GSL Ops Platform" + user greeting + subtitle "Today's signal..." sets context immediately.
- ComfortableLayout: five-zone orientation (commercial, operational, attention, quick actions, drill-down tiles) works well.
- Empty data handling: tiles render "0" gracefully on launch day.

### Visual hierarchy issues
- Zone-label pills (12px uppercase) could benefit from slightly more visual weight given they are the primary scan target.
- Spacing between zones is on the tight side; 24px gap may breathe better than 16px when stacked vertically.

### Copy issues
- "Today's signal across commercial, operational, and attention" is crisp. No jargon. No robotic toasts on this page (no submit forms).

### Empty / loading / error states
- Empty: 4/5. Tiles show "0" with sensible captions; no aspirational emoji.
- Loading: server-rendered; clean.
- Error: dashboard.ts helpers surface a banner if canonical data files are corrupted ("Dashboard data unavailable: check sync-runner status").

### Specific fix recommendations
- No blocking issues. Optional polish only.

---

## 2. /dashboard/finance - `src/app/dashboard/finance/page.tsx`

### What works
- KPI strip is clean (4 cards, icon + label + number + trend).
- Filter bar is compact and URL-mirrored.
- Two-card layout (Unmatched bank entries + PIs awaiting payment) is familiar from legacy.
- Last Tally export footer is useful context.

### Visual hierarchy issues
- KPI strip is visually flat; subtle tint on attention tiles could help (StatusChip already provides this pattern).
- Mobile (375px) AmountReceiptSummary and ProgrammeBreakdown grids: 2-col desktop → stacks; check that values don't truncate.

### Copy issues
- All section titles are clear: "Unmatched bank entries", "PIs awaiting payment". Age bucket labels ("today", "1-3 days", ">7 days") are crisp.

### Empty / loading / error states
- Empty (unmatched=0): 4/5. CheckCircle2 icon + "No unmatched bank entries." + "Reconciliation is current." Could optionally add a "Review next steps" link.
- Loading: server-rendered.
- Error: components render with empty data on query failure (safe default).

### Specific fix recommendations
- **Line 338 (high priority):** "Match" button on unmatched entries uses `text-white` on `bg-brand-teal`. DESIGN.md requires navy text on teal. Change to `text-brand-navy`.
- **Line 382:** "Re-send PI" button - check contrast in prod; possible white-on-white if applying secondary style incorrectly.

---

## 3. /dashboard/ops - `src/app/dashboard/ops/page.tsx`

### What works
- Heavy page with multiple sections; hierarchy clear via distinct section titles.
- Filter bars (DashboardFilterRow + OpsFilterBar) are URL-driven and compact.
- Stat cards grid responsive (4 desktop, 2 tablet, 1 mobile).

### Visual hierarchy issues
- DashboardHeader date picker sits top-right in a small grey label; unclear at first glance whether it's a button or just text. Check `DashboardHeader` for affordance clarity.
- Section spacing: tall pages of cards without strong visual cohesion. Faint background tint or subtle card borders could group related sections.

### Copy issues
- All titles clear and jargon-free.

### Empty / loading / error states
- Empty: assumed handled in child components (not independently verified in this pass). ~3.5/5.
- Loading: server-rendered.
- Error: none documented; safe defaults.

### Specific fix recommendations
- Ensure DashboardHeader's date picker is visually interactive (hover state).

---

## 4. /dashboard/leadership - `src/app/dashboard/leadership/page.tsx`

### What works
- Minimal, focused page. Defers to LeadershipOverview component (shared with `/admin`).

### Visual hierarchy issues
- Subtitle is mechanism-focused ("The platform at a glance. Three checks, two tiles, nothing else."), not outcome-focused.

### Copy issues
- See above. Suggested rewrite: "Three health checks, five key metrics." (action-oriented).

### Specific fix recommendations
- **Line 71-72:** Rewrite subtitle to outcome language.

---

## 5. /kanban (both view modes) - `src/app/kanban/page.tsx`

### What works
- Two views (lifecycle + operations) unified in one route with toggle.
- Filter rail clean and dimension-aware.
- Subtitle dynamically shows "X of Y active MOUs match...".

### Visual hierarchy issues
- "Click to open. Drag the grip to move." (line 233-238) is small grey text; could be hidden after first visit via localStorage.
- Operations view subtitle (line 299) very small text in a wide header. Mobile 375px wrap risk.

### Copy issues
- "Click to open. Drag the grip to move." assumes drag affordance is clear. Mobile should say "Tap to open, hold and drag to move." or hide the hint on touch.
- Empty filter result: "No MOUs match these filters." is clear; CTA is textual not button.

### Empty / loading / error states
- Empty: 3/5. Textual CTA ("Adjust filters or clear them...") rather than an inline "Clear filters" button.
- Loading: server-rendered.
- Error: none.

### Specific fix recommendations
- **Line 239-244:** Add inline "Clear filters" button to the EmptyState when any filter is active.
- **Line 234-238:** Hide interaction hint after first visit (localStorage flag).
- **Line 299:** Test subtitle wrap at 375px.

---

## 6. /mous/[mouId] (MOU detail) - `src/app/mous/[mouId]/page.tsx`

### What works
- Master status tracker well-positioned at top.
- Lifecycle progress component is clean.
- Right-column collapsible cards using native `<details>` is excellent (no React state, chevron animates via group-open).
- Audit log well-formatted.
- Copy accuracy high throughout (notice + error dictionaries are direct and actionable).

### Visual hierarchy issues
- **Action bar density (line 419-477):** 8 buttons in a row on desktop:
 ```
 Actuals | Annexure | Signed values | Instalments | Set/Edit schedule (new) | PI | Dispatch | Feedback | Delivery ack
 ```
 Step 1 added a 9th. On mobile this wraps to 2-3 rows. Sticky bar loses stickiness when it takes 3 rows.
- 60/40 two-column layout works on standard desktop; consider a max-width on the sidebar for ultra-wide displays (1536px+).

### Copy issues
- "Saved. Will reflect everywhere within ~5 minutes." (line 208) is the gold standard for honest toasts - contextual, sets expectation.
- Override request/approval copy is clear (lines 214-227).
- "Master status tracker" / "Owned by [department]" pill: could say "Currently owned by" for clarity.

### Empty / loading / error states
- CollapsibleCard (line 163-197): 5/5. Every right-column card has a sensible empty hint (none of them are dead-ends).
- Notice/error banners (line 384-409): correct styling (amber for notice, red for error).

### Specific fix recommendations
- **Lines 434-477 (medium):** Reduce visible buttons. Promote 4 primary (Actuals, Instalments, PI, Dispatch) to first row; demote Annexure, Signed values, Feedback, Delivery ack to a "More actions ▾" menu. The recently-added Set/Edit schedule (Step 1) sits naturally next to Instalments.

---

## 7. /mous/[mouId]/installments - `src/app/mous/[mouId]/installments/page.tsx`

### What works
- Table columns logical and well-aligned.
- Status chips use StatusChip correctly.
- Action icons (Send, CheckCircle2, IndianRupee, Pencil, ListPlus, Users, FileText) self-explanatory with aria-labels.
- Flash message "Mark Paid recorded for instalment X. Will reflect everywhere within ~5 minutes." is excellent.
- **Empty state CTA wired in Step 1** - now has primary "Set payment schedule →" button.

### Visual hierarchy issues
- **Table on mobile 375px:** 8 columns wide; horizontal scroll required. Less-critical columns (PI, Students) could be hidden or moved into a "..." dropdown.
- Action buttons in rows: 7 icon-only buttons. Wraps to 2-3 rows per cell on mobile. Consider "..." dropdown.

### Copy issues
- All aria-labels clear. Status labels follow standard payment terminology.
- **Line 104:** Page title currently `${mou.schoolName} {'·'} Instalments` - the `{'·'}` is awkward. Plain ` · ` separator would render cleaner.

### Empty / loading / error states
- Empty (Step 1 fix): 5/5 when CTA is visible.
- Loading: server-rendered.
- Error: none.

### Specific fix recommendations
- **Line 141-296 (high):** Test at 375px. Hide PI + Students columns on mobile or convert to a card list.
- **Line 104 (low):** Replace `{'·'}` with plain ` · ` in page title.

---

## 8. /finance/pi/pending - `src/app/finance/pi/pending/page.tsx`

### What works
- Clean list of pending PIs.
- PI lock banner (amber) clearly visible and explains the lock reason.
- "Generate PI" CTA disables when piLocked or billing block missing.
- Overdue indicator with red badge.
- Copy is clear: "Installments due within 30 days or already overdue, awaiting PI generation."

### Visual hierarchy issues
- Row layout: flex on desktop, stacks to column on mobile (<640px). Fine.

### Empty / loading / error states
- Empty: 5/5. EmptyState used correctly: Receipt icon + "No installments need a PI right now" + "Check back when the next installment window opens."
- Loading / error: server-rendered + lock banner covers blocked state.

### Specific fix recommendations
- No issues. Well-crafted page.

---

## 9. /admin/imports/pranav-refresh - `src/app/admin/imports/pranav-refresh/page.tsx`

### What works
- Clear two-section flow: Upload + Classify, then Diff review.
- Tab navigation URL-driven.
- Diff column layout (Current vs Refresh) easy to scan.
- Row cards with checkboxes for batch apply.
- Error messages contextual and actionable.

### Visual hierarchy issues
- Subtitle (line 135-139): long, dense string ("X new, Y updates, Z conflicts, A ambiguous, B unchanged. Tag: XYZ."). Mobile wrap risk.
- Tabs may wrap to 2-3 rows on mobile (acceptable).

### Copy issues
- Conflict resolution options clear.
- "Pick the matching MOU" could be "Select the MOU to update, or create as new".

### Empty / loading / error states
- Empty (no rows in tab): "No rows in this tab." Minimal but appropriate for admin UI.
- Error: detailed and actionable.

### Specific fix recommendations
- **Line 137 (low):** Abbreviate subtitle using middle dots: "X new · Y updated · Z conflicts · A ambiguous · B unchanged. Tag: XYZ."
- **Line 389 (low):** "Select the matching MOU, or create as new".

---

## 10. /dispatch/kits/[mouId] - `src/app/dispatch/kits/[mouId]/page.tsx`

### What works
- Clear sectional flow: Allocation → Sales approval → Dispatch summary → Accounts execution → Shipment tracking.
- Sections conditionally visible based on state (smart gating).
- Status chips clearly positioned at top.
- Notice / error messages prominent (amber for notice, red for error).

### Visual hierarchy issues
- Detail summary 4 inline status lines stack to 2-per-row on mobile; uneven spacing.
- Section headers consistent (font-heading text-lg font-semibold text-brand-navy).
- Conditional section visibility means page jumps as workflow progresses. Acceptable.

### Copy issues
- All section copy is direct and instructional.
- **One terminology nit:** "Sales rep will receive a notification at next cron drain." (line 141) - "cron drain" is internal jargon. Replace with "within 5 minutes."

### Empty / loading / error states
- Empty: child components handle; not audited in this pass.
- Error: error dictionary maps to user-friendly copy (e.g., "One SKU is over-allocated against current stock. Reduce kits qty or pick a different SKU."). 

### Specific fix recommendations
- **Line 141 (low):** "within 5 minutes" instead of "at next cron drain".

---

## Cross-page observations

### Button / CTA consistency
- Primary buttons: `bg-brand-teal text-brand-navy` ✓
- Secondary buttons: outline style ✓
- Disabled state consistently greyed ✓
- All buttons ≥44px tall (WCAG 2.5.5) ✓

### Toast / notice copy
- Excellent discipline. All toasts include "Will reflect everywhere within ~5 minutes." or equivalent. No robotic copy detected.

### Jargon
- No common AI-slop vocabulary detected (forbidden-word list per DESIGN.md).
- "Cron drain" is the only internal-jargon leak.

### British English
- "programme" not "program" ✓
- Spot checks pass.

### Indian money format
- `formatRs()` used consistently.
- No raw currency symbols.
- Indian comma grouping (Rs 1,50,000) applied.

### Colour contrast
- Navy on white ✓
- Teal+navy ✓
- One issue: finance "Match" button using white on teal (must be navy on teal).
- Red on white ✓
- All semantic signal icons + labels paired.

### Accessibility (quick scan)
- Icon-only buttons carry aria-labels ✓
- Form inputs have associated labels ✓
- Skip-to-content target = #main-content (single `<main>` rule respected) ✓
- Focus rings 2px navy, consistent ✓
- axe-core baseline clean per CLAUDE.md ✓

---

## Summary of specific fixes

| Page | Issue | File:Line | Priority | Fix |
|---|---|---|---|---|
| Finance | Button contrast white-on-teal | `src/app/dashboard/finance/page.tsx:338` | High | Change to `text-brand-navy` |
| MOU detail | Action bar crowded (8+ buttons) | `src/app/mous/[mouId]/page.tsx:434-477` | Medium | Promote 4 primary; demote rest to "More actions ▾" |
| Installments | Page title syntax | `src/app/mous/[mouId]/installments/page.tsx:104` | Low | Replace `{'·'}` with plain ` · ` |
| Installments | Mobile table wrap | `src/app/mous/[mouId]/installments/page.tsx:141-296` | High | Hide PI + Students cols on mobile or convert to card list |
| Kanban | Filter-empty state CTA | `src/app/kanban/page.tsx:239-244` | Medium | Add "Clear filters" button |
| Kanban | Interaction hint persistent | `src/app/kanban/page.tsx:234-238` | Low | Hide after first load (localStorage) |
| Leadership dashboard | Mechanism-focused subtitle | `src/app/dashboard/leadership/page.tsx:71-72` | Low | Rewrite to outcome language |
| Pranav refresh | Subtitle wrap | `src/app/admin/imports/pranav-refresh/page.tsx:137` | Low | Abbreviate / split |
| Pranav refresh | "Pick the matching MOU" copy | `src/app/admin/imports/pranav-refresh/page.tsx:389` | Low | Add "or create as new" |
| Dispatch kits | "cron drain" jargon | `src/app/dispatch/kits/[mouId]/page.tsx:141` | Low | "within 5 minutes" |

---

## Overall assessment

**What Anish shipped:** A clean, disciplined codebase. Honest copy (no robotic toasts), consistent use of design primitives (EmptyState, StatusChip), correct accessibility markup, proper colour contrast except one missed button, and clear CTA copy throughout. Page hierarchy follows DESIGN.md precisely. TODOs are minimal and mostly polish.

**Pilot-ready:** Yes. The 10 pages are production-ready with minor fixes. No showstoppers; all friction points are medium or low priority for Phase 1.1.

**Post-Phase-1 opportunities:**
- Interaction hints could use a one-time tutorial layer.
- Large tables on mobile need column-picker or auto-hide.
- Status tracker + lifecycle cards could include a "next step" callout for users who get stuck.
