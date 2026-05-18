# DISCOVERABILITY_AUDIT.md
Gate 5A.9 Phase A - Step 3: Discoverability + IA audit

## Scoring rubric

For each primary feature surface, four scores 1-5:

| Score | Discoverability | Empty state | CTA hierarchy | Jargon |
|---|---|---|---|---|
| **5** | Obvious from any persona's first session | Teaches + primary CTA | Obvious primary action + secondary actions | Plain English, no domain knowledge required |
| **4** | One click from TopNav or dashboard | Clear copy + next step | Clear primary, secondary present | Mostly plain, rare jargon |
| **3** | Two clicks from TopNav, predictable | Informational, no CTA | Primary present, no hierarchy | Occasional domain term |
| **2** | Buried under admin / nested route | Dead-end "no data" | No clear next action | Frequent jargon |
| **1** | URL-only (not linked from any nav / CTA) | Confusing or missing | No CTA at all | Expert-only language |

**Phase C trigger:** any score of **1 or 2** is flagged for fix in Phase C.

---

## TopNav surfaces (6 stages)

The canonical nav from `src/components/ops/TopNav.tsx`:

1. `/mous` - MOUs
2. `/dispatch/kits` - Dispatch
3. `/dashboard/finance` - Finance
4. `/dashboard/ops` - Operations
5. `/reports` - Reports
6. `/admin` - Admin

Help link sits in the top-right (`/help`). Notification bell, queue freshness indicator, and logout sit alongside.

---

## Primary surface scores

### Landing + navigation

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Landing | `/` | 5 | 4 | 4 | 5 | Five-zone orientation. KPI tiles render 0 gracefully. Quick actions zone could be more visually prominent. |
| Help index | `/help` | 4 | N/A | 4 | 4 | Reachable from top-right link. Well-structured (sections, glossary, workflows). Workflows now include Setting a payment schedule (Step 1 add). |
| TopNav | (component) | 5 | N/A | 5 | 5 | 6 workflow-stage tabs, dept dot indicators, active-path highlighting. |
| Login | `/login` | 5 | N/A | 5 | 5 | Single primary action. No friction. |

### MOU lifecycle

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| MOU list | `/mous` | 5 | 4 | 4 | 5 | TopNav primary. New MOU CTA on the list. |
| MOU detail | `/mous/[id]` | 5 | 5 | 3 | 4 | Excellent collapsible cards. Action bar now 9 buttons after Step 1; needs "More actions" demotion. |
| MOU draft / annexure | `/mous/[id]/draft` | 4 | 4 | 4 | 4 | Reachable from action bar. |
| MOU signed values | `/mous/[id]/signed-values` | 4 | 4 | 4 | 4 | Reachable from action bar. |
| MOU upload signed | `/mous/[id]/upload-signed` | 2 | 3 | 3 | 4 | Not directly linked from MOU detail action bar; users must know it exists. Flagged for Phase C. |
| Actuals confirmation | `/mous/[id]/actuals` | 4 | 4 | 5 | 4 | Action-bar primary "Actuals" button. |
| Intake form | `/mous/[id]/intake` | 4 | 5 | 5 | 4 | Reachable from MOU detail intake card + workflow banner CTA. |
| Instalments listing | `/mous/[id]/installments` | 5 | 5 | 5 | 4 | Step 1 fix: empty state now teaches + has primary CTA. Mobile table wrap still needs work (UX_POLISH). |
| **Schedule editor** | `/mous/[id]/installments/schedule-edit` | **2** (was 1) | 4 | 4 | 4 | Step 1 fix: now linked from MOU detail action bar (Set/Edit schedule) and from empty state. Pre-fix score was 1 (URL-only). Discoverability is 2 not 4 because the link is mid-action-bar; users still need to know the term "schedule". |
| Per-instalment edit | `/mous/[id]/installments/[paymentId]/edit` | 4 | 4 | 4 | 4 | Pencil icon in row; Finance only. |
| Mark paid / partial | `/mous/[id]/installments/[paymentId]/mark-paid` etc. | 4 | 4 | 5 | 4 | Inline action icons; Finance only. |
| Payment receipt | `/mous/[id]/payment-receipt` | 3 | 3 | 4 | 4 | Reachable from installments row actions; users may confuse with mark-paid. |
| Mark PI sent | `/mous/[id]/installments/[paymentId]/mark-pi-sent` | 4 | 4 | 5 | 4 | Send icon in row. |
| PI generator | `/mous/[id]/pi` | 4 | 5 | 4 | 4 | PI button in action bar (Finance-only). Lock banner during parallel-build is well-written. |
| Send template | `/mous/[id]/send-template/[templateId]` | 4 | 4 | 5 | 4 | Smart suggestions card + templates list. |
| Dispatch workspace | `/mous/[id]/dispatch` | 5 | 4 | 4 | 4 | Action-bar primary. |
| Kits details (workflow) | `/mous/[id]/kits-details` | 3 | 4 | 4 | 4 | Available but secondary navigation. |
| Feedback request | `/mous/[id]/feedback-request` | 4 | 4 | 5 | 4 | Action-bar primary. |
| Delivery ack | `/mous/[id]/delivery-ack` | 4 | 4 | 5 | 4 | Action-bar primary. |

