# MATURITY_PASS_PLAN.md
Gate 5A.9 Phase A - Step 7: Synthesis of Phase B-E plans

## Premise

Anish shipped fast over 8 weeks. The audit (Steps 2-6) confirms the platform is structurally complete and clean, with five concrete user-friction surfaces:

1. **One critical CTA gap** - installment schedule editor undiscoverable. **Fixed in Step 1.**
2. **Two parallel-build PI flows locked behind env var.** Operationally ready; flip is a coordination question with Pranav, not engineering.
3. **A handful of Phase 1.1 deferrals** (PI render-only split, MOU docx generator, dispatch Kanban) - light-touch follow-ups.
4. **Density and copy polish** on heavy pages (MOU detail action bar, mobile tables, robotic "cron drain" phrasing in one place).
5. **Power-user discoverability** missing (no global search, no recent items, no command palette).

Anish's direction is to mature the platform - not cut features, not rebuild, but to make it usable for non-experts with better visual hierarchy and human touch. The four phases below sequence the work so each unlock builds on the last.

---

## Phase B - Activate parallel features

**Goal:** Move from "code complete, env-locked" to "operational" for the two PI flows. Cut over from gsl-mou-system as the PI source of truth.

### B.1 - Coordinate Pranav stop time

- **Deliverable:** A signed-off cutover window with Pranav.
- **Inputs:** PARALLEL_BUILD_INVENTORY.md § Cutover sequence.
- **Engineering scope:** zero. This is a coordination + comms task.
- **Time:** 1 week wall-clock for scheduling; 2 hours active comms.

### B.2 - Counter snapshot freshness

- **Deliverable:** Up-to-date `src/data/pi_counter_map.json` matching gsl-mou-system's counter as of cutover T-2h.
- **Inputs:** `scripts/cutover-snapshot.mjs`, gsl-mou-system counter state.
- **Engineering scope:** small. Run the snapshot script, commit, push.
- **Time:** 1 hour.

### B.3 - Flip the lock + verify

- **Deliverable:** `PI_PARALLEL_BUILD_LOCK=false` set in Vercel; verified test PI generated.
- **Inputs:** PARALLEL_BUILD_INVENTORY.md § Cutover sequence steps 4-7.
- **Engineering scope:** small. Env-var change + one `npx vercel --prod`.
- **Time:** 30 minutes.

### B.4 - Phase 1.1 deferrals (parallel track, not blocking)

These do not block the Phase B cutover but should be scheduled within the same maturity window so the system is feature-complete:

- **PI render-only split** (`src/lib/pi/generatePi.ts` → `renderPi` + `issueAndRenderPi`). Wired into the PI detail page download button. Time: 1 day.
- **MOU docx Generate flow** (`src/components/mou-system/GeneratorWizard.tsx` → `/api/mou/generate-docx`). Time: 1-2 days.
- **Dispatch-workflow Kanban** (`/operations/kanban/page.tsx`, 6-column kit lifecycle view). Time: 2-3 days.

### Phase B summary

- **Time:** 1 week wall-clock (mostly Pranav coordination) + ~4 engineering days for the deferrals.
- **Dependencies:** Pranav stop signal.
- **Primary user benefit:** Ops becomes the authoritative PI issuer. Pranav no longer maintains a parallel workflow in gsl-mou-system. Cuts cognitive overhead and dual-system audit reconciliation.
- **Deliverables:** Live PI generation. Cutover-day playbook executed. Phase 1.1 deferrals shipped.

---

## Phase C - Discoverability + IA fix pass

**Goal:** Close the gaps surfaced in DISCOVERABILITY_AUDIT.md. Every score ≤2 becomes 4+. Every empty state teaches and offers a next step. Establish breadcrumbs as a uniform pattern.

### C.1 - CTA wiring (close URL-only / buried surfaces)

