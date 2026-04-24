# GSL Ops Automation — Ground-Truth Data Report

**Date:** 24 April 2026
**Prepared by:** Claude (claude.ai session) for Anish Dutta
**Sources:** 3 xlsx files uploaded 24 April 2026 alongside the handoff doc
**Purpose:** Ground the `/office-hours` and `/plan-eng-review` artifacts in what the data actually says, not what the handoff *assumed* it says. This replaces part of the Shruti-shadow step — the part that can be answered by looking at the files — and scopes the remaining questions that still need a human.

---

## 0. Executive summary — top findings that bend the plan

Ranked by how hard each one pushes against a decision already locked in the handoff.

| # | Finding | Plan impact |
|---|---|---|
| 1 | **SPOC DB is already in hand** — not "still to collect" as the handoff says. 57 schools across 3 regions with trainer assignments and 10 embedded regional-CC rules. | The email-notification engine in Phase 1 **must** respect CC rules from day one or it regresses from today's practice. Changes ping-cadence design from "email SPOC" to "email SPOC + regional-CC rule lookup". |
| 2 | **No shared school ID across the 4 data sources.** MOU file, SPOC DB, TW tracker, Cretile tracker all join on school name, and the names don't agree. "K.E. Carmel School,Amtala" / "K.E. Carmel-Amtala" / "K E Carmel School, Suri" are THREE different representations for TWO different schools. | Import strategy needs a deterministic schoolId + a human-reviewed fuzzy-match pass at go-live. Trying to auto-match is the exact "never auto-match" rule the handoff applies to payments — same principle applies here. |
| 3 | **The MOU file contains at least one multi-school MOU.** Narayana Group of Schools West Bengal = 7950 students, single row. That's a chain, not a school. | Phase 1 data model cannot assume `MOU → 1 School`. Need either (a) `MOU → School` with a group-MOU grouping, or (b) explicit split-at-actuals. Affects Installment model (one invoice per school or one per group?) and Dispatch model (one PO per delivery address or one per MOU?). |
| 4 | **Several MOU schools are already partway through the ops pipeline today.** 8 of the 24 2026-04 MOU schools have rows in the Cretile delivery tracker, some marked "Delivered". | The one-time Excel import at go-live cannot treat all MOUs as "stage 1 — just signed". It must set the current stage per school based on the tracker. "Stage at import" is a new field that needs rules. |
| 5 | **51 schools in SPOC DB have no 2026-04 MOU entry.** They're legacy ops — earlier MOUs, current obligations, active delivery/training in progress. | Phase 1 scope decision: do legacy schools get imported too? If yes, we don't have their MOU documents, just their current-state. If no, the app is incomplete from day one (ops team still opens Excel for legacy schools = two systems of truth, the exact anti-pattern). **This is an open question that needs Ameet's call, and it wasn't in the handoff's list of 6.** |
| 6 | **Phone numbers in the MOU file are stored as Excel numbers** for 4 rows, which means they've lost leading zeros and appear as scientific notation when read naively (e.g., `8.777053004E9`). | Import script must force-read phone columns as string. Trivial to fix if caught, silent bug if missed. |
| 7 | **"Account Owner" column in the MOU file does not consistently mean "sales owner".** Row 9 has `BIT GLOBAL SCHOOL` in that field (a school name, not a person); row 10 has `NITIN TOMAR` (the school's own director, who self-submitted); row 2 has `Father V T Jose` (the school's principal). | The MOU → sales-owner link cannot be trusted from the Google Form. Sales-owner-to-school mapping (already flagged in handoff as "still to collect") is the authoritative source; the MOU field is advisory. |
| 8 | **The "commitments register" (Sheet1 in the mastersheet) is essentially empty** — 2 rows, both for TURA (Meghalaya) schools, both pending approval from Pratik/Shashank. | Cross-verification of commitments against actuals works in the steady state, but at go-live there is almost no back-catalogue of commitments to compare against. Verification starts from the next MOU forward, not retroactively. |
| 9 | **Inventory data already exists (Current Inventory sheet)** with per-grade Cretile stocks, per-SKU TinkRworks stocks, and shortage flags. Handoff marks inventory forecasting as Phase 2. | A read-only inventory view in Phase 1 avoids abandoning the existing spreadsheet. Shortage flags (Grade 5 Cretile: have 14, need 17 → short 3) today drive dispatch decisions manually. If the Phase 1 dispatch UI doesn't surface these, it's a regression. Recommend surfacing *existing* inventory data as read-only; keep forecasting in Phase 2. |
| 10 | **Training mode abbreviations are inconsistent across the 4 files**: `GSL Trainer` / `Train The Trainer (TTT)` in MOU; `TTT` / `GSL T` in TW tracker; `TTT` / `GSL-T` in Cretile tracker. | Enum normalization needed at import. Minor but audit-relevant. |

