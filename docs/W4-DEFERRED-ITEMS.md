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

## D-015 SPOC DB coverage gap (67 schools without SPOC entries)

- **Status:** open
- **Surfaced by:** W4-E recon of `ops-data/SCHOOL_SPOC_DATABASE.xlsx`
- **Context:** The SPOC DB has 57 SPOC rows covering a subset of schools; the active 51-list plus the archived 92-list (143 unique schools across both cohorts) implies ~67 schools have no SPOC entry in the DB. W4-E.2 imports the 57 rows that exist; the gap becomes round 2 triage rather than blocking the W4-E build.
- **Question:** For the 67 schools without SPOC entries, do we (a) add SPOC capture as part of the school edit workflow during round 2 testing, (b) ask Misba to backfill the SPOC DB upstream, or (c) accept partial coverage as Phase 1 reality?
- **Needed to close:** Anish picks the path; if (a) or (b), schedule the follow-up work in W4-I or Phase 1.1.

## D-016 North sheet rule 1 typo ("East Schools" inside North file)

- **Status:** open
- **Surfaced by:** W4-E recon of SPOC DB North sheet, top-of-sheet rule 1
- **Context:** The North sheet's first top-of-sheet CC rule reads "Keep ... in Cc for East Schools", which is a Misba typo (the rule lives in the North file but references "East Schools"). Source-of-truth principle: the system mirrors source verbatim and does not silently auto-correct.
- **Question:** Confirm this is a typo (rule should say "North Schools") rather than a deliberate cross-sheet reference. If a typo: fix at source in the SPOC DB next refresh; the cc_rules.json entry mirrors the corrected source on next import.
- **Needed to close:** Anish confirms with Misba. Once fixed at source, re-run the SPOC DB import and the audit pass; the existing cc_rules.json entry updates in lockstep.

## D-017 SPOC primary/secondary heuristic for multi-POC schools

- **Status:** open
- **Surfaced by:** W4-E.1 SchoolSPOC schema design
- **Context:** The SPOC DB lists multiple POCs for some schools without explicit primary/secondary tagging. W4-E.1 ships with a "first-row-is-primary" heuristic on import: the first SPOC row encountered for a school sets `role: 'primary'`; subsequent rows set `role: 'secondary'`. This may not match Misba's mental model for schools where the first-row POC is the operational backup.
- **Question:** For each multi-POC school, is the first-row POC actually the primary contact, or should the order be inverted for some schools?
- **Needed to close:** Anish reviews the W4-E.2 verification table (which surfaces the heuristic-assigned role per row); flag any school where the order should be reversed. Round 2 retag swaps `role: primary` and `role: secondary` on the affected SchoolSPOC entries (single-line per-school audit entry; no FK change).

## D-018 Phase 2 proactive dispatch confirmation email to school

- **Status:** open
- **Surfaced by:** W4-E recon scope-trim
- **Context:** W4-E ships 4 reminder templates (intake chase, payment chase, delivery-ack chase, feedback chase). It does NOT ship a school-facing dispatch confirmation email triggered the moment Ops raises a Dispatch (i.e., proactive "your kit has been dispatched" notification). W4-E was already substantial; the 4 reminder scenarios cover Phase 1's manual cadence needs.
- **Question:** When Phase 2 begins, should the system send a proactive school-facing dispatch confirmation email automatically when Ops raises a Dispatch, or stay on the compose-and-copy reminder pattern?
- **Needed to close:** Phase 2 scoping conversation. If proactive: add a `dispatch-confirmation` CommunicationType, a compose lib, and a hook on `raiseDispatch.ts` that auto-composes on dispatch creation. Compose-and-copy stays for school-facing sends in Phase 1.

## D-019 SPOC DB rows for schools not in schools.json (15 rows)

