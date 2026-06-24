# FY 26-27 reconciliation: app (Postgres) vs "Summary 26-27"

_Report-only. No DB writes were made. Snapshot: 2026-06-24. Source of truth for
the target = `Anish Data - 23.06.26.xlsx` -> "Summary 26-27" (hand-kept; may
itself be wrong - deltas are reported, not "fixed")._

## Scope + method
- **Target**: the "Summary 26-27" sheet, w/o GST, per product, plus the received
  buckets (advance-not-invoiced, received-&-invoiced, invoiced-not-received).
- **App side**: Postgres, MOUs with `academic_year = '2026-27'` (94 MOUs), rolled
  up to the finance product via the new registry `legacy_programmes` mapping
  (STEAM + Robotics -> STEM - Robotics; Young Pioneers -> YP).
- **Read-only**: SELECT queries only; nothing written.

## Assumptions (stated explicitly)
1. **GST**: the sheet is **w/o GST**. The app's `contract_value` is
   **GST-inclusive (18%)** - verified on samples: `sp_with_tax = sp_without_tax x 1.18`
   and `contract_value = students x sp_with_tax`. So the app w/o-GST sales figure
   used below is `SUM(students_mou x sp_without_tax)` (exact per MOU), **not**
   `contract_value`. (The 5 YP MOUs were entered with `sp_without_tax = sp_with_tax`,
   i.e. no GST split.)
2. **TDS**: the sheet "received" buckets are w/o GST and appear to be gross of TDS.
   The app's received comes from `payments.received_amount` (gross of TDS; `mou.tds`
   is tracked separately and is small: ~Rs 15,891 across FY26-27). TDS is **not**
   netted on either side here; treat the received comparison as +/- a TDS band.
3. **Students - MOU vs actual**: the sheet "No. of Students" is the **MOU** figure.
   The app holds both `students_mou` and `students_actual`; **both are reported**.
   The like-for-like comparison is sheet vs `students_mou`.
4. **`mou.received` is stale** (e.g. St Paul shows `mou.received = 0` despite a real
   receipt) - received is computed from `payments`, not the denormalised MOU field.
5. **Live DB**: `mous` grew 188 -> 192 between the migration-014 backup and this run
   (4 YP MOUs added by testers). Figures are a snapshot at report time.

## Canonical target (sheet, w/o GST)
| Product | Students (MOU) | Sales w/o GST | Cash received (adv + recd&inv) |
|---|---:|---:|---:|
| STEM - Robotics | 39,934 | Rs 4,34,91,756 | Rs 34,66,961 |
| YP | 873 | Rs 19,58,559 | Rs 10,48,412 |
| AIQ | 250 | Rs 3,50,000 | Rs 25,340 |
| Bootcamps | 1,912 | Rs 1,92,966 | Rs 1,25,300 |
| Bootcamps - Harvard | 2,019 | Rs 17,35,169 | Rs 47,500 |
| Lab Setup Project | 0 | Rs 1,21,69,792 | Rs 9,88,710 |
| **Total** | **44,988** | **Rs 5,98,98,243** | **Rs 57,02,223** |

## App (Postgres, FY 26-27, mapped to finance products)
| Product (mapped) | MOUs | Students MOU | Students actual | Sales w/o GST | (Sales w/ GST) | Received gross (payments) |
|---|---:|---:|---:|---:|---:|---:|
| STEM - Robotics (<- STEAM) | 89 | 46,961 | 19,771 | Rs 4,96,85,573 | Rs 5,88,97,276 | Rs 55,23,217 * |
| YP (<- Young Pioneers) | 5 | 206 | 206 | Rs 6,07,700 | Rs 6,07,700 | Rs 0 |
| AIQ | 0 | 0 | 0 | Rs 0 | Rs 0 | Rs 0 |
| Bootcamps | 0 | 0 | 0 | Rs 0 | Rs 0 | Rs 0 |
| Bootcamps - Harvard | 0 | 0 | 0 | Rs 0 | Rs 0 | Rs 0 |
| Lab Setup Project | 0 | 0 | 0 | Rs 0 | Rs 0 | Rs 0 |
| **Total** | **94** | **47,167** | **19,977** | **Rs 5,02,93,273** | **Rs 5,95,04,976** | **Rs 55,23,217** * |

\* Includes the **St Paul duplicate** (+Rs 3,72,000, see below). Net of it: Rs 51,51,217 gross.

## Deltas (w/o GST; tolerance Rs 1,000 / rounding)
### Sales (w/o GST)
| Product | Sheet | App | Delta (app - sheet) | Flag |
|---|---:|---:|---:|---|
| STEM - Robotics | Rs 4,34,91,756 | Rs 4,96,85,573 | **+Rs 61,93,817** | FLAG (app higher ~14%) |
| YP | Rs 19,58,559 | Rs 6,07,700 | **-Rs 13,50,859** | FLAG (app lower) |
| AIQ | Rs 3,50,000 | Rs 0 | **-Rs 3,50,000** | FLAG (no app data) |
| Bootcamps | Rs 1,92,966 | Rs 0 | **-Rs 1,92,966** | FLAG (no app data) |
| Bootcamps - Harvard | Rs 17,35,169 | Rs 0 | **-Rs 17,35,169** | FLAG (no app data) |
| Lab Setup Project | Rs 1,21,69,792 | Rs 0 | **-Rs 1,21,69,792** | FLAG (no app data) |
| **Total** | **Rs 5,98,98,243** | **Rs 5,02,93,273** | **-Rs 96,04,970** | FLAG (app lower ~16%) |