### Dispatch lifecycle

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Dispatch kanban / list | `/dispatch/kits` | 5 | 4 | 4 | 4 | TopNav primary. |
| Dispatch detail | `/dispatch/kits/[mouId]` | 5 | 4 | 4 | 4 | Solid sectional flow. "cron drain" jargon should be replaced (UX_POLISH). |
| Dispatch request (Sales) | `/dispatch/request` | 4 | 4 | 4 | 4 | Sales surface; reachable from Sales rep dashboard. |
| Admin: dispatch requests | `/admin/dispatch-requests` | 4 | 4 | 4 | 4 | Ops queue. Reachable from `/admin`. |
| Admin: dispatch request detail | `/admin/dispatch-requests/[id]` | 4 | 4 | 4 | 4 | One click from list. |

### Finance

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Finance dashboard | `/dashboard/finance` | 5 | 4 | 4 | 4 | TopNav primary. KPI strip + 9 panels. White-on-teal button contrast bug (UX_POLISH). |
| Pending PIs | `/finance/pi/pending` | 4 | 5 | 4 | 4 | Reachable from finance dashboard. |
| PI detail | `/finance/pi/[paymentId]` | 4 | 4 | 4 | 4 | One click from pending list. |
| Payments list | `/finance/payments` | 4 | 4 | 4 | 4 | Finance subroute. |
| Unmatched payments | `/finance/payments/unmatched` | 4 | 5 | 4 | 4 | Dashboard card + subroute. |
| Bulk payment import | `/finance/payments/bulk` | 3 | 4 | 4 | 4 | Reachable from payments list; could use a primary CTA. |
| New payment log | `/finance/payments/new` | 3 | 4 | 4 | 4 | Reachable from list. |
| Adjustments list | `/finance/adjustments` | 4 | 4 | 4 | 4 | Finance subroute. |
| Adjustment new | `/finance/adjustments/new` | 4 | 4 | 4 | 4 | Primary CTA on list. |
| Tally export | `/finance/tally-export` | 4 | 4 | 4 | 4 | Finance subroute. |
| Receipts | `/finance/receipts` | 4 | 4 | 4 | 4 | Finance subroute. |
| Schools receipts | `/finance/schools-receipts` | 3 | 4 | 4 | 4 | Subroute; school-grouped view. |
| Renewals | `/finance/renewals` | 4 | 4 | 4 | 4 | Dashboard panel + subroute. |

### Operations

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Ops dashboard | `/dashboard/ops` | 5 | 4 | 4 | 4 | TopNav primary. |
| VEX overview | `/operations/vex` | 4 | 4 | 4 | 4 | Reachable from `/operations`. |
| New VEX PI | `/operations/vex/pi/new` | 3 | 4 | 4 | 4 | Sub-routed; Finance-only. Lock banner during parallel-build. |
| VEX PI detail | `/operations/vex/pi/[id]` | 4 | 4 | 4 | 4 | One click from VEX overview. |
| Vendors | `/operations/vendors` | 3 | 4 | 4 | 4 | Sub-routed. |
| Agreements | `/operations/agreements` | 3 | 4 | 4 | 4 | Sub-routed. |

### Schools

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Schools list | `/schools` | 4 | 4 | 4 | 4 | TopNav-adjacent. |
| School detail | `/schools/[id]` | 4 | 5 | 4 | 4 | One click from list + MOU detail. |
| School edit | `/schools/[id]/edit` | 4 | 4 | 4 | 4 | Pencil on detail. |

### Kanban

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| MOU lifecycle kanban | `/kanban` | 5 | 3 | 4 | 4 | Linked from `/` and `/mous`. Filter-empty state lacks "Clear filters" button (UX_POLISH). |
| Operations view | `/kanban?view=operations` | 4 | 3 | 4 | 4 | Toggle on the same route. |

