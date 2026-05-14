# PRANAV_IMPORT_AUDIT.md, Gate 5A.8 Step 1

Audit of the existing Pranav-import code path before building the refresh importer for `import-data/2026-05-pranav-refresh/pranav-refresh-2026-05-13.xlsx`.

Audit date: 2026-05-14.

---

## 1. Existing import surface

There are TWO Pranav-adjacent pipelines in the repo, and they do different things:

### 1a. `scripts/import-fy2627.mjs` (Gate 4.5, run 2026-05-11)

- Reads `phase-pranav-misba-imports/Pratik_-_School_Invoicing_Summary_2026-27.xlsx` (Pranav's STEAM + YP sheets) and `phase-pranav-misba-imports/Kit_Delivery_2026.xlsx` (Misba's TW + Cretile + Hardware sheets).
- Writes to `src/data/_imports/fy2627/<entity>.json`, staging only, NEVER promoted to top-level `src/data/`.
- Helpers live as typed copies at `src/lib/imports/fy2627Helpers.ts` with a vitest suite (`fy2627Helpers.test.ts`); the .mjs keeps a verbatim JS copy.
- Idempotent: every entity is a by-id upsert, counters distinguish `inserted` / `updated` / `unchanged`.
- Outputs (per `docs/gate-4.5/IMPORT_RESULTS.md`): 71 MOUs, 99 schools, 2 sales reps, 128 + 29 payments, 72 dispatches, 32 inventory items. 3 loud-fail rows + 5 warnings.
- ID format: `MOU-STEAM-2026-<slug>` (e.g., `MOU-STEAM-2026-empyrean-sch`). Slug-derived, not sequential.
- Run command: `npm run import:fy2627` (also accepts `--dry-run`, `--pranav-only`, `--strict`).

### 1b. `scripts/cutover-snapshot.mjs` (Gate 2 Step 4)

- Reads the canonical entity JSONs from `gsl-mou-system/src/data/` (the parallel-build legacy system) and writes a verbatim snapshot to `src/data/_snapshots/mou-system/`.
- This snapshot is the source of the 51 FY26-27 `MOU-STEAM-2627-NNN` MOUs and 25 `MOU-YP-2526-NNN` records currently in the LIVE `src/data/mous.json`.
- Discipline: idempotent, verbatim, preserves auditLog, programme reconciliation guard, 1:1 SchoolGroup backfill.

**Critical consequence:** the live system (`src/data/*.json`) is populated by the gsl-mou-system snapshot, NOT by the Gate 4.5 staging import. The Gate 4.5 work is unfinished cutover; it sits in `src/data/_imports/fy2627/` waiting for Pranav + Misba reconciliation.

| Source | Where it lives | Authoritative for production? |
|---|---|---|
| `import-fy2627.mjs` | `src/data/_imports/fy2627/` | No, never promoted |
| `cutover-snapshot.mjs` | `src/data/_snapshots/mou-system/` then merged to `src/data/*.json` | Yes |

So the refresh importer must diff against `src/data/*.json` (the actual live state), not against the staging directory.

---

## 2. Entities touched

Both importers touch the same entity surface. Refresh importer scope:

| Entity | File | Touched by Gate 4.5 import | Schema notes |
|---|---|---|---|
| MOU | `src/data/mous.json` | yes (writes to staging) | 143 records live; FY26-27 schools have IDs `MOU-STEAM-2627-001..051` and `MOU-YP-2526-NNN` |
| School | `src/data/schools.json` | yes | dedup by slugified name |
| Payment | `src/data/payments.json` | yes (acts as the Installment table) | 197 records live; id format `${mouId}-i${seq}` |
| SalesTeam | `src/data/sales_team.json` | yes | dedup by slugified name |
| KitDispatch | `src/data/kit_dispatches.json` | yes (Misba file) | not in scope for the refresh (Pranav-only) |
| InventoryItem | `src/data/inventory_items.json` | yes (Misba file) | not in scope for the refresh |
| SchoolGroup | `src/data/school_groups.json` | placeholder only | chain MOUs auto-create 1:1; multi-product schools (Swarnim TT vs AIQ) flagged for review |

