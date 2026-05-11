# IMPORT_RESULTS.md: Gate 4.5

Captures the outcome of the first end-to-end Excel import against the Pranav + Misba reference files. Live `_meta.json` lives at `src/data/_imports/fy2627/_meta.json` and updates on every re-run; this document is the human-readable snapshot for the Pranav + Misba reconciliation email.

Run date: 2026-05-11.
Files imported:
- `phase-pranav-misba-imports/Pratik_-_School_Invoicing_Summary_2026-27.xlsx`
- `phase-pranav-misba-imports/Kit_Delivery_2026.xlsx`

Re-run command: `npm run import:fy2627` (idempotent).

---

## Counts (inserted / updated / unchanged)

| Entity | Inserted | Updated | Unchanged |
|---|---|---|---|
| MOUs | 59 | 12 | 0 |
| Schools | 99 | 22 | 22 |
| SalesTeam | 2 | 0 | 59 |
| Payments | 128 | 29 | 0 |
| KitDispatches | 71 | 1 | 0 |
| InventoryItems | 32 | 0 | 200 |

**Totals (cross-check vs spec):**
- 65 STEAM + 9 YP = 74 MOUs expected. **71 imported (59 + 12)**. Delta of 3 = the 3 loud-fail records skipped (see Errors below).
- 24 TW + 38 Cretile + 10 Hardware = 72 dispatches expected. **72 imported (71 + 1)**.
- ~18 TW SKUs + 10 Cretile grades + ~5 Hardware SKUs = ~33 expected new inventory items. **32 inserted** (1 SKU column was empty across all rows).

---

## Errors (loud-fail, MOU not imported)

3 rows where sale amount is missing or unparseable. These need Pranav input before re-running:

| Sheet | Row | School | Reason |
|---|---|---|---|
| STEAM 2026-27PD | 33 | Empyrean School | sale amount missing or unparseable |
| STEAM 2026-27PD | 34 | Empyrean School | sale amount missing or unparseable |
| STEAM 2026-27PD | 41 | Doon Scholars School | sale amount missing or unparseable |

**Action**: Pranav to either fill the missing sale amount or confirm the rows should stay out of the platform. The School records are still created (so the dispatches can still link).

---

## Warnings (data quality flags, MOU imported anyway)

5 warnings. Each is recoverable but Pranav may want to clean the source data:

| Sheet | Row | School | Warning |
|---|---|---|---|
| STEAM | 5 | Mutahhary Public School Baroo | installment % sum 0.900 != 1.0 |
| STEAM | 21 | Holy Child English Academy, Malda | installment % sum 0.750 != 1.0 |
| STEAM | 54 | (no name) | trainer model out of enum: AIQ |
| STEAM | 57 | Berhampore City Public School | installment % sum 0.750 != 1.0 |
| STEAM | 64 | St. Johns High School | installment % sum 0.750 != 1.0 |

The installment-sum warnings reflect MOUs with only 3 of 4 installments configured (the 4th column is blank); the platform represents these correctly. The "AIQ" trainer model is a brand-new value not in our existing `TT | TTT | Bootcamp` enum; the row imported with `trainerModel=null` and the raw value preserved in `importNotes.trainerModelRaw=AIQ`.

---

## Auto-created sales reps (2)

Only 2 names from Pranav's STEAM sheet were not already in `sales_team.json`:

- `sp-brij-singh` (Brij Singh)
- `sp-balu-r` (Balu R)

All other rep names (Roveena, Balachandra, Sahil, Ranotosh, Prodipto, Anshuman, Hirak, etc.) matched existing records. **Anish to enrich** the 2 new records with email, phone, and territory via `/admin/sales-team`.

---

## Auto-created schools (99)

99 unique schools were created across the two imports. The full list lives in `_meta.json.autoCreatedSchools` keyed by id. **High count**: most schools in Pranav's + Misba's data are new to the platform. Spot-check checks for dedup issues:

- `Techno India Group Public School Kalyani / Asansol / Panagarh` - three distinct chain branches, each its own School. Anish to decide whether they should join an existing SchoolGroup.
- No fuzzy dedup was applied; identical slugs would have merged (idempotent). Near-identical but non-identical names will produce separate records and need manual reconciliation.

---

## Cross-Excel mismatches (97)

97 KitDispatches from Misba's sheets have no matching MOU in Pranav's import. Categories:

1. **Schools in Misba's data not in Pranav's**: typical pattern is a long-tail school that received kits but doesn't have a signed MOU on Pranav's FY26-27 sheet (e.g., previous-year MOU rolled over).
2. **School-name spelling differences**: e.g., "The Learning Sactuary" (typo: missing "n" -> Sanctuary) doesn't match Pranav's record if the name is spelled differently.
3. **Trailing whitespace differences**: a few schools have trailing-space variations between the two files.

These dispatches still imported as `KitDispatch` records with `mouId='UNMAPPED'`; the orphan ids start with `DISPATCH-ORPHAN-`. **Anish to review** before cutover (Gate 5); the typical resolution is either to re-key the Misba row to an existing MOU or to confirm the school+MOU should be created post-cutover.

First 3 mismatches as an example:

| Sheet | Row | School | DC |
|---|---|---|---|
| misba.tw | 4 | The Learning Sactuary | DC-0227 |
| misba.tw | 5 | Aarohi Bharti | DC-0229 |
| misba.tw | 6 | Loreto Day School, Bow Bazar-Kolkata | DC-0231 |

---

## Chain MOU candidates

0 candidates detected (no school name appeared in both STEAM and YP sheets). Pranav's chain schools (Techno India branches, etc.) are all on a single sheet so the dedup-by-slug logic already handled them as separate records.

---

## Files written

All under `src/data/_imports/fy2627/` (staging; **not promoted to production**):

- `_meta.json` (full run metadata)
- `sales_team.json` (61 entries: 59 pre-existing + 2 new)
- `schools.json` (143 entries: 22 pre-existing + 99 + 22 (later updated))
- `school_groups.json` (empty)
- `mous.json` (71 records)
- `payments.json` (157 records: 4 per MOU max from STEAM, 1 per MOU from YP)
- `installments.json` (mirror of payments.json; the import emits both for cutover consumers)
- `kit_dispatches.json` (72 records)
- `inventory_items.json` (~232 entries: 200 pre-existing + 32 new)

---

## Cutover decision matrix (Gate 5 prereqs)

Before promoting these JSONs to top-level `src/data/`:

1. Pranav addresses the 3 loud-fail rows (Empyrean x2, Doon Scholars).
2. Anish reviews the 99 auto-created schools, especially the 97 cross-Excel mismatches.
3. Pranav confirms the 5 warning rows (4 installment-sum + 1 trainer model "AIQ").
4. Misba confirms the orphan dispatches are correctly classified as "no MOU exists" vs "MOU exists but name typo".
5. Anish decides chain-grouping for Techno India Group + similar.

Once 1-5 are addressed, run `npm run import:fy2627` one more time, verify the meta no longer flags blocking errors, and Gate 5 cutover can promote.
