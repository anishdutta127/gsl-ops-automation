# EXCEL_MAPPING.md: Gate 4.5

Column-by-column mapping from the two reference Excel files at `phase-pranav-misba-imports/` to the canonical entity JSONs under `src/data/_imports/fy2627/`. Source of truth for the import scripts and the testing-email reconciliation conversation with Pranav and Misba.

The mapping is **deliberately conservative**: when Excel data does not fit cleanly into an existing entity field, it lands in a free-text `importNotes` field rather than being silently dropped. Every transformation that requires judgement (date parsing, sales-rep dedup, school name fuzzy match) is logged to `_meta.json` for review.

---

## 1. Pratik invoicing file

File: `phase-pranav-misba-imports/Pratik_-_School_Invoicing_Summary_2026-27.xlsx`

### 1a. Sheet `STEAM 2026-27PD `

Layout: title rows 1-2, band-header row 3, column-label row 4, **data rows 5-69 (65 records)**.

| Col | Excel header | Target entity / field |
|---|---|---|
| A | Sr. No. | ignore |
| B | Name of School | `School.name` + derived `School.id` (slugified) |
| C | Status (New / Retained) | `MOU.importNotes` keyed `acquisitionStatus=<value>` |
| D | No. of Schools | ignore (always 1; chain MOUs handled by SchoolGroup) |
| E | Sales Representative | `MOU.salesPersonId` - look up by trimmed name, else auto-create with `id=sp-<lowercased-trimmed-name>` |
| F | Physical copy & Scanned (YES / No) | `MOU.signedMouPdfPath` set to stub path `imports/fy2627/stubs/<mouId>.pdf` if YES, else `null` |
| G | MOU (YES / blank) | `MOU.status` = `'Active'` if YES, else `'Pending Signature'` |
| H | Attachment | ignore (legacy filename hint) |
| I | Kits Sent | ignore (cross-validated against Misba imports) |
| J | Model (TT / TTT / Bootcamp) | `MOU.trainerModel`: TT->`'TT'`, TTT->`'GSL-T'`, Bootcamp->`'Bootcamp'`, blank/other->null with warning |
| K | Duration ("01st April 2026 to 31st March 2027") | parsed to `MOU.effectiveDate` + `MOU.endDate`; fallback `2026-04-01` to `2027-03-31` |
| L | City / Location | `School.city` |
| M | State | `School.state` |
| N | No. of Students (As per MOU) | `MOU.studentsMou` (null-safe, default 0) |
| O | Sale Amount as per MOU (incl. Tax) | `MOU.contractValue` |
| P | Actual No. of Students | `MOU.studentsActual` (null-safe) |
| Q | SP per Student (w/o Tax) | `MOU.spWithoutTax` |
| R | SP per Student (incl. Tax) | `MOU.spWithTax` |
| S | Sales Amount (incl. Tax) | sanity assert vs N x R; warning if delta > 1 |
| T | Amount Received | `MOU.received` |
| U | TDS Amount | `MOU.tds` |
| V | Balance Outstanding | derived; warn if not equal to `O - T - U` |
| W | % Received | derived as `T / O`; sanity assert vs Excel |
| Y, Z, AA, AB | Installment I (%, Amount, Month, Payment Received) | `Payment` record `seq=1`, `dueDateIso=AA`, `expectedAmount=Z`, `status=Received if AB`else `Pending` |
| AC-AF | Installment II | seq=2 |
| AG-AJ | Installment III | seq=3 |
| AK-AN | Installment IV | seq=4 |
| AP-AS | Invoice-vs-payment cross-state | ignore (derivable) |

**STEAM imports produce**: 65 MOU records, up to 4 Payment records each (sparse), 1 School record per unique school name, up to N SalesPerson records (auto-created).

### 1b. Sheet `YP_2026-27`

Layout: header row 5, **data rows 6-14 (9 records)**.