**The refresh file is Pranav-only.** Sheets in `pranav-refresh-2026-05-13.xlsx`:

| Sheet | Purpose | In Phase 1 scope? |
|---|---|---|
| `2026-27PD ` | FY26-27 STEAM data with installments | Yes |
| `Billing details _PD` | FY25-26 historical billing | No (BACKLOG: Phase 1.1 Sheet 2 ingestion) |
| `2025-26_Proforma Invoice_PD` | FY25-26 PI tracking | No (BACKLOG: Phase 1.1 Sheet 3 ingestion) |
| `Sheet2`, `Sheet1`, `2026-27-PD ` (trailing space) | Pranav scratch tabs; the `2026-27-PD ` (extra dash, trailing space) appears to be a partial copy | No (skip) |

---

## 3. Installment schema audit

The "Installment" entity does not exist as a separate type. The `Payment` interface at `src/lib/types.ts:1381` IS the installment record. Field availability vs the refresh sheet's installment columns:

| Refresh column | Maps to | Notes |
|---|---|---|
| `%` (X, AB, AF, AJ) | derived; no dedicated field | Currently expressed via `expectedAmount / contractValue`. Not stored verbatim. |
| `Amount` (Y, AC, AG, AK) | `Payment.expectedAmount` (number) | Direct. |
| `Month` (Z, AD, AH, AL) | `Payment.dueDateIso` (date) + `Payment.dueDateRaw` (string) | Refresh has both ISO dates AND free-text months ("Apr-26", "advance", "partial payment", "before commencement"). Use `dueDateRaw` for the verbatim string and try to ISO-parse where possible. |
| `Payment Received` (AA, AE, AI, AM) | `Payment.receivedAmount` + `Payment.status` | Mix of "YES", date strings, partial amounts. |
| Partial-payment flag | `Payment.partialPayments[]` array exists | Each entry is a `PartialPaymentEntry`. Supports the partial flow. |

**Verdict:** schema supports % (derived), amount, month, status, partial flag. Add one new free-text field, see §5.

---

## 4. Refresh file structure (differs from the original Pratik file)

The refresh file is NOT a drop-in. Layout differences:

| Aspect | Original Pratik (Gate 4.5) | Refresh (2026-05-13) |
|---|---|---|
| Sheet name | `STEAM 2026-27PD ` (trailing space, "STEAM" prefix) | `2026-27PD ` (no "STEAM" prefix) |
| Header row | row 4 | **row 6** (band labels at row 5: "INSTALLMENT I" etc.) |
| Data start | row 5 | **row 7** |
| Column H | `Attachment` | `Kits Sent`, the `Attachment` column was removed and every subsequent column shifted left by 1 |
| Sale Amount | column O | column N |
| Installment I block | Y, Z, AA, AB (cols 25-28) | **X, Y, Z, AA (cols 24-27)** |
| Installment II block | AC..AF | AB..AE |
| Installment III block | AG..AJ | AF..AI |
| Installment IV block | AK..AN | AJ..AM |
| Cross-state cols | AP..AS | AO..AR (`Invoice not Raised & Payment Received` etc.) |

The Gate 4.5 script cannot be invoked as-is on the refresh file; we need a new parser with the corrected column map. Reuse the helpers from `src/lib/imports/fy2627Helpers.ts` verbatim (slugify, parseNumber, parseDateCell, parseTrainerModel, parseDuration).

**User prompt said:** "Reads sheet '2026-27PD' rows 4 onwards (header in row 3, data from row 4)." This is incorrect; the actual sheet is at row 6 header, row 7 data. The importer follows the file, not the brief.

### 4a. Data-quality edge cases observed

Across the 90 data rows (rows 7-96, 79 with content):

- **Continuation rows** (Sr. No. blank, school name matches previous): 3 found.
  - R51: Empyrean School (continuation of R50, both Bootcamp, different student bands 9 vs 19).
  - R69: Contai Public School (continuation of R68, both GSL-T, 450 vs 150 students, separate amounts).
  - R71: Swarnim International School (continuation of R70, R70 is Bootcamp `Q=2124`, R71 is `AIQ` `Q=1652`).
  - Per Anish's brief: treat continuation rows as **separate MOUs under same SchoolGroup**.