### Students (MOU basis)
| Product | Sheet (MOU) | App MOU | App actual | Delta (MOU) | Flag |
|---|---:|---:|---:|---:|---|
| STEM - Robotics | 39,934 | 46,961 | 19,771 | **+7,027** | FLAG |
| YP | 873 | 206 | 206 | **-667** | FLAG |
| AIQ / Bootcamps / B-Harvard / Lab Setup | 4,181 | 0 | 0 | **-4,181** | FLAG (no app data) |
| **Total** | **44,988** | **47,167** | **19,977** | **+2,179 (MOU) / -25,011 (actual)** | FLAG |

### Received (cash)
- Sheet total cash received (adv + recd&inv, w/o GST): **Rs 57,02,223**; of which
  STEM + YP = **Rs 45,15,373**.
- App received (payments, gross/with-GST): **Rs 55,23,217**; net of the St Paul
  duplicate **Rs 51,51,217**; w/o GST (/1.18) approx **Rs 43,65,438**.
- App vs sheet STEM+YP received (w/o GST): approx **Rs 43,65,438 vs Rs 45,15,373**,
  delta approx **-Rs 1,49,935** (within a TDS/rounding band; close once the
  duplicate is removed).

## Likely cause of each mismatch
1. **Taxonomy mismatch (dominant).** The app currently tags every MOU as only
   **STEAM** or **Young Pioneers**; finance splits the portfolio into 6 products.
   - The app's "STEAM" bucket is a **superset**: it lumps together what finance
     breaks out as STEM - Robotics **plus** (most of) AIQ, Bootcamps and Lab Setup
     Project. That is why app STEM - Robotics reads ~Rs 62L **higher** than the
     sheet's STEM - Robotics line, while AIQ / Bootcamps / Lab Setup show **Rs 0**
     in the app.
   - **AIQ, Bootcamps, Bootcamps - Harvard, Lab Setup Project have no app MOUs** -
     they are brand-new registry entries; no MOU is tagged with them yet. Their
     combined sheet sales (~Rs 1.45 cr) are absent from the app per-product (and
     only partially hidden inside the STEAM lump).
   - **Until existing MOUs are re-classified to the 6-product taxonomy, per-product
     reconciliation cannot align.** Phase 2 lets NEW MOUs pick a product; a
     re-tagging pass over the 159 STEAM + 33 YP MOUs would be needed to split the
     legacy lump (not in scope here; flagged).
2. **GST.** Comparing app `contract_value` (w/ GST) to the sheet (w/o GST) would
   overstate the app by ~18%; corrected via `students x sp_without_tax`.
3. **MOU vs actual students.** App `students_actual` (19,977) is ~42% of
   `students_mou` (47,167) - many MOUs carry low/partial actuals. The sheet is
   MOU-basis, so it tracks `students_mou`; the large actual shortfall is a data-
   completeness gap (actuals not yet captured), not necessarily a sales error.
4. **St Paul duplicate (PL-CB850B8E).** Confirmed in `payments`: both
   `MOU-STEAM-2627-038-i1` and `-i2` show `received = Rs 3,72,000` for the **same**
   NEFT `PUNBH26147595072` -> **+Rs 3,72,000 spurious** in app STEAM received.
   Not yet recovered (Phase 3, gated). Inflates app received until removed.
5. **Live data drift.** 4 YP MOUs were added by testers since the 014 backup
   (188 -> 192 rows); the YP figures will keep moving as the pilot runs.
6. **Sheet may itself be off.** e.g. Lab Setup Project shows **0 students** but
   Rs 1.22 cr sales - plausibly a project-based (non-per-student) line. The app has
   no equivalent MOUs. Per instruction, this is reported, **not** "fixed" by
   overwriting the DB.

## Bottom line
- **Totals look close only by coincidence of offset**: app sales w/o GST
  (Rs 5.03 cr) vs sheet (Rs 5.99 cr) is **-Rs 96 L (app ~16% lower)** - the app is
  missing the finance-only products (esp. Lab Setup Project Rs 1.22 cr), partly
  offset by the STEAM lump running high.
- **Received reconciles within a TDS/rounding band** for STEM + YP once the St Paul
  duplicate is netted out.
- **No DB changes made.** Recommended follow-ups (each its own gated task): (a) the
  St Paul duplicate recovery (Phase 3); (b) a re-classification pass to split the
  legacy STEAM lump into the 6 finance products so per-product can reconcile;
  (c) capture `students_actual` where missing. Do **not** overwrite the DB to match
  the hand-kept sheet.