### Reports

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Reports landing | `/reports` | 5 | 4 | 4 | 4 | TopNav primary. |
| FY summary | `/reports/fy-summary` | 4 | 4 | 4 | 4 | Reports list. |
| Sales performance | `/reports/sales-performance` | 4 | 4 | 4 | 4 | Reports list. |
| Dispatch performance | `/reports/dispatch-performance` | 4 | 4 | 4 | 4 | Reports list. |
| Payment aging | `/reports/payment-aging` | 4 | 4 | 4 | 4 | Reports list. Hyperlink-to-MOU drill-through missing (D-049). |
| Escalations report | `/reports/escalations` | 4 | 4 | 4 | 4 | Reports list. |

### Escalations

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Escalations list | `/escalations` | 4 | 4 | 4 | 4 | Reachable from dashboards. Lane filter. |
| Escalation detail | `/escalations/[id]` | 4 | 4 | 4 | 4 | One click. |
| Escalation edit | `/escalations/[id]/edit` | 4 | 4 | 4 | 4 | Pencil on detail. |

### Admin

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Admin landing | `/admin` | 5 | 4 | 4 | 4 | TopNav primary. Tile grid. |
| Audit log | `/admin/audit` | 4 | 4 | 4 | 3 | Reachable from admin. Filter UX has audit-specific jargon. |
| Sync queue status | `/admin/queue-status` | 4 | 5 | 4 | 4 | Linked from admin. Sync_health badge surface. |
| Data snapshot | `/admin/data-snapshot` | 4 | 4 | 4 | 4 | Admin tile. |
| Imports landing | `/admin/imports` | 4 | 4 | 4 | 4 | Admin tile (Gate 5A.8 add). |
| Pranav refresh | `/admin/imports/pranav-refresh` | 4 | 4 | 4 | 3 | Admin-only; subtitle dense for non-Admin users (UX_POLISH). |
| MOU status (cohort) | `/admin/mou-status` | 4 | 4 | 4 | 4 | Admin tile. |
| MOU import review | `/admin/mou-import-review` | 4 | 4 | 4 | 4 | Admin tile. |
| Inventory | `/admin/inventory` | 4 | 4 | 4 | 4 | Admin tile. Ops-only EDIT gate. |
| Sales team | `/admin/sales-team` | 4 | 4 | 4 | 4 | Admin tile. |
| Sales-team reassign | `/admin/sales-team/reassign` | 3 | 4 | 4 | 4 | Sub-routed. |
| School groups | `/admin/school-groups` | 4 | 4 | 4 | 4 | Admin tile. |
| SPOCs | `/admin/spocs` | 4 | 4 | 4 | 4 | Admin tile. |
| Schools (admin) | `/admin/schools` | 4 | 4 | 4 | 4 | Admin tile. |
| Templates | `/admin/templates` | 4 | 4 | 4 | 3 | docxtemplater syntax in form (UX_POLISH D-007 candidate). |
| CC rules | `/admin/cc-rules` | 4 | 4 | 4 | 3 | Cross-check rules terminology is internal. |
| Lifecycle rules | `/admin/lifecycle-rules` | 4 | 4 | 4 | 3 | Same as CC rules. |
| Stage responsibility | `/admin/stage-responsibility` | 4 | 4 | 4 | 4 | Admin tile. |
| Reminders | `/admin/reminders` | 4 | 4 | 4 | 4 | Admin tile. |
| PI counter | `/admin/pi-counter` | 3 | 4 | 4 | 3 | Admin-only counter-management surface. |
| Chain MOU reconciliation | `/admin/chain-mou-reconciliation` | 2 | 4 | 4 | 2 | Niche admin tile; users unlikely to know what "chain MOU reconciliation" means without docs. |
| User management | (no `/admin/users` surface) | 1 | N/A | N/A | N/A | **Phase C trigger:** documented in CLAUDE.md as Phase 1.1 deferral; today user edits require JSON surgery. |

### Notifications + portal

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Notification list | `/notifications` | 4 | 4 | 4 | 4 | Bell in top-right of TopNav. |
| Portal (SPOC magic links) | `/portal/[token]` | 5 | 4 | 4 | 5 | External user surface; tokenised. |

### Sales (hidden behind nav)