- **Non-date Month cells**: `"advance"`, `"after commencement"`, `"before commencement"`, `"partial payment"`, `"Apr-26"`, `"May-25"`, `"Jun-26"`, `"Sep-26"`, `"Dec-26"`. Strategy: preserve verbatim in `dueDateRaw`; if it ISO-parses, fill `dueDateIso` too; otherwise leave `dueDateIso=null` and tag the row as `needs-review`.
- **Formula errors**: 37 cells.
  - `#DIV/0!` in column V (% Received) on rows where Sale Amount is 0, 7 rows. Drop silently; `% Received` is derivable.
  - `#N/A` in column AT (not a labelled column in row 6, appears to be a Pranav-side scratch lookup), 30+ rows. Drop silently; the column is unlabelled and not part of the spec.
- **Trailing whitespace** on sales rep names (`"Balachandra "`, `"Prodipto "`), trim before slug.
- **Trailing whitespace** on school names (`"Vijaya English Primary School "`), trim before slug.
- **Excel serial dates** in month cells when not free-text, `cellDates: true` already converts these to JS `Date` objects.

---

## 5. Idempotency posture

- By-id upsert in staging directory: works. Same school + same product + same FY produces the same MOU id, so re-running merges fields.
- The refresh introduces **multi-product schools** (Swarnim Bootcamp + AIQ at the same FY). A single `MOU-STEAM-2627-<slug>` id collides. Mitigation: compose the id with a `programmeSubType` discriminator when the school appears on multiple rows, e.g.,
  - `MOU-PRANAV-2627-<schoolSlug>-<modelSlug>` for new MOUs created by THIS importer (to avoid colliding with the production sequential IDs).
  - For matches against EXISTING production MOUs (e.g., `MOU-STEAM-2627-037`), the importer must match by school name + duration + product line, then apply changes to the existing record's id.
- The refresh applier writes audit entries with `source: "pranav-refresh-2026-05-13"` for every change; re-applying the same refresh produces a no-op diff (idempotency verified at apply time).

### Free-text bag (new)

To preserve the verbatim "Month" string + cross-state flags + acquisition status without growing the Payment / MOU types, reuse the existing `importNotes: string | null` field on MOU and add a `dueDateRaw` (already present on Payment), no schema changes required.

---

## 6. Match strategy for the diff step

The diff step at Gate 5A.8 Step 3 should look up the existing MOU by:

1. Slugified school name match against `src/data/mous.json[].schoolName`.
2. Filter to MOUs whose academic year overlaps the refresh row's duration (default `2026-27`).
3. Disambiguate by `trainerModel` (TT / GSL-T / Bootcamp / AIQ) when the school has multiple FY26-27 MOUs.
4. If still ambiguous, classify as `AMBIGUOUS`; user picks the match at apply time.

For matches, compare each field; classify:

- `UNCHANGED`: every comparable field identical.
- `UPDATE`: at least one field differs but no conflicting overwrites (e.g., refresh adds installment data the existing record lacks).
- `CONFLICT`: refresh contradicts a field the existing record already holds with non-null value (e.g., refresh says `received=40000` but existing says `received=50000`). Apply requires human decision.
- `NEW`: no slug match.

The refresh importer never silently overwrites payment-received data; conflicts surface at the apply UI.

---

## 7. Items for follow-up

- Sheet 2 (`Billing details _PD`, 52 rows) and Sheet 3 (`2025-26_Proforma Invoice_PD`, 25 rows) are out of scope for Gate 5A.8. Phase 1.1 backlog.
- The `2026-27-PD ` sheet (note the extra dash + trailing space, different from `2026-27PD `) appears to be a partial duplicate of Sheet 1 with only 23 rows. Skip silently; warn if it ever exceeds 23 rows (signal Pranav has moved data).
- The Misba kit delivery file is not part of this refresh.
- The Gate 4.5 staging directory at `src/data/_imports/fy2627/` is orphaned. The refresh writes against live `src/data/*.json` directly; the staging dir can be archived after Gate 5A.8 lands.
