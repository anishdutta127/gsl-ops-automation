# Re-classification scoping: legacy STEAM lump -> 6 finance products

_Report-only. No prod data changed. Snapshot 2026-06-24. Source: the detail sheet
"26-27" in `Anish Data - 23.06.26.xlsx`. Re-classification itself is a future
gated prod write (backup -> dry-run -> show mapping -> verify); NOT done here._

## 1. Does the "26-27" sheet carry per-MOU product classification? YES - via labeled SECTIONS, not a single column.
The detail sheet is **not** one flat table. It is a stack of product-labeled
sections, and each section's subtotal reproduces the Summary's per-product line
**exactly** (strong evidence the sections == the finance products):

| Section in "26-27" | How product is shown | Subtotal | Matches Summary? |
|---|---|---|---|
| Main table "SALE OF TINKRWORKS KITS / CRETILE" (rows 6-105) | default = **STEM - Robotics**; a few rows carry `AIQ` / `Bootcamp` in the **Model** column | - | - |
| ...Model = `Bootcamp` rows | Model column | 1,912 students | = Summary Bootcamps (1,912) |
| ...Model = `AIQ` rows | Model column | (Swarnim 250) | = Summary AIQ (250) |
| "SALES Bootcamp Summary - HARVARD" (rows 115-119) | has a **Product** column = "Havard" | 2,019 / Rs 17,35,169 w/o GST | = Summary Bootcamps - Harvard |
| "YOUNG PIONEER - SALES FY 26-27" (rows 121-138) | section header | 873 students | = Summary YP (873) |
| "Government / University tenders - Lab Set up" (rows 140-149) | section header; IILM ECE/Mech/EV/Robotics/BioTech + Kargil Govt Tender | Rs 1,21,69,792 w/o GST | = Summary Lab Setup Project |

So product is determined by **which section a school sits in** (+ the Model/Product
column in some sections). There is **no single clean "product" column** across all
rows, and the headers are inconsistent (one block mislabels "HARVARD" over the
Bootcamps subtotal). It is parseable, but not a tidy lookup.

**Important caveat:** the **same school appears under multiple products** (Empyrean
School -> Bootcamps *and* Bootcamps - Harvard; 21K Learning -> Bootcamps *and* YP;
Swarnim -> STEM *and* AIQ). So school-name alone cannot disambiguate those; per-MOU
value/student matching or finance input is needed.

## 2. Proposed mapping (app FY26-27 MOU -> finance product), matched by school name
**97 app FY26-27 MOUs** matched against the sheet sections (normalised name +
fuzzy contains). **NOT APPLIED.**

| Outcome | Count | % |
|---|---:|---:|
| **Confident** (single product) | **87** | 90% |
| **Ambiguous** (school spans >1 product) | 5 | 5% |
| **Unmatched** (in app, not in sheet) | 5 | 5% |

Confident product distribution: **STEM - Robotics 75, YP 7, Bootcamps 3,
Bootcamps - Harvard 1, AIQ 1.**

### The actual re-tag set (confident app MOUs that change OUT of STEAM)
The 75 STEM rows are a no-op rename (STEAM -> STEM - Robotics). The 7 YP rows are
**already** tagged "Young Pioneers" in the app (correct). The genuine corrections:

| App MOU (school) | App tag now | Proposed product | Sheet value (incl tax) |
|---|---|---|---:|
| Radcliffe Education Private Limited | STEAM | **Bootcamps - Harvard** | Rs 20,00,000 |
| Wisdom International School | STEAM | **AIQ** | Rs 11,32,800 |
| GNIMS Business School | STEAM | **Bootcamps** | Rs 0 |
| Guru Nanak Institute of Management Studies | STEAM | **Bootcamps** | Rs 0 |
| B.K. Birla Public School - Kalyan | STEAM | **Bootcamps** | Rs 24,600 |

### Ambiguous - need per-MOU disambiguation (value/students) or Pranav
- **21K Learning Private Limited** (app: Young Pioneers) -> Bootcamps **/** YP
- **Empyrean School** x2 (app: STEAM) -> Bootcamps **/** Bootcamps - Harvard
- **Swarnim International School** x2 (app: STEAM) -> STEM - Robotics **/** AIQ

### Unmatched - in app, not found in the sheet (need Pranav / left as STEM)
Agragami Vidya Kendar; Christ King Public School; Don Bosco Krishnanagar;
Loreto Day School Kolkata; Sri Ramavidyalay. (Likely STEM - Robotics by default,
but not confirmable from the sheet - do not guess.)

## 3. Source of truth
The sheet **does** carry it (section membership), so this is **not** a "must come
entirely from Pranav" case. But the **10 non-confident rows** (5 ambiguous + 5
unmatched) and the multi-product schools **do** need Pranav/finance to confirm.
Products were **not** guessed from amounts.

## 4. Auto-match fraction + residual gap
- **Auto-matchable: 87 / 97 (90%)** confidently; **10 (10%)** need manual input.
- **Re-tagging confirms taxonomy is the per-product SHAPE cause** (the sheet's
  sections reproduce the Summary per-product totals exactly).
- **But re-classification alone will NOT close the ~Rs 96 L sales-total gap**,
  because a large part of it is **structurally missing data, not mis-tagging**:
  - **Lab Setup Project (Rs 1,21,69,792 w/o GST) has ZERO app MOUs** - IILM
    (ECE/Mechanical/EV/Robotics/BioTech) and "Kargil Government Tender" are **not
    in the app at all**. Re-tagging cannot create them.
  - Bootcamps and AIQ sheet lines also exceed what the app can supply (only a few
    matched app MOUs).
  - These would need either **new MOU data entry** or an explicit "out-of-app
    scope" decision - a separate task from re-tagging.
- **Net:** after re-classifying the 87 matched MOUs, the app's STEM - Robotics
  bucket drops by the re-tag values (Radcliffe Rs 20 L + Wisdom Rs 11.3 L + the
  small Bootcamps) - closing ~Rs 30-35 L of the STEM overage - while AIQ /
  Bootcamps / Bootcamps - Harvard gain those MOUs. The **dominant residual** is
  the **missing Lab Setup Project (~Rs 1.22 cr)** which no re-tag can supply.

## Recommendation (each its own gated step; nothing applied here)
1. Send Pranav the **10 non-confident rows** + the 3 multi-product schools to
   confirm per-MOU product.
2. With confirmations, re-classification is a small, safe prod write: it only
   updates `mous.programme` for ~5 confident + up to ~10 confirmed MOUs (the 75
   STEM rows are a cosmetic STEAM -> "STEM - Robotics" rename, optional).
   Backup -> dry-run -> show final mapping -> apply -> verify per-product totals.
3. Separately decide whether the **finance-only products with no app MOUs**
   (esp. Lab Setup Project Rs 1.22 cr) should be entered into the app or marked
   out-of-app-scope. Do **not** overwrite the DB to match the hand-kept sheet.
