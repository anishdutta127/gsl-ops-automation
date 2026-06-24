# gate-phase14-products (Phase 1.4): admin-managed product registry

_Date: 2026-06-24._

## Migration 014 (prod) - applied + verified before building
- Backed up `mous` (188 rows: STEAM 159, Young Pioneers 29) to a gitignored dump
  and confirmed it exists, BEFORE applying.
- Applied `scripts/migrations/014-products-registry.sql`: created `products`,
  seeded the 6 finance-taxonomy products, dropped `mous_programme_check`.
- Post-apply verification (VERIFY PASS): 6 products seeded; `mous.programme`
  unchanged (STEAM 159, Young Pioneers 29); **0 MOUs fail to resolve** to a
  product; CHECK dropped. Reversible via `014-products-registry.down.sql`.

## Registry seed (from "Summary 26-27"), with the approved app->finance mapping
| Product | legacy_programmes (existing app MOUs) |
|---|---|
| STEM - Robotics | STEAM, Robotics |
| YP | Young Pioneers |
| AIQ | (finance-only, no app MOUs) |
| Bootcamps | (finance-only) |
| Bootcamps - Harvard | Harvard HBPE |
| Lab Setup Project | (finance-only) |

## Build
- `Product` type + `productRepo` (postgres + json), wired into `dispatchToRepo` +
  `entityRegistry`; `src/data/products.json` + fixture seed.
- `resolveProduct()` (programme matches a product `name` or a `legacyProgramme`):
  the app-level validation that replaces the dropped CHECK. 4 unit tests green.
- `/admin/products` CRUD: add / rename / retire, admin-gated (`canManageUsers`),
  every mutation audited on the product's `auditLog`, `revalidatePath` on write.
  Admin sub-nav gains Products + Advanced.

## Verification (V4, live prod, logged in as anish.d) - all PASS
- `/admin/products` HTTP 200; lists all 6 seeded products.
- Create a throwaway product -> lands in Postgres (active) + redirect ok=created.
- Rename -> persists in Postgres.
- Retire -> `active=false` in Postgres.
- Audit trail recorded (>=3 entries: create, rename, retire).
- Throwaway product deleted (cleanup). `npm run build` green; resolveProduct tests pass.

## Notes
- New products created by admins start with empty `legacyProgrammes` (legacy
  mapping is a one-time migration concern). MOUs created under a new product
  (Phase 2) will store that product's `name` in `mous.programme`.
- AIQ / Bootcamps / Lab Setup Project have no app MOUs yet (flagged for the
  reconciliation).