| Col | Excel header | Target entity / field |
|---|---|---|
| A | Sr. No. | ignore |
| B | Name of School | `School.name` + derived id |
| C | City | `School.city` |
| D | State | `School.state` |
| E | Grade (e.g. "Beginners Level- student copy") | `MOU.importNotes` keyed `ypLevel=<value>`; first numeric grade extracted to `MOU.gradewiseDistribution[0]` if parseable |
| F | PI (MTPL/2627/N) | `Payment.piNumber` on seq=1 |
| G | Tax Invoice No | `Payment.taxInvoiceNumber` on seq=1 |
| H | MOU Signed (as per email / blank) | `MOU.status` = `'Active'` if filled, else `'Pending Signature'` |
| J | Signing Date | parsed to `MOU.startDate` |
| K | Academic Year | `MOU.academicYear` |
| L | Termination | `MOU.importNotes` keyed `termination=<value>` |
| M | No of Students as per MOU | `MOU.studentsMou` |
| N | Actual No. of Students | `MOU.studentsActual` |
| O | Price w/o GST | `MOU.spWithoutTax` |
| P | Sales Amount w/o GST | sanity assert vs M x O |
| Q | Price with GST | `MOU.spWithTax` |
| R | Sales Amount with GST | `MOU.contractValue` |
| S | Amount Received | `MOU.received` |
| T | Date of Payment received | `Payment.receivedDate` on seq=1 |
| U | TDS | `MOU.tds` |

**YP imports produce**: 9 MOU records (programme=`'Young Pioneers'`), 1 Payment per MOU minimum (seq=1).

### 1c. STEAM + YP duplicate-school check

If a school name appears in both STEAM and YP sheets (case-insensitive comparison after trim), flag as chain-MOU candidate in `_meta.json.chainMouCandidates[]`. Do not auto-create a SchoolGroup; Anish reviews and may attach to an existing group manually.

---

## 2. Misba kit-delivery file

File: `phase-pranav-misba-imports/Kit_Delivery_2026.xlsx`

### 2a. Sheet `TW`

Layout: row 1 holds per-SKU price headers (unit cost ints), header row 2, **data rows 3-26 (24 records)**.

| Col | Excel header | Target entity / field |
|---|---|---|
| A | Sr No | ignore |
| B | School Name | match to `School` by case-insensitive trimmed-name + slug fuzzy match (Jaro-Winkler >= 0.85); else create with `notes: 'Created during Misba kit dispatch import'` |
| C | Concern person | `School.contactPerson` only if not already set |
| D | Sale person | cross-check against Pranav's sales-rep map; log mismatch if name absent |
| E-V | Per-SKU quantities (T-Aske, SA, WS, SLPK, TSYN, MC, PP, SB, LP, AEG 1-2, AEG 3-5, P3 K-8, TPY, TBOT, TEX, TBS, VEX GO Small Classroom Bundle, VEX GO Classroom Bundle) | for each non-empty column, one `KitAllocation` entry: `{ productName, kitsQty: cellValue, kitType: 'Reusable', grade: 0 }` (grade=0 sentinel: SKU is product-level, not grade-level); `productLine='TinkRworks'` set on the parent `KitDispatch` |
| W | Date Mar/apr | `KitDispatch.dispatchSummary.dispatchedAt` (ISO date) |
| X | DC no (DC-0226, DC-0231 etc.) | `KitDispatch.dispatchSummary.deliveryChallanNumber` |
| Y | Eway bill applicability (Y / N / blank) | `KitDispatch.importNotes` keyed `ewayBill=<Y/N>` |
| Z | Billing Remark | `KitDispatch.importNotes` keyed `billing=<value>` |
| AA | No of Students | `KitDispatch.importNotes` keyed `studentsServed=<value>` |
| AB | Remarks- Kits Return | `KitDispatch.importNotes` keyed `kitReturn=<value>` |
| AD | Kit Cost | ignore (per-row price already in row 1 headers) |