---

## 1. MOU Signing Details — what's actually in there

**File:** `MOU_Signing_Details_2026-2027__Responses_.xlsx`
**Shape:** 1 sheet, 24 data rows × 16 columns
**Handoff claim:** "24 MOUs captured via Google Form (2026-02 onwards). Product mix: 18 GSLT-Cretile, 5 TinkRworks, 1 VEX. Training mix: 14 TTT, 10 GSL Trainer."

**Verified:**
- Rows: 24 ✅
- Product mix: 18 GSLT-Cretile, 5 TinkRwrks, 1 VEX ✅
- Training mode mix: 14 TTT, 10 GSL Trainer ✅

**Additional structural facts:**
- Student count range: **40 to 7,950**. Median 497. Total 20,014 students across all 24 MOUs.
- Timestamps are Excel serial dates (e.g., `46076.66`) ranging from early Feb 2026 to late April 2026 — confirms the handoff's "2026-02 onwards" statement.
- 15 distinct Account Owner values, but after normalizing case and removing obvious non-sales-people: ~10 actual sales owners. Top: Prodipto Banerjee (6 entries combining case variants), Ranotosh Ghosh (5).
- Thank-you-email date is typically 6 days after MOU timestamp, with one exception where the column contains an error string instead of a date: *"Receipients storage is full email failed, requested fro alternate email id from account owner."* (SD Sr Sec School, Rohtak). This means one school has no working email of record.

### 1a. Data quality issues — row-referenced

| Row | School | Issue |
|---|---|---|
| 9 | BIT GLOBAL SCHOOL | Account Owner column contains the school name, not a sales person |
| 10 | TATHASTU INOVATION | Account Owner = `NITIN TOMAR` = same as SPOC — this is a self-submission, not a sales-originated MOU |
| 11 | St Johns High School | POC phone stored as scientific-notation number: `8.777053004E9` |
| 13 | SD Sr Sec School | Thank-you email column contains an error message: delivery failed, no alternate captured |
| 15 | K.E Carmel (Suri) | POC phone format: `"Rev. Fr. Varghese T. CMI (Principal) - 76798 20957"` — name+phone glued together in one free-text field |
| 17 | MUTAHHARY PUBLIC SCHOOL | POC phone stored as scientific-notation number: `7.889380917E9` |
| 19 | Blue Angels Global School | POC phone stored as scientific-notation number: `9.953871747E9` |
| 20 | Young Horizons School | POC phone stored as scientific-notation number: `9.051244608E9` |
| 22 | Narayana Group of Schools West Bengal | **Multi-school MOU** — 7,950 students, single row, represents a chain |
| 22 | Narayana Group of Schools West Bengal | POC field: `"Debapriya Chakraborty & 98308 52037"` — name+phone with `&` separator |
| 24 | Christ Mission School | POC field begins with leading space; phone format: `" 77598 54794"` (space-separated, no country code) |

### 1b. Free-text contamination

The MOU Duration column mixes at least 11 distinct formats for what should be a controlled vocabulary:

```
3years, 3 Years, 2years, 2 years, 2 Years, 2 Year, 2 YEAR, 2 YEARS,
1 Year, 1st April 2026 to 31st March 2027, 1st April 2026 to 31st March 2028,
1st April 2026 To 31st March 2028, 1.0, 2.0
```

Two rows are stored as bare numbers (`1.0`, `2.0`) with no unit context. This parses cleanly if the system assumes "years", but the ambiguity is real.

