# W4 deferred items registry

Single source of truth for items that need Anish's review before round 2 testing email at end of W4-I. Update this file (do not scatter deferred items across batch reports) whenever a backfill, recon, or implementation surfaces a question that cannot be resolved mid-build.

Each entry: a stable id, status, surface where it was found, the question, what is needed to close it, and any context the round 2 triage email will need.

| Status | Meaning |
|---|---|
| open | Awaiting Anish review |
| triaged | Anish has reviewed; resolution captured below |
| resolved | Closed; entry kept for audit trail |

---

## D-001 GMR International School (no matching MOU)

- **Status:** open
- **Surfaced by:** W4-C.4 backfill manual-review CSV (`scripts/w4c-backfill-manual-review-2026-04-27.csv`, row 24)
- **Form context:** Form row 25 = "GMR International School" (Account Owner Dr. Sumit Majumdar). Submitted via the post-signing intake Google Form, but no MOU in the active 51-list matches.
- **Question:** Add as a new MOU (separate signing path) OR permanent defer (school never signed; submission was speculative)?
- **Needed to close:** Anish confirms whether GMR signed. If yes, where the MOU paperwork is and whether to backfill via W4-A re-import path. If no, mark the form row as orphaned and archive.

## D-002 B.D. Memorial chain (4 branches, 1 active MOU)

- **Status:** open
- **Surfaced by:** W4-D Mastersheet recon, Cretile sheet rows 8-11
- **Source rows:** 'B.D. Memorial Jr. School Bansdroni', '... Golf Garden', '... Garia', '... Vijaygarh'
- **Active list:** only MOU-STEAM-2627-022 'B.D Memorial Jr. School' (no branch suffix)
- **Question:** Is -022 a chain MOU covering all 4 branches, or are these 4 separate schools that should each have a distinct MOU?
- **Needed to close:** Anish confirms chain status. If chain: W4-D Mastersheet rows for all 4 branches map to -022. If separate: 3 new MOUs to import via W4-A path before W4-D backfill can land those rows.

## D-003 Don Bonsco / Don Bosco typo confirmation

- **Status:** open
- **Surfaced by:** W4-C.1 school-name correction (W4-C recon decision)
- **What was changed:** School name 'Don Bonsco School Krishnanagar' renamed to 'Don Bosco Krishnanagar' (typo fix). school.id retained as `SCH-DON_BONSCO_KRISHNANA` to preserve audit foreign-key references. MOU-STEAM-2627-027 schoolName updated.
- **Question:** Confirm the typo fix matches Anish's records (school is in fact 'Don Bosco', not 'Don Bonsco'); confirm the school.id retention is acceptable (FK preservation vs cosmetic rename).
- **Needed to close:** Anish acknowledges. If school.id should also rename, schedule a W4-I migration that updates every audit/feedback/dispatch FK in one transaction.

## D-004 Mastersheet TWs sheet AY ambiguity

- **Status:** open
- **Surfaced by:** W4-D Mastersheet recon
- **Context:** TWs (TrainTheTrainer-with-Solutions) sheet has rows that match BOTH the active 2627 cohort and the archived 2526 cohort with token overlap. The TWs sheet has no academic year column. Approximately 12 rows are dual-candidate (Loreto, Julien Day variants, Carmel, Montfort, Scottish, etc.).
- **Question:** Default these rows to the archived 2526 match (treat TWs as historical), to the active 2627 match (treat TWs as current), or surface every dual-candidate row to manual review during W4-D backfill?
- **Needed to close:** Anish picks default. If "manual review every row," the W4-D backfill emits a Tier 4 verification table + waits for sign-off per the new pre-mutation discipline.

## D-005 Mastersheet Cretile sheet AY tagging

- **Status:** open
- **Surfaced by:** W4-D Mastersheet recon
- **Context:** Cretile sheet rows for the BD Memorial branches (4) + a few others may need explicit AY tagging because the row content does not name an AY and the BDM chain is unresolved (D-002).
- **Question:** Tag every Cretile row to AY 2627 (current cohort) by default, or surface AY-ambiguous rows to manual review?
- **Needed to close:** Anish picks default. Coupled with D-002 resolution.

## D-006 NARAYANA SCHOOL chain-MOU classification