- **Status:** open
- **Surfaced by:** W4-E.2 Phase 2 mutation (`scripts/w4e-spoc-import-mutation.mjs`); see `scripts/w4e-spoc-import-mutation-report-2026-04-28.json`
- **Context:** 15 SPOC DB rows quarantined because their school is either not in schools.json, ambiguous between two schools.json records, or the matcher cannot verify cleanly. Round 2 review decides whether to add a schools.json entry + re-import the SPOC, or accept as orphaned data.
- **Composition (15 rows):**
  - 3 original verification quarantines (no name match):
    - SW16 St Anns Grammar School (Secunderbad / Malkajgiri)
    - North16 MD Senior Secondary School (Jind / Pillukheda)
    - North17 Aryavart Public School (Hisar / Mirkan)
  - 4 Chennai cluster (Anish-confirmed distinct schools):
    - SW22 Sagayamadha matriculation school
    - SW24 PGS CBSE school
    - SW25 Donbosco matriculation school
    - SW26 Nabicrescent school
  - 1 East9 R.N. Singh Memorial Academy (Anish-confirmed distinct from East22 Sri Ram Narayan Singh High School)
  - 5 genuinely-ambiguous (Anish-confirmed not in schools.json):
    - East13 Morden HIgh School International (sic)
    - East19 Haryana International School
    - North7 Kautilya World Academy, Gurugram
    - North8 BGS Vijnatham
    - North9 The Shreeji School, Faridabad
  - 1 East11 St. John's School (Q1 contingency-2 demote): SPOC DB row matches both archived `SCH-ST_JOHN_S_SCHOOL` (2526) and active `SCH-ST_JOHNS_HIGH_SCHOOL` (2627 with intake + dispatch); ambiguous which record the SPOC belongs to.
  - 1 SW9 St.Xavier School Bhilai (conservative): `SCH-ST_XAVIER_S_SR_SEC_S` schools.json record has empty city + partial-name mismatch; round 2 confirms whether the same school.
- **Question:** For each row, decide (a) add a new school to schools.json with proper region / address data, or (b) accept as orphaned SPOC DB row with no schoolId tie.
- **Needed to close:** Anish reviews the 15 rows; resolutions feed a follow-up SPOC re-import that targets newly-created schools.

## D-020 Jaffaria Academy multi-POC parser (Hassan + Fiza unseparated)

- **Status:** open
- **Surfaced by:** W4-E.2 Phase 2 mutation; multi-POC expansion of North row 18
- **Context:** SPOC DB North row 18 (Jaffaria Academy of Modern Education, Kargil) lists 4 POCs in source data: Feroz Ahmad, Mr. Hassan, Fiza Banoo, Mohd Amin (the phone field has 4 entries; the email field has 4 entries). The pocName cell is comma-delimited but Hassan and Fiza are smashed without a comma between them: "Feroz Ahmad, Mr.Hassan (junr wing) Fiza Banoo, Mohd Amin(higher wing)". The W4-E.2 Phase 1 parser split into 3 entries (Feroz / Hassan+Fiza-smashed / Mohd Amin); Phase 2 imported all 3 with Feroz primary and the other 2 secondary.
- **Default-as-imported:** SchoolSPOC records `SSP-W4E-N-r18-1` (Feroz, primary) · `SSP-W4E-N-r18-2` (smashed Hassan+Fiza, secondary) · `SSP-W4E-N-r18-3` (Mohd Amin, secondary). The smashed entry's name field carries "Mr.Hassan (junr wing) Fiza Banoo" verbatim from source.
- **Question:** Confirm the 4-name interpretation and re-confirm primary designation. If correct, split entry-2 into Hassan and Fiza; reassign primary if Anish prefers a different name.
- **Needed to close:** Anish flags the 4-name split during round 2; a follow-up commit splits entry-2 into 2 SchoolSPOC records (Hassan + Fiza separately) using their individual phone + email tuples from the source cell. The parser fix lands once at the same time so future SPOC DB refreshes don't re-introduce the smash.

## D-021 CCR-NORTH-1-7 scope mismatch with SPOC DB header text