### 1c. Implications for data model

- **MOU entity** cannot reliably populate its `salesOwner` field from the Google Form. Either (a) map via sales-person-to-school table, or (b) validate at import and require manual assignment where the Google Form value is non-plausible.
- **Installment plan is not in the MOU file.** No column captures "how many installments, what split, what due dates". This is either derived from a policy ("default 2 installments, 60/40 split, month-1 and month-6") or captured at the actuals-confirmation step. Handoff's open question #1 (payment-dispatch gate) is relevant here.
- **SPOC at signing ≠ SPOC for ops.** The MOU captures "Point Of Contact" (often the principal/director) and "Recipient details for the Thank You note". Neither of these is the ongoing ops-SPOC — that's in the separate SPOC DB (see §3). The import must not mistake the signing-contact for the ops-SPOC.

---

## 2. Mastersheet-Implementation — 4 sheets, varying quality

**File:** `Mastersheet-Implementation_-_AnishD.xlsx`
**Sheets:** `Delivery Tracker TWs` (14 schools, 40 cols) · `Delivery Tracker Cretile` (14 schools, 23 cols) · `Sheet1` (empty register, 2 pending rows) · `Current Inventory`

### 2a. Delivery Tracker TWs (TinkRworks)

14 schools, **all in West Bengal region** (Kolkata / Howrah / Durgapur / Kalyani / Baruipur / Madhyamgram). Column structure captures **per-school × per-product kit counts** for 14 distinct TinkRworks SKUs:

> Tech A Sketch · Steam Academy · Weather Station · Smart Lamp · Tinkrsynth · MorseCoding · Pampered Plant · Launchpad · Art Electric Grade 1-2 · Art Electric Grade 3-5 · Push Pull Pin · Tinkrpython · TinkrBotScout · Tinkrexplorer

- Every row has a primary SPOC with phone — no missing contacts on this sheet.
- Training model normalized to `TTT` or `GSL T` (abbreviated).
- Delivery Status for all 14 rows is `Delivered`.
- Bottom totals row aggregates per-SKU units dispatched.
- `Remark` column contains partial-delivery notes — e.g., *"Cretile class 9, 10 kits"*, *"Grade 6-8 Vex GO Large Bundle-VEX is in transit"* — meaning some schools have mixed-product deliveries across both tracker sheets.