**TW imports produce**: 24 `KitDispatch` records (`productSelected='TinkRworks'`, `dispatchStatus='Delivered'`), up to 18 `KitAllocation` entries per dispatch, 18 unique `InventoryItem` SKUs (one per column E-V).

### 2b. Sheet `Cretile `

Layout: row 1 per-SKU prices, header row 2, **data rows 3-40 (38 records)**.

| Col | Excel header | Target entity / field |
|---|---|---|
| A | Sr No | ignore |
| B | School Name | school match per TW rules |
| C | Concern person | `School.contactPerson` only if not already set |
| E-N | Grade columns (Grade 1, Grade 2, Grade 3, Grade 4, Grade 5, Grade 6, Grade 7, Grade -8, Grade 9, Grade 10) | per non-empty column, one `KitAllocation`: `{ grade: <1..10>, kitsQty: cellValue, kitType: 'Consumable', productName: 'Cretile Grade-band kit Grade <N>' }` |
| O | Date Mar/apr | `KitDispatch.dispatchSummary.dispatchedAt` |
| P | DC no | `KitDispatch.dispatchSummary.deliveryChallanNumber` |
| Q | Eway bill applicability | `importNotes` keyed `ewayBill=` |
| R | Billing Remark | `importNotes` keyed `billing=` |
| S | No of Students | `importNotes` keyed `studentsServed=` |
| T | Remarks- Kits Return | `importNotes` keyed `kitReturn=` |
| V | Kit Cost | ignore |

**Cretile imports produce**: 38 `KitDispatch` records (`productSelected='Cretile'`, `dispatchStatus='Delivered'`), up to 10 `KitAllocation` entries per dispatch, 10 unique `InventoryItem` SKUs (`Cretile Grade-band kit Grade 1` through `Grade 10`).

### 2c. Sheet `Hardware `

Layout: header row 2, **data rows 3-12 (10 records)**.

| Col | Excel header | Target entity / field |
|---|---|---|
| A | Sr No | ignore |
| B | School Name | school match per TW rules |
| C | Concern person | `School.contactPerson` if not set |
| D | Sale person | cross-check against sales-rep map |
| E-N | Tab / Drones / Keyboards and mice / Printer / Smart Board / Projector / Bluetooth Modules / Smart Board (duplicate) / Lab-setup / Trainer Cost | per non-empty column, one `KitAllocation`: `{ productName: <col header>, kitsQty: cellValue, kitType: 'Reusable', grade: 0 }`; `productLine='Hardware'` |
| O | Price | `KitDispatch.importNotes` keyed `hardwarePrice=<value>` |

**Hardware imports produce**: 10 `KitDispatch` records (`productSelected='Hardware'` - new value, see below), up to 10 `KitAllocation` entries per dispatch, ~10 unique `InventoryItem` SKUs (`InventoryCategory='Other'` since 'Hardware' is not in the existing enum).

### 2d. Sheet `Pratik` (cross-validation only)

Layout: top table rows 3-23 (21 records), bottom Sr-No table rows 26-40 (14 records), **35 total**. Used for cross-validation only - do not double-import. For every Misba TW or Cretile dispatch, check the Pratik summary table for a matching DC number; if missing, log to `_meta.json.crossValidationGaps[]`.

---

## 3. Output paths

Every import script writes to `src/data/_imports/fy2627/<entity>.json`:

- `sales_team.json` - auto-created from Pranav STEAM column E
- `schools.json` - auto-created from Pranav + Misba sheets; deduplicated by slug
- `school_groups.json` - placeholder; populated only when chain MOU candidates resolved
- `mous.json` - STEAM + YP records
- `installments.json` - `Payment` records (seq 1-4 per MOU)
- `payments.json` - only records with `receivedAmount > 0`
- `kit_dispatches.json` - TW + Cretile + Hardware records
- `inventory_items.json` - auto-created SKUs from all three Misba sheets
- `_meta.json` - import timestamp, source filename, per-row outcome, mismatches, warnings, errors