| Surface | File:Line | Fix |
|---|---|---|
| `/mous/[id]/upload-signed` | `src/app/mous/[mouId]/page.tsx` action bar | Add "Upload signed MOU" button visible when MOU status is Pending Signature; gated on canEditMOU. |
| `/admin/chain-mou-reconciliation` | `src/app/admin/page.tsx` tile + label | Rename tile to "School-group MOU links". Add a one-line description on the tile. |
| User management | `src/app/admin/users/page.tsx` (new) | Build the surface per CLAUDE.md Phase 1.1 backlog. Create + edit + deactivate. Time: 2 days. |
| `/admin/templates` | `src/app/admin/templates/[id]/edit/page.tsx` | Add a help link in the page header pointing to a help-index entry for docxtemplater syntax. Time: 30 minutes. |

**Time:** 3 days.

### C.2 - Empty state teaching pass

Every empty state becomes "teaches what would appear here + offers the action to make it appear":

- `/kanban?...&filters=...` (zero results) - add inline "Clear filters" button. File: `src/app/kanban/page.tsx:239-244`. Time: 1 hour.
- `/mous/[id]/payment-receipt` - when empty, teach "Receipts are recorded by Finance after a bank reference matches an instalment." Time: 30 minutes.
- `/mous/[id]/kits-details` - similar teaching pass. Time: 30 minutes.
- Audit remaining surfaces for "No data" dead-ends. Time: 1 day cumulative.

**Time:** 2 days.

### C.3 - Breadcrumbs as a uniform pattern

- **Spec:** every page that isn't a TopNav-primary uses `PageHeader breadcrumb={[...]}` with at least 2 entries (parent + current). Time: 1 day for the page audit + edits.
- **Tooling:** add a lint rule or unit test that flags PageHeader usage without a breadcrumb prop on non-root routes. Time: 0.5 day.

**Time:** 1.5 days.

### C.4 - Hyperlinked reports (drill-through)

- `/reports/payment-aging` and `/reports/dispatch-performance` etc. - make MOU IDs + school names clickable to `/mous/[id]` and `/schools/[id]`. Time: 1 day (D-049).
- Cross-cutting: extend report cell renderers to support optional href.

**Time:** 1 day.

### C.5 - Per-page help links

- Every page surfaces a "?" icon in the page header linking to the relevant `/help#<anchor>`. Time: 1 day to add the prop + populate anchors.

**Time:** 1 day.

### Phase C summary

- **Time:** ~8 days engineering.
- **Dependencies:** Phase B operational (so we're not polishing a system that's about to change semantics).
- **Primary user benefit:** First-time users complete their daily tasks without asking Anish where things are. Returning users hit their workflow in fewer clicks. Reports become a drill-through surface instead of a static read.
- **Deliverables:**
 - All discoverability ≤2 surfaces moved to 4+.
 - Empty states teach + CTA across the platform.
 - Breadcrumbs uniform.
 - Reports hyperlinked to detail.
 - Help links contextual.

---

## Phase D - UX polish + human touch

**Goal:** Replace robotic copy. Tighten visual hierarchy. Honest toasts. Mobile-correct on 375px. Reduce action bar density. The platform feels like a senior product, not a feature checklist.

### D.1 - Action bar density (MOU detail)

- **File:** `src/app/mous/[mouId]/page.tsx:434-477`.
- **Fix:** Reduce visible buttons to 4 primary (Actuals, Instalments / Schedule, PI, Dispatch). Move 5 secondary (Annexure, Signed values, Feedback, Delivery ack, Upload signed) into a "More actions ▾" disclosure menu.
- **Constraint:** preserve all permission gates exactly; no behavioural change.
- **Time:** 1.5 days (component + tests + mobile verification).

### D.2 - Mobile table wrap pass

- **File:** `src/app/mous/[mouId]/installments/page.tsx:141-296`.
- **Fix:** Hide PI + Students columns on viewport <640px. Convert action column to a "..." dropdown on mobile.
- **Cross-cutting:** audit other dense tables (`/finance/payments`, `/admin/dispatch-requests`).
- **Time:** 2 days.

