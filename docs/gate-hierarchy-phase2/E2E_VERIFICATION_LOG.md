# gate-hierarchy-phase2: hierarchy step 1 + programme-widening (step 2)

_Date: 2026-06-24. Two-level product hierarchy + Phase 2 programme-widening.
Phase 2 steps 3-6 (MOU-entry picker, grade pricing, %-instalments, reports
roll-up, V4 of a real save) are NOT in this log - they are the next focused pass._

## Hierarchy step 1 - migration 017 (applied + verified, backup-first, reversible)
- Backed up `mous` (196) + `products` before applying.
- Added self-FK `products.parent_id` (two-level: category / sub-product, enforced
  app-side). Seeded the confirmed Bootcamp grouping + option (b):
  - **Bootcamps** = category; children **AIQ**, **Bootcamps - Harvard**, and a new
    **Bootcamps (general)** leaf.
  - The 3 existing Bootcamps MOUs (GNIMS, Guru Nanak, B.K. Birla Kalyan) moved
    STEAM -> "Bootcamps (general)" (audited) so the category is a pure grouper.
  - STEM - Robotics / YP / Lab Setup Project stay top-level.
- Verified: tree correct, two-level only (no grandchildren), **every MOU resolves**
  (STEAM 156 -> STEM-Robotics, Young Pioneers 37 -> YP, Bootcamps (general) 3 ->
  itself; 196 MOUs, 0 orphans).
- `Product.parentId` carried by type + repo + seed.

## Phase 2 step 2 - programme widened to free-text, consumers route to the registry
- `MOU.programme` + `Payment.programme`: `Programme` enum -> `string`. The products
  registry is the source of truth; existing values resolve via `resolveProduct`.
- `create-from-upload`: validates programme against the registry (`productRepo` +
  `resolveProduct`) instead of the 4 hardcoded values; `mouCodeForProgramme`
  derives the MOU-id cohort code for ANY product (legacy STEAM/YP/HBPE/ROBO
  preserved so existing id sequences continue; new products derive a code, never
  "undefined"). This closes the latent PI/id edge for the 3 moved Bootcamps MOUs.
- `computeProgrammeBreakdown` iterates the distinct programmes present (new
  products surface), sorted by count then name. ~14 consumers widened to
  string-tolerant (dashboards, leadership palette w/ fallback, MouCard accent,
  receipts, kanban, report maps) - type-only, no logic change.
  `dispatchPerformance`/`fySummary` still report the 4 canonical rows (the
  category roll-up is step 3-4).

## Verification (V4, live prod, logged in as anish.d) - all PASS
- `/dashboard/finance` 200; programme breakdown now shows **"Bootcamps (general)"**
  (the reroute + the 3 moved MOUs surface) - this is also the deploy marker.
- Create via `/api/mou/create-from-upload` under **AIQ** (a registry product not in
  the old 4) -> ok; MOU id **MOU-AIQ-2627-001** (derived cohort code); programme
  stored. Throwaway MOU + payments + school cleaned up.
- Unknown programme ("Nonsense Product") -> **rejected** (`invalid-programme`,
  registry validation).
- `npm run build` + 134 unit tests green.

## Prod state after this pass
Coherent: schema (parent_id + the 7-product tree) and code (registry-backed
programme) are aligned; no orphans; no latent PI/id edge. The MOU-entry form still
offers the legacy 4-programme select (the category->sub-product picker is step 3),
but the create ROUTE already accepts + validates any registry product.

## Remaining (Phase 2 steps 3-6, next focused pass)
3. Registry parent-CRUD (set parent in /admin/products) + MOU-entry
   category->sub-product picker (pick category, then leaf) + reports roll-up
   (category total with sub-product breakdown).
4. Grade-variant pricing: multiple (students, price) rows, total = sum
   (gradewise_distribution).
5. %-instalments: month/date + percentage, % fixed, amounts recalc on
   student-count change (payments.percent_share/nominal_amount); ONE schedule per
   MOU + flagged seam for per-group (do not build per-group).
6. Build-gate, push, V4 E2E walk of a real MOU save under the full new model.