The directory under `_imports/` is **staging only**. Cutover (Gate 5) promotes records to the top-level `src/data/*.json` after Pranav and Misba review the auto-creates and cross-Excel mismatches.

---

## 4. Type-system additions

Three free-text `importNotes` fields added in Gate 4.5:

- `MOU.importNotes: string | null`
- `KitDispatch.importNotes: string | null`
- `InventoryItem.importNotes: string | null`

Format: `key1=value1; key2=value2` so simple grep + parse for post-import audit.

Two `MOU.status` values stay as-is: `'Active'` (signed) and `'Pending Signature'` (drafting). Pranav's "MOU" column maps to one or the other.

One new `KitDispatch.productSelected` value introduced: `'Hardware'` (was previously `'TinkRworks' | 'Cretile' | 'Both'`).

One new `InventoryItem.category` value introduced: `'Hardware'` (was previously `'TinkRworks' | 'Cretile' | 'Other'`).

---

## 5. Validation rules summary

**Silent-skip** (logged to `_meta.json.skipped[]` with row + reason):

- Row 5+ of a data range whose school-name column is empty / null
- Row whose every numeric column is empty (likely a band-separator row)

**Loud-fail** (logged to `_meta.json.errors[]` and incremented in exit-code 1 strict mode):

- Sale amount column missing AND school has installment data
- Per-student price (Q or R for STEAM, O or Q for YP) missing AND `studentsMou` non-zero
- More than 4 installments on a STEAM row
- Trainer model column J value outside the validated enum
- DC number duplicated within the same sheet
- Two schools resolving to the same slug with different city/state (potential dedup collision)

**Warn** (logged to `_meta.json.warnings[]`, never blocks):

- Installment percentage columns sum != 1.0
- Sales rep name absent from previously-seen list (auto-creation marker)
- School name fuzzy-match similarity in (0.85, 0.95) bracket (review recommended)
- TW or Cretile dispatch with no matching DC in Pratik summary
- Same school name appearing in both STEAM and YP sheets (chain-MOU candidate)
- Sale Amount (column S) delta against `N x R` > 1

---

## 6. Decision archive

Decisions taken while writing this mapping:

1. **Slug derivation**: ASCII-lowercased school name, non-alphanumerics replaced with `-`, double `-` collapsed, trim leading/trailing `-`. Idempotent on re-run.
2. **Sales rep auto-create**: lowercase trimmed name -> `sp-<slug>`. Trailing whitespace stripped (Excel has `'Balachandra '` with trailing space).
3. **Currency parsing**: cells already number-typed in the Excels; just `Number()` coerce. If a cell is unexpectedly a string like `'Rs 1,50,000'`, strip `Rs|INR|,|whitespace` then parse; null on failure.
4. **Date parsing**: cells already datetime-typed for known date columns; `.toISOString().slice(0, 10)` for Pranav installment Month. Free-text duration column (K on STEAM) parsed with regex `(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})` for start, then `to` separator, then same for end; fallback to FY defaults `2026-04-01` / `2027-03-31` with a warning.
5. **`KitDispatch.id` minting**: `DISPATCH-<mouId>-<DC-number-sluggified>`; falls back to `DISPATCH-IMPORTED-<random8>` when there is no matching MOU.
6. **Schools created during Misba import** get a placeholder `region`, `pinCode`, `email`, `phone`, `billingName`, `pan`, `gstNumber` of `null` plus `notes: 'Created during Misba kit dispatch import.'` so Anish can enrich later.
7. **Idempotency**: every entity write is by-id upsert. Existing record (matching by `id`) gets a `merge` of new fields over old; the import script's `_meta.json` records `updated` vs `inserted` per entity for the dry-run report.
