# gate-phase13-overview (Phase 1.3): product-card landing

_Date: 2026-06-24._

## What changed
- `/work` rebuilt from a department role-router into a **product-first Overview**.
  One card per product (the four live programmes: STEAM, Young Pioneers, Harvard
  HBPE, Robotics) with live health aggregated from MOUs at request time
  (`force-dynamic`): **#MOUs, #students, total contract value, outstanding**.
- Each card links to that product's filtered MOU list (`/mous?programme=X`) and an
  **Add MOU** action (`/mous/upload`).
- Role-scoped daily boards still live at `/work/{finance,ops,admin}` (reachable via
  the "My ... work" nav). Login still lands on the role board (`/work/admin` etc.);
  this index no longer redirects. **No schema change** (reads existing MOU fields).

## Verification (V4, live prod, logged in as anish.d) - all PASS
- `/work` HTTP 200 (was a 307 redirect); renders the **Overview** with all four
  product cards present.
- Stats render (Outstanding, Students, plus MOUs and Total value).
- "View MOUs" (`/mous?programme=...`) and "Add MOU" (`/mous/upload`) links present.
- Not bounced to login. Screenshot in `.verification/phase13/` (gitignored).
- `npm run build` green. Login route test (redirects to `/work/admin`) unaffected.

## Notes
- Product set is the four live programmes for now; **Phase 1.4 replaces it with the
  admin-managed registry** seeded from the finance taxonomy in the source file.
- Health is computed across ALL years (total). FY-scoped product health can be
  layered later if wanted.

## Phases 1.4 + 2: BLOCKED (reported to owner, not built this batch)
- **Source-of-truth file** `Anish_Data_-_23_06_26.xlsx` ("Summary 26-27") not yet
  provided. The 1.4 registry seed must come from it, and the app->finance
  name-mapping table must be approved before committing the seed (owner gate).
- **Production DDL** required for 1.4/2: a `products` registry table and relaxing
  the `mous.programme` CHECK (currently fixed to the four programmes) so admins can
  add products and MOUs can reference them. Prod DDL needs explicit authorisation.
- Phase 2 schema otherwise fits existing columns: grade-variant pricing can reuse
  `mous.gradewise_distribution` (JSONB); %-instalments reuse `payments.percent_share`
  / `nominal_amount`. Salesperson->region derives from `sales_team`.