- **Status:** open
- **Surfaced by:** W4-A.1 import (gsl-mou-system upstream); held in `src/data/mou_import_review.json`
- **Source record:** MOU-STEAM-2526-027 'NARAYANA SCHOOL', 2000 studentsMou, location '9 Different Locations' West Bengal
- **Quarantine reason:** "Likely GROUP-scope chain MOU; SINGLE-vs-GROUP classification needed"
- **Question:** Is this a single legal entity that operates 9 sites (treat as one MOU), or 9 separate school MOUs that were rolled up into one upstream record? Note: Ramanarayana Education Trust (-051, active 2627) is the corresponding 2627 entity per Anish's W4-C disambiguation; the 2526 record may simply be the prior year of the same entity.
- **Needed to close:** Anish confirms whether 2526-027 = same entity as 2627-051 (in which case archive 2526-027 with linkBackTo annotation), or 9 separate schools needing separate MOUs.

## D-007 Active 51-list canonical-name verification

- **Status:** open
- **Surfaced by:** W4-C.7 independent verification gate
- **Context:** The hardcoded `CANONICAL_51_LIST` in `scripts/w4c7-independent-verification.mjs` is a one-time snapshot from `mous.json` filtered to `cohortStatus = 'active'` on 2026-04-28. The audit treats this snapshot as Anish's source of truth, but the snapshot itself was sourced from `mous.json` (which was derived from gsl-mou-system upstream during W4-A.1 + W4-A.7).
- **Question:** Does the hardcoded 51-list match Anish's own active-MOU records line by line? Specifically, are there any canonical names that Anish would write differently from the upstream form?
- **Needed to close:** Anish reviews `CANONICAL_51_LIST` in the script (visible in the diff). If any line disagrees, edit the script and rerun the verification. Once Anish signs off, this constant becomes the verified source of truth and W4-D backfills reference it.

## D-008 Form row 24 GMR vs row 25 numbering

- **Status:** resolved
- **Surfaced by:** W4-C.4 backfill report
- **Context:** GMR International School lives at form xlsx row 25 (1-indexed; row 1 is header). The W4-C.4 backfill numbers IRs as `IR-W4C-NNN` where NNN = (form row - 1). GMR was skipped (no MOU match), so IR-W4C-024 was never created. The 23 IRs cover form rows 2..24 contiguously, and GMR sits at row 25.
- **Resolution:** Verified during W4-C.7 independent verification (`scripts/w4c7-independent-verification.mjs` reads form col 4 for rows 2..max_row; the 23 mapped rows match IR-W4C-001..023 cleanly).

## D-009 Mastersheet row with no MOU match in either active or archived list

- **Status:** open (currently no rows trigger this; sentinel entry for the W4-D.8 verification script)
- **Surfaced by:** `scripts/w4d-mastersheet-verification.mjs` quarantine path
- **Context:** When a Mastersheet TWs or Cretile row's school name has zero distinctive token overlap with any of the active 51 MOUs OR any of the archived 92 MOUs, the verification script quarantines the row and references this entry.
- **Question:** What should happen to a Mastersheet row whose school is unknown to both lists? Add the school + a new MOU as a one-shot upstream import, or accept the row as orphaned historical data with no MOU FK?
- **Needed to close:** Anish reviews any row that triggers this. The W4-D.8 verification table shipped with 0 D-009 hits (all 4 quarantines are BD Memorial branches per D-002); future re-runs against a new Mastersheet may surface real hits.

## D-010 Dehi vs Delhi spelling on MOU-STEAM-2627-020

- **Status:** open
- **Surfaced by:** W4-D.8 Mastersheet backfill (Cretile sheet row 8)
- **Context:** Mastersheet Cretile row 8 says `Dehi World Public School, Barasat`; canonical name on `MOU-STEAM-2627-020` is `Delhi World Public School, Barasat`. Auto-imported on the medium-confidence path (active 2627 wins because no archived counterpart). The Mastersheet spelling is a probable typo.
- **Question:** Confirm the canonical school name. If the MOU's `Delhi` spelling is correct, no action; if the school's preferred name is actually `Dehi`, update `mous.json` to match (single-line `schoolName` change, audit captures).
- **Needed to close:** Anish confirms with the school SPOC.

## D-011 Julien chain: brand identity + AY confirmation