| Surface | Route | Discoverability | Empty state | CTA hierarchy | Jargon | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| Sales pipeline | `/sales-pipeline` | **2** | 4 | 4 | 4 | Gate 3.5 Step 3 deliberately hidden from TopNav. Reachable by URL or admin. **Flagged in docs/gate-3.5/HIDDEN_ROUTES.md as intentional during pilot. Not a Phase C fix.** |

---

## Summary: surfaces by discoverability score

| Score | Count | Notes |
|---|---|---|
| 5 (obvious) | 11 | Landing, TopNav, all 6 nav primaries, login, MOU list, MOU detail, dispatch kanban, dispatch detail, ops dashboard |
| 4 (one click) | 45 | Most nested surfaces; reachable via dashboard or detail pages |
| 3 (two clicks, predictable) | 11 | Acceptable for low-frequency surfaces |
| 2 (buried) | 4 | Schedule editor (fixed in Step 1 → was 1), upload-signed, chain MOU reconciliation, sales pipeline (intentional) |
| 1 (URL-only) | 1 | User management (deferred per CLAUDE.md; tracked) |

---

## Phase C trigger list

Surfaces with discoverability ≤2 OR empty state ≤2 OR CTA hierarchy ≤2 OR jargon ≤2:

| Surface | Issue | Fix |
|---|---|---|
| `/mous/[id]/upload-signed` | Discoverability 2 (not linked from detail action bar) | Add "Upload signed MOU" CTA to action bar when status is Pending Signature |
| `/admin/chain-mou-reconciliation` | Discoverability + jargon 2 | Rename to plain English ("School-group MOU links"), add help tooltip |
| User management (no surface) | Discoverability 1 | Build `/admin/users` per CLAUDE.md Phase 1.1 backlog |
| `/admin/audit` | Jargon 3 (borderline) | Add filter labels with tooltips explaining "entity type", "before/after", etc. |
| `/admin/templates` | Jargon 3 (docxtemplater syntax) | D-007 candidate: WYSIWYG template editor |
| `/admin/cc-rules` and `/admin/lifecycle-rules` | Jargon 3 | Add help link + tooltip explaining the rule taxonomy |
| `/admin/pi-counter` | Discoverability + jargon 3 | Add a glossary entry in `/help` explaining when this surface is used (cutover-day only) |
| `/admin/imports/pranav-refresh` | Jargon 3 (audience-internal naming) | Rename to "MOU Excel refresh" or "Bulk MOU import" |

---

## Empty-state quality summary

Most surfaces score 4-5 on empty state. The exceptions:

- `/kanban` (filtered to zero): score 3. Has copy but no inline "Clear filters" button. **UX_POLISH fix.**
- `/mous/[id]/payment-receipt`: score 3. Likely OK for Finance users but no teaching for first-timers.
- `/mous/[id]/kits-details`: score 3. Similar.

The Step 1 fix moved `/mous/[id]/installments` from a 3 to a 5 by adding the CTA.

---

## CTA hierarchy summary

Most surfaces have clear primary CTAs. The MOU detail action bar (score 3) is the one acknowledged density issue: 9 buttons after Step 1, no visual hierarchy among them. UX_POLISH recommends promoting 4 (Actuals, Instalments, PI, Dispatch) and demoting the rest to "More actions ▾".

---

## Jargon summary

Plain-English score 5 is rare (specific to landing, TopNav, login, portal). Most operational surfaces are 4 (occasional domain term - "instalment", "dispatch", "SKU"). Admin surfaces with 3 carry internal jargon ("cc rules", "lifecycle rules", "chain MOU reconciliation", "pi counter") - none break a tester's workflow but they raise the orientation curve for new users.

**The Phase C copy pass** should target the admin tile labels and the help glossary cross-references.

---

## Cross-cutting IA gaps

1. **No breadcrumbs on most pages.** PageHeader supports them; not every page passes the breadcrumb prop. **Phase C trigger:** establish a uniform breadcrumb spec.
2. **No "recent items" surface.** A returning user has no quick-list of last-viewed MOUs. **Phase E candidate.**
3. **No favourites / pinned MOUs.** Pranav with 69 pending PIs would benefit from pinning his top 5. **Phase E candidate.**
4. **No global search.** Search is per-page (`/mous` search, `/schools` search). A Cmd+K global search would let a user type "Greenfield" from any page and jump. **Phase E candidate (D-???: command palette).**
5. **No tooltip / contextual help.** The /help index is one click away but doesn't have per-page contextual entry. **Phase E candidate.**

---

**Document generated:** 2026-05-18