- **Status:** open
- **Surfaced by:** W4-E.3 audit pass (`scripts/w4e-cc-rules-audit-2026-04-28.json`, North#1)
- **Context:** SPOC DB North-sheet rule 1 source text: "Keep Roveena, Pooja Sharma from Sr.no 1 to 7 in Cc while sending the closing letters for East Schools." Literal contexts: `closing-letter`. Operational practice (Anish-confirmed 2026-04-28): regional leads CC on `all-communications` for Sr.no 1-7 North MOUs, not just closing letters. CCR-NORTH-1-7 in cc_rules.json is `all-communications` and stays unchanged.
- **Question:** Should the SPOC DB sheet header text be updated to match operational practice (i.e., "all communications" instead of "closing letters"), or should the system rule narrow to match the strict header interpretation?
- **Needed to close:** Anish asks Misba to update SPOC DB sheet header text to match practice (or confirm narrow interpretation is correct). The North-sheet "East Schools" typo from D-016 sits alongside this fix.

## D-022 CC rule additions deferred where SPOC DB header doesn't map to existing user IDs

- **Status:** open
- **Surfaced by:** W4-E.3 Phase 2 mutation (`scripts/w4e-cc-rules-mutation-report-2026-04-28.json`)
- **Context:** Three SPOC DB top-of-sheet CC rules name users who are not in `users.json` or `sales_team.json`. Per Anish's directive: do not fabricate ccUserIds. The rules are deferred until the named users are mapped to existing IDs (or new entries are added to `sales_team.json`).
- **Deferred rules (3):**
  - **CCR-SW-HYDERABAD** : header text "Keep Kranthi and Pooja Sharma in Cc for Hyderabad Schools". Neither "Kranthi" nor "Pooja Sharma" exists in `sales_team.json` or `users.json`.
  - **CCR-SW-MAHARASHTRA** : header text "Keep Shushankita in Cc for Schools in Maharashtra and all TTT Schools" (compound rule; Maharashtra portion). "Shushankita" not in `sales_team.json` or `users.json`.
  - **CCR-TTT-ALL** : derived rule covering training-mode TTT all-communications context (East#2 + North#3 + SW#5 TTT portion). Same Shushankita mapping gap. CCR-TTT-FEEDBACK stays narrow (feedback-request only) per Anish.
- **Partial-mapping noted on the 2 added rules (CCR-SW-TAMIL-NADU + CCR-NORTH-GR-INTERNATIONAL):**
  - CCR-SW-TAMIL-NADU header names "R. Balu and Rajesh"; only `sp-balu_r` is mapped. "Rajesh" not in `sales_team.json` or `users.json`. Partial CC list shipped with the rule.
  - CCR-NORTH-GR-INTERNATIONAL header names "Sahil Sharma, Pooja Sharma"; mapped to `sp-sahil` (single-name convention, unconfirmed match for "Sahil Sharma"). "Pooja Sharma" not mapped. Partial CC list shipped.
  - **sp-sahil tentative-mapping sub-note:** the sales_team.json record `sp-sahil` ("sahil", no last name, empty territories) is the only Sahil entry. The match to GR International's "Sahil Sharma" is heuristic only. Round 2: confirm GR International's "Sahil Sharma" === existing `sp-sahil`, OR is a different Sahil who needs a new sales_team / users record.
- **Question:** For each deferred / partial mapping, who is the canonical user (name, role, email, sales territory)? Should new `sales_team.json` entries be created, or existing `users.json` users mapped?
- **Needed to close:** Anish + Misba confirm the 4 missing names (Rajesh, Kranthi, Pooja Sharma, Shushankita) and the unconfirmed Sahil-Sharma mapping. Each resolution either adds a sales_team / users entry, or maps to an existing entry. Once mapped, the 3 deferred rules land via a follow-up cc_rules mutation; the 2 partial rules gain the additional ccUserIds.

## D-023 Phase 2 escalation reminder cadences (1st / 2nd / Nth chase)

- **Status:** open
- **Surfaced by:** W4-E.4 reminder lib design (`src/lib/reminders/detectDueReminders.ts`)
- **Context:** Phase 1 ships ONE reminder type per scenario (intake, payment, delivery-ack, feedback chase). The system does not track "1st reminder vs 2nd vs 3rd"; if the operator's first reminder gets no response, they manually re-trigger via the same `/admin/reminders` flow. The Communication record carries the queuedAt timestamp so re-triggers are visible in audit, but no formal cadence (e.g., "1st at day 7, 2nd at day 14, escalate at day 21") is encoded.
- **Question:** Do round 2 testers report friction with manual re-triggering? Should Phase 2 add a per-kind cadence (1st reminder thresholds → 2nd reminder thresholds with stronger language → escalation creation at the final tier)?
- **Needed to close:** Round 2 feedback. If yes, extend `reminder_thresholds.json` with cadence steps and add a `reminderTier` column on the Communication record so the detector skips kinds where the most recent reminder is fresh enough.

## D-024 Sales-rep User onboarding for notification fan-out

- **Status:** open
- **Surfaced by:** W4-E.5 trigger wiring (`composeReminder`, `recordReceipt` payment-recorded fan-out)
- **Context:** The notification fan-out maps `SalesPerson.email` to a matching `User.email` row to find the in-app notification recipient for a given MOU. Most current sales reps are modelled as SalesPerson records (sp-vikram, sp-balu_r, sp-sahil, etc.) but do NOT have User rows. Of the 10 testers in users.json, only Vishwanath G. (`vishwanath.g`) has both a SalesPerson + User pairing. Sales-owner notification fan-out silently skips the others.
- **Question:** As Phase 2 expands the tester pool to the actual sales team, should each rep get a User row so notifications fire? Should the SalesPerson schema gain a `userId` column for explicit linkage instead of email matching?
- **Needed to close:** Phase 2 onboarding plan: add User rows for each active sales rep; optionally migrate SalesPerson -> users foreign key from email match to explicit userId. The current email-match heuristic works but is fragile (a sales rep with a slightly different email between sales_team.json and users.json would silently skip).

## D-025 Phase 2 real-time notification polling

- **Status:** open
- **Surfaced by:** W4-E.6 NotificationBell design choice
- **Context:** Phase 1 notifications are refresh-on-page-navigation. The bell badge updates only when the user navigates between pages or hard-reloads. There is no setInterval / setTimeout polling, no Server-Sent Events, no WebSocket. Reasoning: the manual-trigger pattern means most notifications fire as a side effect of an operator-initiated action, and the operator typically navigates after the action; the badge updates on that navigation.
- **Question:** Do round 2 testers report friction with refresh-only? In a multi-tester pilot, an Ops user may need to know about a Sales-submitted DR within seconds rather than on next page navigation.
- **Needed to close:** Round 2 feedback. If yes: add a 30s setInterval poll on the bell client component (cheap; reuses the existing notifications.json read), OR upgrade to SSE / WebSocket (heavier; needs a server-side subscription manager). The Phase 1 architecture leaves the door open for either path.

## D-026 W4-F SalesOpportunity workflow definition (Pratik + Shashank interview)

- **Status:** open
- **Surfaced by:** W4-F.1 / W4-F.2 / W4-F.3 minimal-container build per Anish option C
- **Context:** W4-F shipped a SalesOpportunity entity with free-text status / recceStatus / gslModel / approvalNotes fields and no state machine, approval workflow, or conversion-to-MOU flow. The Mastersheet Sheet1 source was a 2-row stub template with zero operational data; building the workflow without operational input would embed assumptions about Pratik's actual sales process that may not match reality. The post-round-2 conversation with Pratik (SalesHead) and Shashank should ground the formalisation in lived experience, not speculation. Container today captures real data so the interview has actual examples to ground in (rather than asking abstractly "what should the workflow be?").
- **7 sub-questions for the interview:**

  - **D-026.a Pre-MOU workflow states.** What states should opportunities move through, in the operator's lived language? Examples we speculated (recce-needed, recce-done, proposal-sent, awaiting-approval, approved, lost) are placeholders; capture Pratik / Shashank's vocabulary verbatim. Are some states sequential and others optional? Are there parallel states (e.g., recce + proposal can happen concurrently)?

  - **D-026.b Approval flow architecture.** Sequential dual (Pratik then Shashank), parallel (both can approve any time), role-context-specific (different approvers for GSL-Trainer model vs TTT model), threshold-based (deal size or programme triggers different routes), or something else? Document any conditions that change routing (deal size, programme, region, school type). The Mastersheet has "APPROVAL FROM PRATIK" and "APPROVAL FROM SHASHANK" as separate columns; whether they are sequential or parallel is not visible from the column headers.

  - **D-026.c Conversion-to-MOU trigger.** When the SalesOpportunity reaches the post-approval point, when does it become an MOU? Manual click after both approvals (sales rep navigates to a Convert button), automatic on second approval, sales-rep-initiated regardless of approvals, or something else? Where does the resulting MOU draft land (Pending Signature stage on the kanban, or somewhere new)?

  - **D-026.d Recce status vocabulary.** What values do operators actually use for recceStatus? Capture the free-text values from `sales_opportunities.json` post-round-2 and normalise to an enum. The W4-F.3 audit log (verbatim before / after on every status edit) provides the raw data; the interview just classifies.

  - **D-026.e GSL Model vocabulary alignment with `TrainerModel`.** Existing MOU schema has `trainerModel: 'Bootcamp' | 'GSL-T' | 'TT' | 'Other'`. SalesOpportunity has free-text `gslModel`. Are these the same dimension (i.e., the trainer model decided pre-MOU should match the trainer model on the eventual MOU), or are they different concepts? If same, normalise to one enum. If different, define the new enum's values.

  - **D-026.f Ownership transfer mechanism.** How often does sales-rep reassignment happen on a pursuing opportunity? Current Phase 1 fallback: Admin / SalesHead intervenes via the edit form (changes `salesRepId` directly). Round 2 surfaces if reassignment frequency justifies a transfer-ownership action with audit attribution + notification fan-out to the new owner. Sub-question raised by Anish 2026-04-28: "edge case: SalesOpportunity ownership when SalesRep is reassigned or deactivated".

  - **D-026.g Vocabulary autocomplete migration.** Once D-026.a + D-026.d formalise the status / recceStatus enums, what is the migration path for existing free-text records? Auto-map prior values to nearest enum match (Levenshtein / fuzzy; risk of wrong assumption), operator manually triages each (high-friction, faithful), or hybrid (auto-map exact-string-equal cases; operator triages anything fuzzy). The W4-F.3 audit log carries every prior value so the migration is a one-shot script.

- **Needed to close:** A scheduled 30-60 minute interview with Pratik + Shashank during round 2. Output is captured as a follow-up batch (likely "W4.5-A" or similar) that builds the workflow against actual operational language, defines `sales-opportunity:approve-l1` / `approve-l2` / `convert-to-mou` permission Actions, lands the state machine in `editOpportunity`, and migrates existing free-text records to the new enums.

## D-028 Reorder thresholds (Misba/Pradeep operational input)

- **Status:** open
- **Surfaced by:** W4-G.1 InventoryItem schema design
- **Context:** Phase 1 ships every InventoryItem with `reorderThreshold: null`. Until set, low-stock alerts do NOT fire. The W4-G.5 lib treats null as "no threshold; never alerts." The first round of Misba/Pradeep edits sets real thresholds and the alerts go live.
- **Question:** What reorder threshold per SKU? E.g., does Cretile Grade 5 trigger an alert below 20 units? Tinkrpython below 100? Threshold defaults are operational decisions tied to lead times and supplier responsiveness; not visible from Mastersheet data.
- **Needed to close:** Misba/Pradeep set per-SKU reorderThreshold values during round-2 review or post-round-2 setup at /admin/inventory.

## D-029 Phase 2 stock history visualisation

- **Status:** open
- **Surfaced by:** W4-G.6 UI scope decision
- **Context:** Phase 1 InventoryItem.auditLog captures every stock edit + decrement, but /admin/inventory/[id] renders only the raw audit list. Operators wanting stock-over-time visibility (sparklines, monthly burn rate) must read the audit manually.
- **Question:** Do round 2 testers report friction with audit-only stock history? If yes, add a sparkline component to /admin/inventory/[id] that renders the lastN stock values from the audit log.
- **Needed to close:** Round-2 feedback. Implementation is small (audit log already has the data; component renders against it).

## D-030 Phase 2 reorder PO generation + supplier directory

- **Status:** open
- **Surfaced by:** W4-G.6 UI scope decision
- **Context:** Phase 1 W4-G.5 fires a low-stock notification but stops there; the operator manually raises a PO with the supplier off-system. No supplier directory entity, no PO entity, no auto-generated PO docx.
- **Question:** Does GSL want to bring PO generation on-system in Phase 2? Requires Supplier entity + PO entity + docxtemplater pattern (mirror the existing W4-D.5 dispatch template).
- **Needed to close:** Phase 2 scoping conversation. Likely lands as a separate W batch (e.g., W5-A) given the surface area.

## D-031 Phase 2 multi-warehouse stock locations

- **Status:** open
- **Surfaced by:** W4-G.1 schema design
- **Context:** Phase 1 InventoryItem represents a single source-of-truth stock per SKU. GSL operates from a single warehouse today; the schema does not track location. Phase 2 may need per-location stock if GSL expands to multiple warehouses (Bangalore vs Kolkata, etc.) or operates a forward-stocking buffer.
- **Question:** When GSL expands beyond a single warehouse, the schema needs a Location entity + per-location stock per SKU.
- **Needed to close:** No round-2 question; this is an architectural marker for whenever GSL's logistics footprint grows.

## D-032 Negative-stock policy revisit

- **Status:** open
- **Surfaced by:** W4-G recon decision (Phase 1 hard-block at insufficient stock)
- **Context:** Phase 1 W4-G.4 hard-blocks Dispatch creation when `requestedQty > currentStock` with reason `insufficient-stock`. Misba may prefer a softer policy (allow with warning + audit flag) for cases where Ops knows stock is en route from supplier.
- **Question:** Should the hard-block soften to "allow with operator-typed override reason" (similar to dispatch P2 override)? Round-2 surfaces if the hard-block creates frequent friction.
- **Needed to close:** Round-2 feedback.

## D-033 Mastersheet "TinkRworks - Reusable Kits 1330" header reconciliation

- **Status:** open
- **Surfaced by:** W4-G.2 verification table generation
- **Context:** Mastersheet Current Inventory sheet row 4 col E carries the literal string "TinkRworks - Resuable Kits" and col F carries 1330. This row is not a SKU; it is a section header / operator note. The 1330 figure does not reconcile with the column sum (~7243 across the 10 individual TinkRworks SKUs). The W4-G.2 verification skipped this row.
- **Question:** What does the 1330 represent? Demand projection for the season? Stale aggregate? A specific buffer count? Is the figure stale and should be removed/clarified at next Mastersheet refresh?
- **Needed to close:** Misba/Pradeep clarify 1330's meaning during round 2. If stale, update Mastersheet to remove or annotate the figure so future imports do not re-confuse.

## D-034 Push Pull Pin + Steam Academy stock placeholder

- **Status:** open
- **Surfaced by:** W4-G.3 mutation (programmatic placeholder rows)
- **Context:** Push Pull Pin appears in 6 Dispatch lineItems and Steam Academy in 1; both are absent from Mastersheet Current Inventory. W4-G.3 imported them with `currentStock: 0` and an audit note flagging "stock to be set by Misba/Pradeep at next inventory edit."
- **Question:** What is the actual current stock of Push Pull Pin and Steam Academy? Did Mastersheet omit them deliberately (e.g., they are consumed-on-issue samples not tracked) or by oversight?
- **Needed to close:** Misba/Pradeep set actual counts via /admin/inventory edit during round 2. If samples-not-tracked, the records may switch to `active: false`.

## D-035 Cretile per-grade demand markers ("Req: Grade N-M")

- **Status:** open
- **Surfaced by:** W4-G.2 verification table; W4-G.3 mutation preserves verbatim
- **Context:** 5 of 8 Cretile per-grade rows in Mastersheet carry "Req" annotations like "Grade 5-17", "Grade 6-11", "Grade 7-9", "Grade 8-14", "Grade 9-12". These are operator notes about pending requests / ad-hoc demand, not stock counts. W4-G.3 preserved them verbatim in `notes` field as "Mastersheet Req note: Grade 5-17" etc.
- **Question:** Should the system track per-grade demand explicitly via a Demand entity + per-Cretile-grade demand counter, or are these one-off operator scribbles that don't need formal modelling?
- **Needed to close:** Round-2 conversation. If formalised: extend InventoryItem with `pendingDemand: number | null` + lib that decrements demand on Dispatch creation. If not: continue treating as operator notes.

## D-036 Tinkrsynth tail-end stock decision

- **Status:** open
- **Surfaced by:** W4-G.3 mutation; Anish row-by-row resolution (active: false sunset)
- **Context:** Tinkrsynth (3 units; no Dispatch corroboration; no inline note). Anish W4-G.3 decision: AUTO-IMPORT with `active: false` (sunset) per schema-design-intent rather than QUARANTINE. The 3 tail-end units sit in inventory marked sunset until operational decision lands.
- **Question:** Should the remaining 3 Tinkrsynth units be (a) shipped as a final dispatch to a school still expecting them, (b) written off as obsolete and audited as a stock loss, or (c) reactivated to active: true if Tinkrsynth is still in the GSL roadmap?
- **Needed to close:** Misba/Pradeep operational decision. The schema's sunset mode preserves reactivation flexibility either way.

## D-027 Phase 1.1 AY rollover verification

- **Status:** open
- **Surfaced by:** W4-F.2 OPP id sequence design (`OPP-{AY-short}-###` per academic year)
- **Context:** GSL's academic year runs April-March. Several entity ID sequences are AY-prefixed: `OPP-2627-###` (W4-F.2), `MOU-STEAM-2627-###` (upstream gsl-mou-system), DispatchRequest `DR-...` (W4-D.2; not AY-prefixed but per-MOU), IntakeRecord `IR-W4C-###` (W4-C.4 backfill), Dispatch `DSP-{mouId}-...` and `DIS-BF-{sheet}-r{row}` (W4-D.1 / W4-D.8). The first live AY rollover in this system is April 1, 2027, when the system flips from 26-27 to 27-28. New OPP records on or after April 1, 2027 should use the `OPP-2728-###` prefix and the sequence should reset to 001 cleanly.
- **Verification scope (Phase 1.1, before April 2027):**
  - OPP id sequence: confirm `nextOpportunityId` reads from existing records and resets correctly (the function uses `academicYearShort(now)` so the AY recomputes per call; new records on April 1, 2027 should land as `OPP-2728-001`).
  - MOU id sequence: confirmed handled by upstream gsl-mou-system; verify the mtime guard + sync-runner does not interfere.
  - DispatchRequest, Dispatch, IntakeRecord, Communication, Notification, SchoolSPOC, MagicLinkToken: most use timestamp-compact or UUID id schemes that are AY-agnostic; verify no surprises.
- **Needed to close:** A Phase 1.1 verification task in March 2027 (one month before rollover) that drives a synthetic clock-shift test through every entity creation surface to confirm all sequence counters reset cleanly. No round-2 question; this is a reminder for the Phase 1.1 maintenance batch.

---

## How items leave this registry

1. Round 2 testing email at end of W4-I includes a "deferred items triage" section that reads from this file (open + triaged).
2. Anish replies with resolutions inline.
3. The relevant code/data change lands in a follow-up commit; the entry status moves to `resolved`.
4. Resolved entries stay for audit history; do not delete.