- **Status:** open
- **Surfaced by:** W4-D.8 Mastersheet backfill (TWs sheet rows 6, 7, 8, 9)
- **Context:** The 4 TWs rows say `Julien Day School, <Elgin Road | Kalyani | Ganganagar | Howrah>`; the MOU canonical names say `Julien Educational Trust, <location>`. Anish-resolved during W4-D.8 to default ARCHIVED 2526 (the AY heuristic suggested historical pre-system delivery because the active 2627 candidates had no Dispatch on file). The 4 backfilled records landed on `MOU-STEAM-2526-007/008/009/010`.
- **Question:** Confirm "Julien Day School" (Mastersheet brand) = "Julien Educational Trust" (upstream brand). Confirm the AY of these 4 deliveries (we defaulted to archived 2025-26).
- **Needed to close:** Anish confirms with the Julien chain SPOC. If the deliveries are actually 2026-27, we move the backfilled Dispatches from the 2526 MOUs to the 2627 MOUs (`-2627-033/034/035/036`).

## D-012 Elgin vs Eglin canonical spelling (Julien Educational Trust)

- **Status:** open
- **Surfaced by:** W4-D.8 verification table for TWs row 6
- **Context:** Mastersheet says `Julien Day School, Elgin Road`; both `MOU-STEAM-2526-007` and `MOU-STEAM-2627-033` carry `Julien Educational Trust, Eglin Road`. The MOU spelling is a probable upstream typo.
- **Question:** Is the canonical road-name `Elgin` or `Eglin`? If `Elgin`, update both `mous.json` records + the hardcoded `CANONICAL_51_LIST` snapshot in `scripts/w4d-mastersheet-verification.mjs` and `scripts/w4c7-independent-verification.mjs`.
- **Needed to close:** Anish confirms; coupled with D-011 (same SPOC reach-out).

## D-013 St. Johns TWs row 17 duplicate verification

- **Status:** open
- **Surfaced by:** W4-D.8 Mastersheet backfill (TWs sheet row 17)
- **Context:** TWs row 17 lists Tinkrsynth + Pampered Plant + Tinkrpython + Tinkrexplorer for `St. Johns High School`. Cretile row 17 ALSO lists `St. Johns High School` with per-grade allocations. Anish-resolved during W4-D.8 to SKIP the TWs row as a suspected duplicate (operator may have conflated shipments; the TWs row's inline note "1 to 4 grade Cretile" supports this read). No Dispatch record was created from the TWs row; the Cretile delivery is the canonical record on `MOU-STEAM-2627-047`.
- **Question:** Was this one combined shipment (Cretile-only with the TWs SKUs noted incidentally), or did GSL separately deliver both TWs SKUs AND a Cretile per-grade kit set? If separate, we need to add the TWs Dispatch record on the same MOU.
- **Needed to close:** Anish confirms with Misba/Pradeep. If a separate TWs shipment happened, we backfill `DIS-BF-TWs-r17` on `MOU-STEAM-2627-047` (collision with the Cretile dispatch handled by using a different `installmentSeq` or a mixed-shape Dispatch).

## D-014 Contai Public School renewal status

- **Status:** open
- **Surfaced by:** W4-D.8 Mastersheet backfill (Cretile sheet row 15)
- **Context:** Cretile row 15 records a Cretile delivery to `Contai Public School` on 2026-04-15. The active 51-list has NO Contai entry; archived 2526 has `MOU-STEAM-2526-011 Contai Public School` (jaccard 1.00). Anish-resolved during W4-D.8 to QUARANTINE because the renewal status is uncertain (April 2026 is the start of the 2026-27 AY but no 2627 MOU exists for Contai).
- **Question:** Did Contai renew for 2026-27?
  - If yes: import the new 2627 MOU upstream + re-attach this Cretile delivery as `DIS-BF-Cretile-r15` on the new active MOU.
  - If no: the April 2026 delivery was a final fulfilment of the 2025-26 MOU; backfill `DIS-BF-Cretile-r15` onto `MOU-STEAM-2526-011`.
- **Needed to close:** Anish confirms with Contai SPOC. The Mastersheet Cretile data + Anish's resolutions JSON in `scripts/w4d-mastersheet-mutation.mjs` together show the full history; round 2 triage just needs the renewal answer to pick which path.

---

## How items leave this registry

1. Round 2 testing email at end of W4-I includes a "deferred items triage" section that reads from this file (open + triaged).
2. Anish replies with resolutions inline.
3. The relevant code/data change lands in a follow-up commit; the entry status moves to `resolved`.
4. Resolved entries stay for audit history; do not delete.