### D.3 - Copy + jargon pass

| Surface | File:Line | Fix |
|---|---|---|
| Dispatch kits notice | `src/app/dispatch/kits/[mouId]/page.tsx:141` | Replace "at next cron drain" with "within 5 minutes". |
| Pranav refresh subtitle | `src/app/admin/imports/pranav-refresh/page.tsx:137` | Abbreviate with middle-dot separators. |
| Pranav refresh CTA | `src/app/admin/imports/pranav-refresh/page.tsx:389` | "Pick the matching MOU" → "Select the matching MOU, or create as new". |
| Installments page title | `src/app/mous/[mouId]/installments/page.tsx:104` | Replace `{'·'}` with plain ` · ` separator. |
| Leadership subtitle | `src/app/dashboard/leadership/page.tsx:71-72` | Rewrite to outcome-focused (e.g. "Three health checks, five key metrics."). |

**Time:** 1 day cumulative.

### D.4 - Button contrast bug

- **File:** `src/app/dashboard/finance/page.tsx:338`.
- **Fix:** Change "Match" button text from `text-white` to `text-brand-navy` (DESIGN.md teal-bg rule).
- **Time:** 30 minutes (the fix is 1 line; test is 1 hour).

### D.5 - Visual hierarchy polish

- **Subtle background tint** on attention-state KPI tiles (already StatusChip-driven; extend to top-level tiles).
- **24px gap** between major section dividers on long pages (Ops dashboard, Finance dashboard).
- **Sticky bar height** review on MOU detail (after D.1 reduces buttons, sticky should be 1 row at md+).
- **Time:** 2 days.

### D.6 - Toast quality pass

The codebase already does honest toasts well ("Will reflect everywhere within ~5 minutes"). One terminology leak ("cron drain", D.3) is the only real issue. **Time:** rolled into D.3.

### D.7 - Micro-interactions

- Page transitions: subtle 200ms fade on route change (Next.js App Router supports this via layout-level config).
- Success animations: brief CheckCircle scale-in on save flash.
- Hover affordances on KPI tiles (subtle elevation + cursor).

**Time:** 2 days.

### D.8 - Empty state visual pass

Replace any plain-paragraph empty state with the EmptyState component for visual consistency (mostly done; one outlier flagged in UX_POLISH for the installments page that was just touched in Step 1).

**Time:** 1 day.

### Phase D summary

