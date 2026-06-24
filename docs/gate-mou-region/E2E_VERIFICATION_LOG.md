# gate-mou-region: salesperson field with auto-derived region

_Date: 2026-06-24. Additive slice (no programme type-widening)._

## What changed
- **Migration 015** (applied + verified in prod): additive nullable `mous.region`
  column. Non-destructive (existing rows -> NULL; no data rewrite); reversible via
  `015-mou-region.down.sql`.
- **Region is DERIVED from the salesperson** (`regionForSalesPerson` in
  `src/lib/regions.ts`: the rep's `territories`, single used as-is / multiple
  joined). **Never free-typed.** A rep with no territory -> surfaced, not saved
  blank (Add MOU blocks the save; edit flags a warning).
- **Add MOU** (`/mous/upload`): salesperson `<select>` from active `sales_team`;
  derived region shown live; `salesPersonId` + `region` stored + in the audit
  snapshot; route **fails loud** (`salesperson-no-region`) on a no-territory rep.
- **MOU edit** (`/api/mou/[mouId]/edit` + page): salesperson editable (Sales +
  Admin); region re-derives on save (also backfills existing MOUs); no-territory
  rep -> warning, region not overwritten blank.
- `mouRepo` carries `region` (row map, create, update, updatePartial). `MOU.region`
  is optional so existing MOU constructors are untouched (surgical).

## Verification (V4, live prod, logged in as anish.d) - all PASS
Throwaway MOU created + edited via the live API, asserted against Postgres, then deleted:
- **Create** with rep "Arjun K." (territories Lucknow/Indore/Coimbatore) -> MOU
  saved; `region = "Lucknow, Indore, Coimbatore"`; `sales_person_id` stored.
- **Edit** salesperson to "Neha A." (New Delhi/Chandigarh/Jaipur) -> 303 saved;
  `region` updated to "New Delhi, Chandigarh, Jaipur".
- **No-region guard**: rep "Anshuman" (no territory) -> create returns
  `{ok:false, error:'salesperson-no-region'}` (not saved blank).
- Cleanup: throwaway MOU + payments + auto-created school deleted.
- `regionForSalesPerson` unit tests (4) green; create-from-upload route tests (14)
  green; `npm run build` green.

## Notes
- Region is a free-text snapshot of the rep's territories at write time (reports
  can read it without re-joining). It is not a constrained enum.
- This slice did NOT touch the `programme` type-widening, the re-classification
  prod write, or Phase 3 - all remain gated.