**Key insight:** these 14 schools are not the 2026-04 MOU batch. Only 3 overlap (Swarnim International, St Paul's Boarding, St Johns). The rest are legacy 2024–25 schools already in active service. **This is the legacy-schools problem (Finding #5) made concrete.**

### 2b. Delivery Tracker Cretile

14 rows, **dispatch-centric** (keyed on `Date Of Request Raised`). Different schema from the TW tracker:

- Per-row structure: `Sr.No`, `Date Of Request Raised` (Excel serial), `School Name`, `Address`, `Model` (TTT/GSL-T), `SPOC Name`, `Email`, `Phone`, `Grade 1` through `Grade 10` (kit counts per grade), `Total No of Students`, `Rechargable Batteries`, `Status of delivery`, `Warehouse`.
- **Status values observed:** `Delivered`, `IN transit`, `Delivery by 21st April`, `Delivery by 25th April`.

Note: the handoff's state machine is `PO Raised → Dispatched → In Transit → Delivered → Acknowledged`. Today's data has:
- No explicit `PO Raised` state (assumed pre-existing before the tracker row appears)
- No explicit `Dispatched` state (skipped to "In Transit")
- A **promised-delivery-date state** (`Delivery by 21st April`) not in the handoff's state machine — effectively a sub-state of "Dispatched" with an SLA date
- **No acknowledgment data anywhere** — the handoff makes school-acknowledgment mandatory; today it's not captured

One school (`B.D. Memorial Jr. School`) appears in the Cretile tracker as **4 separate rows** (Bansdroni / Golf Garden / Garia / Vijaygarh) — i.e., one request for a 4-branch chain was split into 4 delivery rows. Precedent for handling Narayana Group.

### 2c. Sheet1 — "TO BE FILLED POST DISCUSSION WITH SALES"

This is the commitments-register Pratik/Shashank approval sheet mentioned in the handoff. Today it has exactly 2 pending-approval rows, both Hirak T / TURA / Meghalaya:

1. EMBEE ROSEBUD HR.SEC SCHOOL — Tura, Meghalaya
2. THE LEARNING SANCTUARY — Tura, Meghalaya

Columns: `SALES REP · SCHOOL NAME · SCHOOL LOCATION · STATE · COMMITMENTS MADE TO SCHOOL · ANY OTHER REQUIREMENT FROM SCHOOL WHICH IS OUT OF GSL SCOPE · APPROVAL FROM PRATIK · APPROVAL FROM SHASHANK · RECCE STATUS · GSL Model`

Both rows have only the first 5 cells populated. No recorded approvals. This tells us: **the commitments-approval process either isn't being systematically captured today, or it's being captured elsewhere (WhatsApp, verbal, email).** The handoff's cross-verification matrix assumes commitments are recorded — in practice, they're not.

### 2d. Current Inventory

**Cretile grade-level stocks:**

| Grade | On hand | Required | Shortage |
|---|---|---|---|
| Grade 3 | 12 | — | — |
| Grade 4 | 14 | — | — |
| Grade 5 | 14 | 17 | **-3** |
| Grade 6 | 26 | 11 | +15 |
| Grade 7 | 53 | 9 | +44 |
| Grade 8 | 24 | 14 | +10 |
| Grade 9 | 12 | 12 | 0 |
| Grade 10 | 13 | 13 | 0 |

**TinkRworks per-SKU stocks:** 10 SKUs tracked with quantities. `STEAM:- TinkRsynth Mixer PCB = 0` with note *"we don't have this in our inventory"*. `STEAM:- TinkRbot Scout Project Sample = 4285` (large stock). Sidebar notes: *"post april due to chinese leave"* — supply timing signal.

**Implication for Phase 1:** the dispatch UI should surface `on-hand - committed-but-not-dispatched` for the specific SKUs a school needs, before allowing a PO to be raised. Not forecasting — just reflecting what's in this sheet.

---

## 3. School SPOC Database — already exists, already rich

**File:** `SCHOOL_SPOC_DATABASE.xlsx`
**Sheets:** `South-West` (23 schools) · `East` (19 schools) · `North` (15 schools) — **57 total**
**Handoff claim:** "Still to be collected from the team"
**Reality:** collected, regional, with embedded CC-routing rules

### 3a. Column structure (consistent across 3 regions)

`Sr No · School Name · Location · Sub Location · Trainer Assigned · Point of contact Name · Designation · Phone Number · Mail ID · Remark`

### 3b. Embedded CC rules (critical for ping-engine design)

These are written as free-text above the header row on each sheet:

**South-West (5 rules):**
1. Keep Suresh and Pallavi in Cc for Raipur, Pune, Nagpur Schools
2. Keep Balachandran and Pallavi in Cc for Bangalore Schools
3. Keep R. Balu and Rajesh in Cc for Tamil Nadu Schools
4. Keep Kranthi and Pooja Sharma in Cc for Hyderabad Schools
5. Keep Shushankita in Cc for Schools in Maharashtra and all TTT Schools

**East (2 rules):**
1. Keep Prodipto, Avishek, Deepjyoti in Cc while sending the welcome note for East Schools
2. Keep Shushankita in Cc for Schools in all TTT Schools

**North (3 rules):**
1. Keep Roveena, Pooja Sharma from Sr.no 1 to 7 in Cc while sending the closing letters for East Schools *[sic — says "East" but rule is on the North sheet — ambiguous]*
2. Keep Sahil Sharma, Pooja Sharma in Cc for GR International School
3. Keep Shushankita in Cc for all TTT schools

**Rule patterns observed:**
- Region + city combinators (South-West sheet rules 1–4 are sub-region)
- Training-mode combinators (TTT → CC Shushankita, every region)
- Positional rules (North rule 1: "Sr.no 1 to 7")
- Per-school exceptions (North rule 2: single school)
- **Context-scoped rules** (East rule 1: only "when sending the welcome note", not every communication)

This cannot be modeled as a flat `{region → cc_list}` mapping. It needs:
```
CcRule {
  id
  scope: region | subRegion | school | trainingMode | sr-no-range
  scopeValue
  context: welcome-note | closing-letter | all-communications | installment-ping | dispatch-notify
  ccUsers: [User]
}
```
And a resolver that unions all matching rules at send-time.

### 3c. Data quality issues in the SPOC DB

| Row | Region | Issue |
|---|---|---|
| 18 | East | `Rishi Arbindo Memorial Academy` — no SPOC name, 2 emails with HTML-style wrapping: `"schoolofficial.rama@gmail.com" <schoolofficial.rama@gmail.com>; "office.rama9@gmail.com" <office.rama9@gmail.com>` |
| 19 | East | `Sri Ram Narayan Singh Memorial High School` — Sr No column is blank |
| 14 | North | `Jaffaria Academy of Modern Education` — 4 SPOCs crammed into one cell; 4 emails comma-separated; one email is `hassan@gmail.com` (placeholder, almost certainly wrong) |
| 17 | East | `The Scottish Church Collegiate School` — phone column is blank |
| 6 | North | `SD Senior Secondary School` — phone and email both blank |
| 10 | South-West | `St Anns Grammar School` and row 11 `The Secunderabad Public School` share the same phone number `7680880860` and SPOC `Vidya mam` — possibly a school cluster with shared reception |
| 9 | North | `GR International` — Location field says `Mahendargarh`, Sub Location field says `Haryana` (misaligned — Haryana is a state, should be in Location) |

### 3d. SPOC-DB ↔ MOU-file overlap

Fuzzy-match attempt (case-insensitive, punctuation-stripped, substring either direction): **8 of 24 MOUs appear to match a SPOC-DB entry.** But on manual review at least one of those 8 is a false positive: `Don Bosco School Krishnanagar` in the MOU matched `Don Bosco School, Bandel` in the SPOC DB — these are **different schools** (Krishnanagar and Bandel are different West Bengal towns). The actual overlap after human review is closer to 7. **Auto-matching at import will produce false positives.**

### 3e. Trainer Assigned field — multi-value

Some schools have multiple trainers assigned, in various formats:
- `Likhitha Komirishetty  Umesh Bonam` — space-separated, no delimiter
- `Sangeetha Nanna, Shiva Eppa, Umesh Bonam` — comma-separated
- `Kunal Sharma & Ajmal Hussain` — ampersand-separated
- `TT - Yash Kapoor` — TT prefix (presumably "Trainer of Trainers"?)
- `Pooja som/ pooja sharma` — slash-separated, mixed case
- `Bijayata Sarkar & Angshulima Ray Chudhuri` — ampersand

So `Trainer Assigned` is a *multi-trainer field*, often with lead + support, and occasionally with a role marker. Data model: `TrainerAssignment { school, trainer, role: LEAD | SUPPORT | TT_MENTOR }`.

---

## 4. Schema & join-key analysis

### 4a. Available identifiers across files

| File | Available IDs | Shape of "school" |
|---|---|---|
| MOU file | None (Google Form timestamp as de-facto row ID) | Free-text "School Name" column |
| TW tracker | Sr No (per-sheet only) | Free-text "SCHOO" column + address column |
| Cretile tracker | Sr No (per-sheet) + Date Of Request Raised | Free-text "School Name" + address |
| SPOC DB | Sr No (per-region) | Free-text "School Name" + Location + Sub Location |

**There is no shared `schoolId`.** Every cross-file reference has to resolve by name match. Names are inconsistent. Location is sometimes available, sometimes not. Address is free-text and verbose.

### 4b. Recommendation for the import pipeline

Treat this as an ETL problem with a deterministic ID assignment phase:

1. **Extract + normalize:** pull all school mentions across all 4 files. Normalize name (case, whitespace, punctuation, "St/Saint", "School/Sch", etc).
2. **Propose match clusters** — group by normalized-name + location similarity (if both have location/address). Score each cluster.
3. **Human review** — present clusters to Anish/Pradeep/Shubhangi as a one-time go-live UI. Each cluster becomes one `School` entity with one canonical `schoolId`.
4. **Persist mapping** — keep the source-to-schoolId mapping in an audit-logged file. Future Google Form submissions flow through the same matcher; if unambiguous → auto-link; if ambiguous → queue for review (same pattern as payment reconciliation).

This is essentially **Reconciliation Helper for Schools**, applied once at import and then continuously for new submissions. The handoff's shortlist-helper pattern for payments generalizes directly.

### 4c. What's *not* a join-key problem

**Sales owner ↔ School mapping is cleaner than MOU Account Owner suggests.** The handoff already flags "sales-person-to-school mapping for current quarter" as a data item to collect. Once that table exists, the MOU Account Owner column becomes advisory only.

---

## 5. Re-visiting the 6 handoff open questions — with data in hand

| Q# | Open question | Data says |
|---|---|---|
| Q1 | Payment-to-Dispatch gate — absolute, or partial-proportional? | Current Cretile tracker has multiple "Delivery by [date]" entries that appear *before* full-installment payment (visible because the rows exist with SPOC/address/grade counts). **Current practice appears NOT to enforce absolute payment-1-before-dispatch.** Hard gate in Phase 1 = stricter than today. Worth confirming with Shubhangi whether this is a bug or a deliberate exception. |
| Q2 | Escalation fan-out — always to Ameet, or severity-gated? | No data on today's escalation cadence. Needs human input. Flag for call. |
| Q3 | Actuals drift >10% — auto-approve or Sales Head sign-off? | MOU student counts are already round numbers (350, 900, 500, 200, 100, etc.) — likely rounded up at signing. Expect >10% drift on most MOUs at first actuals confirmation. **If Sales Head sign-off is required, ~60%+ of new MOUs will trigger it.** That's a meaningful workflow load — might argue for auto-approve with audit note unless >25% drift. |
| Q4 | Bulk operations — 20 PIs at once, or one by one? | Current volume is low enough that one-by-one is fine. At 240 MOUs × 2 installments = 480 PIs/year, bulk ops = convenience, not necessity. Low-priority for Phase 1. |
| Q5 | SPOC direct access — Phase 1 or Phase 2? | SPOC DB has 57 schools already. Giving SPOCs a portal means building 57 auth accounts, email-verification, and a minimal UI. Recommend **Phase 2** — email magic-link "view status" could be Phase 1.5 if Ameet pushes, but not before the core pipeline is live. |
| Q6 | Feedback form — embedded or external Google Form? | No existing feedback data in any file. Greenfield. Embedded-with-magic-link matches the "single source of truth" principle. External Form fragments the data into another spreadsheet = exact anti-pattern. Recommend **embedded.** |

---

## 6. New open questions surfaced by the data (not in handoff's list)

| Q# | Question | Why it matters |
|---|---|---|
| Q7 | **Legacy schools — import or exclude?** 51 schools in SPOC DB are not in the 2026-04 MOU file. They have active trainers, active SPOC relationships, and some have active deliveries. | Phase 1 scope. If excluded, ops team still opens Excel for half their workload on day one. If included, we don't have their MOU documents to reference. |
| Q8 | **Multi-school MOUs (chain MOUs) — data model?** Narayana Group at 7,950 students; B.D. Memorial precedent in the Cretile tracker shows the ops team naturally splits these into per-branch delivery rows. | Does `MOU → 1 School`, or `MOU → N Schools`, or `MOUGroup → N MOUs → 1 School each`? Each choice cascades through Installment / Invoice / Dispatch. |
| Q9 | **Promised-delivery-date as a tracked state?** Today's Cretile tracker has "Delivery by 21st April" — an SLA-style state that lives between PO-raised and In-Transit. | Adds one state to the handoff's state machine. Minor, but design has to decide. |
| Q10 | **Acknowledgment backfill for legacy deliveries?** Today's trackers have no acknowledgment data. If we import legacy schools, we have no record of whether the school confirmed receipt. | Either (a) accept a one-time "assume acknowledged" migration note per pre-import delivery, or (b) email every legacy school to ask for retrospective acknowledgment at go-live. (a) pollutes the audit log; (b) is a customer-facing operation. |
| Q11 | **CC rules — how strict is the scoping?** The SPOC DB has a rule *"Keep Prodipto, Avishek, Deepjyoti in Cc while sending the welcome note for East Schools"*. "Welcome note" is one specific communication type. Does that mean they should NOT be CC'd on installment pings? Or is the scope loose? | Ping-engine behaviour. Affects whether CCs are communication-type-aware or always-on. |
| Q12 | **TinkRsynth Mixer PCB is out of stock.** One of the 2026-04 MOUs (TATHASTU INOVATION, Meerut, 2000 students, TinkRwrks) almost certainly needs this SKU. | Does the dispatch UI flag this at PO-raise time, or only when PO-dispatch is attempted? Ties to inventory-display question (Finding #9). |
| Q13 | **Retro-active auditing — what's the anchor?** Legacy schools have no MOU-recorded commitments, so the handoff's "every number tied to originating commitment" principle cannot apply retroactively. | Go-live policy: legacy imports are tagged `origin: migrated, preDataWarranty: true` and excluded from drift-detection until the first post-migration actuals cycle? |

---

## 7. What I can't answer from the data — items that still need the Shubhangi / Pradeep / sales-rep call

Kept deliberately short — these are the HIGH-RISK assumptions per your kickoff brief:

1. **Current practice on Payment-1-before-Dispatch.** Data suggests it's not absolute. Is that a bug or deliberate? (Q1)
2. **What happens today when actuals differ from MOU?** Verbal sign-off? Email? Silent update? (Q3)
3. **Who escalates to whom today?** The handoff's escalation matrix is parkеd. (Q2)
4. **Is the commitments-register (empty) actually used, or is there a shadow copy somewhere?** (§2c)
5. **Multi-school chain MOUs — is Narayana the only one, or is this a pattern?** (Q8)
6. **Legacy-school import decision — Ameet's call.** (Q7)
7. **CC rule scope** — is "welcome note" literal or representative? (Q11)

The other 6 open questions (Q4, Q5, Q6, Q9, Q10, Q12, Q13) I have data-grounded opinions on and have stated them above.

---

## 8. Correction to the handoff doc

For the next revision of `GSL_Ops_Handoff.md`:

- Line 186 — **remove** "SPOC contact database per school (name, email, phone, role)" from "Still to be collected". Replace with: *"SPOC database received 2026-04-24 — 57 schools across 3 regions; regional CC rules embedded in sheet headers; data-quality pass required at import."*
- Line 181 — **extend** the mastersheet summary: *"also contains Current Inventory (Cretile per-grade + TinkRworks per-SKU, with shortage flags) and Sheet1 (commitments register, 2 pending rows)."*
- **New section:** data-import reconciliation strategy — no shared schoolId; human-review cluster matching required.
- **Open questions list** — append Q7–Q13 above.

---

## 9. How this feeds the next step

When we move to the `/office-hours` artifact, the premises P1–P5 now have data-grounded challenges:

- **P1 (flat-file data model per entity).** Data confirms cross-cutting workload is dominant (regional CC rules, sales-owner pipelines, multi-product per school). P1 stands stronger than the handoff guessed.
- **P2 (hard Payment→Dispatch gate).** Data suggests **current practice is NOT absolute**. P2 needs the Shubhangi-call answer before it becomes a system rule.
- **P3 (email-only Phase 1).** Data confirms email is feasible — all 57 SPOC-DB schools have at least one email (with 3 exceptions noted in §3c). P3 stands, with email-quality exception handling for the 3 gaps + the 1 MOU bounce.
- **P4 (SPOC no direct access Phase 1).** Data supports P4 — giving 57 schools portal accounts is non-trivial and not required to close the immediate loop.
- **P5 (no auto-match on payments).** Data extends P5 — **no auto-match on school-identity matching either.** Both reconciliations use the same shortlist-human-confirm pattern.

New premise to add:
- **P6: One-time import is deterministic, not statistical.** Every school gets a schoolId through human review, not auto-fuzzy-match. Precedent: the payment-reconciliation rule scaled to entity resolution.

---

**End of Ground-Truth Data Report. Next step: `/office-hours` artifact, starting from these findings.**