- **Time:** ~10 days engineering.
- **Dependencies:** Phase C complete (so we're polishing the right CTAs, not the old ones).
- **Primary user benefit:** The platform feels mature. Mobile users (Misba on warehouse visits) get correct rendering. Toasts read like product, not infrastructure. Density-induced cognitive load drops.
- **Deliverables:**
 - MOU detail action bar redesigned.
 - Mobile table pass complete.
 - Copy pass shipped.
 - Contrast bug fixed.
 - Subtle visual polish across the board.

---

## Phase E - Power user + discovery

**Goal:** First-session users orient quickly. Daily users move faster than they did pre-platform. The system has an in-house feel.

### E.1 - Command palette (Cmd+K)

- **Spec:** floating overlay triggered by Cmd+K (Linear pattern). Indexes routes (TopNav stages + sub-routes), recent items (MOUs, schools, dispatches), and common actions ("Generate PI", "Mark paid").
- **Implementation:** `react-hotkeys-hook` (or native KeyboardEvent), shadcn Command primitive, fuzzy search via Fuse.js.
- **Scope:** ~120 routes + ~50 common actions + recent items from localStorage.
- **Time:** 4 days.

### E.2 - Global search

- **Spec:** dedicated `/search?q=` page with cross-entity results (MOUs, schools, dispatches, escalations).
- **Implementation:** server-rendered search across canonical JSON; debounced query input; result cards with entity-type badges.
- **Time:** 3 days.

### E.3 - Keyboard shortcuts

- **Spec:** documented shortcuts for common actions (J/K row navigation on list pages, E to edit, M to mark paid, etc.).
- **Help:** `/help#shortcuts` index entry.
- **Time:** 2 days.

### E.4 - Contextual help (tooltip + sidebar)

- **Spec:** every page has a "?" icon in the header (Phase C C.5). Clicking opens a right-side panel with the relevant `/help` excerpt inline, no navigation away.
- **Implementation:** sheet component + help-content JSON keyed by anchor.
- **Time:** 3 days.

### E.5 - Onboarding spotlight tour (first-time users)

- **Spec:** 5-step spotlight tour on first login (highlight TopNav stages, the bell, the help link, the dashboard tile, the MOU detail action bar).
- **Implementation:** localStorage flag to fire once; shepherd.js-style overlay or custom.
- **Time:** 3 days.

### E.6 - Recent items + favourites

- **Spec:** small "Recent" panel on `/` showing last 5 MOUs / schools / dispatches the user touched. "Pin" affordance on MOU detail and school detail to add to a Favourites surface.
- **Implementation:** localStorage; small audit-log replay to populate "recent" on first session.
- **Time:** 2 days.

### Phase E summary

- **Time:** ~17 days engineering.
- **Dependencies:** Phase C + D complete (so the things being indexed and tour-spotlighted are stable).
- **Primary user benefit:** New testers orient in minutes, not days. Returning users hit Pranav-tier productivity (69 PIs becomes 69 keystrokes, not 69 mouse-clicks).
- **Deliverables:**
 - Cmd+K palette.
 - Global search.
 - Keyboard shortcuts.
 - Contextual help drawer.
 - Onboarding tour.
 - Recent items + favourites.

---

## Recommended phase sequence

Phase B is **not blocked** by Phase C/D/E and should run first to clear the cutover ambiguity. Phases C and D should run **before** Phase E because:

- Polishing the wrong surface (D before C) wastes time.
- Adding a command palette before the routes / actions are correctly named (E before C) means re-indexing.

**Order:**

1. **Phase B** (1 week wall-clock; Pranav coordination is the long pole). Engineering ~4 days for deferrals in parallel.
2. **Phase C** (~8 engineering days). Discoverability and IA.
3. **Phase D** (~10 engineering days). Copy and visual polish.
4. **Phase E** (~17 engineering days). Power user.

**Total engineering effort:** ~39 engineering days across Phases B-E (~8 weeks for one engineer; ~4 weeks for two).

---

## Critical "fix immediately" items found

These shouldn't wait for Phase C. Each is a 1-line or 1-component change that fixes a real user-facing bug or risk:

1. **Finance Match button contrast bug** (Phase D.4). White text on teal violates DESIGN.md. 1-line fix.
2. **"cron drain" copy on dispatch kits** (Phase D.3). Internal jargon leaking to tester-facing UI. 1-line fix.
3. **Installments page title `{'·'}` rendering nit** (Phase D.3). Visible quirk. 1-line fix.

Suggest bundling these three as a small "polish-now" commit between Step 1 and Phase B. Total time: 1 hour including verification.

**This is the only "fix immediately" list. No data-corruption or security issues surfaced in the audit.**

---

## Deliverables checklist

- [x] VALUE_CHAIN_AUDIT.md
- [x] DISCOVERABILITY_AUDIT.md
- [x] PARALLEL_BUILD_INVENTORY.md
- [x] MOU_SYSTEM_PARITY_AUDIT.md
- [x] UX_POLISH_AUDIT.md
- [x] MATURITY_PASS_PLAN.md (this file)
- [x] Step 1 installment CTA fix shipped

---

**Document generated:** 2026-05-18
**Next action:** Anish reviews Phase A audits and approves Phase B sequence + scope.
