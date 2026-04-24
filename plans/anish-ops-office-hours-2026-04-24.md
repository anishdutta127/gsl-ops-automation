# Office-hours output: GSL Ops Automation Phase 1 premise pressure-test

Generated via /office-hours framework (startup mode, intrapreneurship-adapted) on 2026-04-24.
Branch: main. Repo: anishdutta127/gsl-ops-automation. Status: DRAFT.
Mode: Startup (pre-greenlit scope; premise-challenge emphasis, not opportunity-discovery).
Supersedes: (first design on this branch)

## Scope framing

This ceremony pressure-tests six named premises. The CEO-approval question ("should we build this") is closed: exec brief 2026-04-24, Ameet signed off. Forcing questions Q1-Q6 (Phase 2A of the skill) run lightly; the weight sits in Phase 3 (Premise Challenge) on P1-P6.

Inputs:
- Six premises from the handoff (P1-P5) plus ground-truth report §9 (P6).
- Eight locked decisions (D1-D8) from step-3 reference reads. Treated as input, not subject.
- Stakeholder intel captured so far: Ameet (CEO priorities, accuracy > smoothness > delight); Misba (escalation matrix, CC-rule-ignore framing Anish overrode); Pranav (pending interview on actuals-drift detail); Shubhangi / Pradeep / one sales rep (all pending the HIGH-RISK verification call).
- Evidence base: `ops-data/GSL_Ops_Handoff.md`, `ops-data/GSL_Ops_Automation_Executive_Brief.pdf`, `ops-data/ground-truth-data-report-2026-04-24.md`. Referenced by section number, not re-pasted.

Out of scope for this ceremony:
- Locked decisions D1 through D8 (re-debate forbidden; tensions recorded, not resolved).
- Open questions Q-A through Q-I (defer to /plan-eng-review).

Stakeholder voices NOT yet gathered (flagged as HIGH-RISK placeholders throughout):
- Pranav (finance detail on actuals-drift).
- Shubhangi (accounts lead), Pradeep (ops lead), one sales rep: the Shruti-shadow replacement call.

## Problem statement

GSL signs MOUs with schools. Post-signing, a long chain has to run without breaking: actuals confirmation, dynamic recalc, proforma invoice, payment reconciliation, kit dispatch, training delivery, feedback. Today this runs on WhatsApp, Excel double-entry, and individual memory. At 24 MOUs per year the cracks are visible. At Ameet's 240+ target the process breaks.

Ranked success criteria (Ameet, handoff line 25):
1. Accuracy of info flow: one source of truth, every number tied to its originating commitment, every change audited.
2. Smoothness of implementation: no manual chasing, automated cadence, zero spreadsheet double-entry.
3. School delight: visible progress, predictable milestones, escalation available at any stage.

## Demand evidence (Q1)

Ameet, CEO, personally named this the top system of the year. 148 MOUs migrated from Excel into the MOU system already prove the scale problem: at 24 new MOUs per year Shubhangi and Anita (accounts) can carry the load on memory plus spreadsheets. At 240, they cannot.

Specific evidence from ground-truth report §2a: today's TinkRworks delivery tracker alone has 14 active schools with inconsistent dispatch-state labels (`Delivered`, `IN transit`, `Delivery by 21st April`). The ops team is already tracking multiple states by free-text. At 10x volume this becomes unindexable.

Red flag absent: this is not a "VCs are interested" signal. It is an operational-pain signal from the team already running ops. Shubhangi flagged payment-to-PI reconciliation as her #1 pain point in the MOU brief (see `gsl-mou-system/CLAUDE.md` lines 38-39). Same team sits downstream of signed MOUs; same pain scales with volume.

## Status quo (Q2)

Current workflow per handoff lines 14-22 and ground-truth §2a-c:
- Sales signs MOU via Google Form. Accounts gets pinged via WhatsApp.
- Accounts raises Proforma Invoice manually in a Tally-adjacent spreadsheet.
- Dispatch is a shared Excel (Cretile tracker) updated by ops.
- Payment reconciliation: Shubhangi matches bank statement to school by memory plus Excel lookup.
- Feedback: nothing captured systematically.
- Escalations: WhatsApp group, no log.

Cost: unmeasured but visible. MOU's CLAUDE.md flags Shubhangi's #1 pain point as reconciliation. Ground-truth §2b documents dispatch-tracking fragmentation (one Excel sheet per product line, no unified view). §2c shows the commitments-register (2 rows pending Pratik/Shashank approval) captures a tiny fraction of reality; the rest is WhatsApp and verbal.

Red flag absent: people ARE doing things, badly, at cost. The pain is real.

## Target user and narrowest wedge (Q3, Q4)

Primary user: **Shubhangi Gajakosh, Chief Manager Finance & Accounts** (handoff line 249). She raises PIs, reconciles payments, blocks invoices when actuals are unconfirmed. Career signal: "accounts books that close cleanly on time." Failure mode: month-end reconciliation running into week 2 because one Rs 2.5L payment cannot be matched to a school.

Secondary user: **Pradeep Ragav, Chief Manager Operations** (handoff line 248). He raises vendor POs and confirms dispatches. Career signal: kits arrive on time, with acknowledgement. Failure mode: a school calls Ameet directly because kits did not land.

Narrowest wedge (Q4, intrapreneurship-adapted, reframed as "smallest feature set Ameet would call the project working"):

From the exec brief cross-verification matrix, the minimum viable demo is the **actuals-confirmation to PI-raise gate**. If we can show Ameet:
- A new MOU imported from the MOU system (D1 pull model).
- Three-ping cadence triggers fired (email only, P3).
- Sales plus Ops both confirm actuals and Finance unlocks PI raise (cross-verification matrix, exec brief).
- PI template auto-generates with GSTIN prefilled.

That alone is the heart of the system. Everything else (dispatch gate, training tracking, feedback, dashboard) layers on top.

Non-scope for minimum viable: feedback forms, trainer scheduling, SPOC portal, dashboard analytics. These are Phase 1.1 through 1.5, not the demo.

## Observation (Q5)

No real-world user observation yet. This is pre-shadow, pre-call. The Shruti-shadow replacement plan schedules observation as a HIGH-RISK call with Shubhangi, Pradeep, and one sales rep before Week 1 code lands.

Pre-observation surprises already captured in the ground-truth report:
- §3b: CC rules exist as embedded free-text rules in the SPOC DB ("Keep Shushankita in CC for all TTT Schools"). Misba (ops) described these as "manual bookkeeping, skip it." Anish overrode: encode all 10 rules with a per-rule enabled toggle. An observation of observation: Misba's working assumption is that the manual effort is the rule's only purpose; the rule's actual purpose (zonal visibility, training-team loop) is invisible to her because the CC system has always just worked.
- §3e: trainer assignments in SPOC DB are multi-value in five different delimiter formats (space, comma, ampersand, slash, TT-prefix). The ops team has never normalised this. Each format represents unstated structure (lead + support, TT mentor) that emerged organically.
- §1a rows 9-13: the Account Owner column in the MOU Google Form contains a mix of school names, SPOC names, and one failed delivery email. Google Form input hygiene reflects a team that treats the form as a notebook, not a database.

These surprises do not contradict the handoff's design but they strengthen P6 (deterministic not statistical import) and warn that Ops cannot trust inherited data shapes at face value.

## Future-fit (Q6, intrapreneurship adaptation)

"Does this system survive a reorg?"

Structural risks:
- **Misba moves roles or leaves.** Escalation matrix (Misba intel A from kickoff) is encoded as lane-plus-level data; new ops head slots in with a data update, not a code change. Survives.
- **Ameet deprioritises Ops automation.** CEO sponsorship is the political air cover. If Ameet's attention shifts, Shubhangi and Pradeep are still the primary users and the reconciliation pain is still real. System persists by operational value, not executive mandate. Survives.
- **Arvind Mafatlal Group decides to multi-tenant.** Handoff line 158 scopes this as Phase 3. The `config/company.json` pattern from HR (HR CLAUDE.md line 53) carries forward. Survives, with the known 1-2 week migration tax HR already priced in.
- **Excel reappears as a "backup" system.** This is the handoff line 55 anti-pattern ("one source of truth"). Requires continuous social pressure to avoid, not a technical guarantee. Medium risk; mitigated by making the app strictly better than Excel at cross-cutting queries.

Not a rising-tide argument. The value prop is operational leak-plugging, not market growth catch-up.

---

## Premises (verbatim from the kickoff brief)

**P1.** Flat-file-per-entity data model (not graph-aggregate). Dominant workload is cross-cutting (role pipelines, dashboards, reconciliation feeds), not entity-deep-dives.

**P2.** Hard Payment-1-before-Dispatch gate is absolute: Ops cannot raise a vendor PO until Finance flips the switch.

**P3.** Email-only notifications Phase 1: WhatsApp and Teams are genuinely Phase 2, not "nice to have sooner."

**P4.** SPOC has no direct access in Phase 1: portal is Phase 2, SPOCs interact via email only.

**P5.** No auto-match on payment reconciliation: always shortlist plus human confirm, never silent auto-match.

**P6.** No auto-match on school-identity resolution at import: deterministic human-review queue at first import, same shortlist-plus-human-confirm pattern as P5.

---

## Phase 3: premise challenge

Each premise gets: alternative framings considered, consequence of not adopting, evidence for or against, verdict.

### P1: flat-file-per-entity data model

**Alternative framings considered:**
- (a) SQLite-in-repo: single file, strong query capability, human-inspectable via tools. Rejected. Vercel serverless FS is read-only; writes would need the queue anyway, but `atomicUpdateJson` on an SQLite binary is far harder than on a JSON array. Loses the inheritance from MOU's `pendingUpdates.ts` plus `githubQueue.ts`.
- (b) Graph-aggregate (one file per logical aggregate, e.g. `schools-with-their-mous-payments-dispatches.json`): fast per-school reads, slow cross-cutting. Rejected. Ground-truth §4 (no shared schoolId across MOU, SPOC, TW, Cretile) and §3b (CcRule resolver unions rules across scopes) both favour cross-cutting operations.
- (c) External DB (Vercel KV, Postgres): adds infra dependency, breaks the queue-via-GitHub-Contents-API pattern. Rejected on handoff principle "reuse verbatim from MOU."

**Consequence of not adopting P1:** losing the MOU inheritance means rewriting the queue writer, sync runner, mtime guard, and ignoreCommand pattern. That is effectively rebuilding the infrastructure MOU paid for in operational exercise across 148 MOUs.

**Evidence strengthening P1:**
- Ground-truth §3b: the CcRule resolver has to union across region, training-mode, positional, per-school, and context. Five orthogonal scopes. Flat-file per entity is the natural fit; graph-aggregate makes the union query expensive.
- Ground-truth §4: no shared schoolId across the four data sources. Import-time reconciliation IS the cross-cutting workload. Matches P1's framing exactly.
- MOU's `types.ts` defines 29 entity types; MOU's actual flat-file pattern (17 JSON files in `src/data/`) has been stress-tested at 148-MOU scale without incident.

**Evidence weakening P1:** none found. The SPOC portal (Phase 2) would be a per-entity-deep-dive workload (one school views its own state), but handoff line 158 explicitly defers to Phase 2; P1 only commits to Phase 1's workload profile.

**Verdict: HOLD, STRENGTHENED.** No change. Ground-truth findings materially increase confidence.

---

### P2: hard Payment-1-before-Dispatch gate

**Alternative framings considered:**
- (a) Proportional dispatch: if school paid 40% of Installment 1, dispatch 40% of kits. Handoff's own Q1 explicitly surfaces this as ambiguous.
- (b) Amount-floor absolute: dispatch only if cumulative-received is at least 25% of contract total, not strictly Installment 1.
- (c) Programme-conditional: absolute for kit-heavy STEAM, more relaxed for book-heavy Young Pioneers.

**Consequence of not adopting P2 absolute:** every partial-payment case becomes a judgment call. Ops pressure (school happiness) versus Finance pressure (collections) produces inconsistency; cases get handled differently; disputes arrive; Ameet adjudicates day-to-day. P2 absolute says "no judgment, one rule." That is the whole point.

**Counter-evidence from ground-truth report §5 Q1:** "Current Cretile tracker has multiple 'Delivery by [date]' entries that appear *before* full-installment payment." Today's actual practice is NOT absolute. Either:
- (i) This is a bug we are codifying the fix for (P2 holds; the system enforces what today's practice does not), OR
- (ii) This is deliberate exception handling that ops uses and would resist removing (P2 creates friction).

**This cannot be resolved without the Shubhangi + Pradeep + sales-rep call (HIGH-RISK item).** Do not code-lock P2 until that call lands.

**Exception mechanism design, three approaches:**

APPROACH A (P2-ABSOLUTE-PLUS-CEO-OVERRIDE)
- Summary: hard gate by default. Ameet-override button with mandatory "why" text box. Audit log entry captures user and reason.
- Effort: S. Risk: Low.
- Pros: matches P2's letter exactly. Preserves CEO authority. Simple data model (one optional override field on Dispatch).
- Cons: every override requires Ameet's attention, scales badly if exceptions are frequent.
- Reuses: existing `auditLog[]` pattern per entity.

APPROACH B (P2-PROPORTIONAL-BASED-ON-PAID)
- Summary: `dispatchable_kits = round(received / installment_1_expected * total_kits)`. System enforces the formula.
- Effort: M. Risk: Med.
- Pros: handles partial-payment cases without human intervention. Matches ground-truth-observed current practice.
- Cons: breaks when a school paid 100% of Installment 1 but ordered actuals differ from MOU commitment. Introduces ambiguity at partial-kit granularity.
- Reuses: nothing new; modifies dispatch eligibility logic.

APPROACH C (P2-ABSOLUTE-PLUS-ESCALATION)
- Summary: hard gate. To dispatch pre-payment, Ops raises an Escalation (L2 per Misba's lane-plus-level structure). Ops Head reviews, approves or requests full payment.
- Effort: M. Risk: Low.
- Pros: takes Ameet out of operational day-to-day. Reuses the Escalation entity (deferred to /plan-eng-review Q-I). Creates a reviewable trail of exception patterns, which informs whether to relax P2 in Phase 2.
- Cons: adds latency to exception cases. Assumes L2 ops head (Misba) has authority to authorise dispatch without full payment.
- Reuses: Escalation entity (Q-I).

**RECOMMENDATION: Approach A, pending the Shubhangi call.** If the call reveals exceptions are rare (under 5% of dispatches), A stays. If common (over 15%), reconsider C (escalation-as-exception-log). B remains a reject on the actual-kit-count mismatch cons.

**Locked-decision tension:** if P2 ultimately resolves to Approach B (proportional), D5's dispatch state machine (carried verbatim from handoff) needs a `PartiallyDispatched` or `PartiallyReleased` state. Flagged under Locked-decision tensions.

**Verdict: HOLD DEFAULT (absolute), DEFER EXCEPTION-MECHANISM CHOICE.** P2 stands as the system's written rule; the exception mechanism is a follow-up question answered after the call.

---

### P3: email-only notifications Phase 1

**Alternative framings considered:**
- (a) WhatsApp Business API Phase 1 via Twilio, MessageBird, or Meta directly.
- (b) WhatsApp send-only bot, no reply handling.
- (c) Email Phase 1 as planned, with a click-to-copy WhatsApp draft button. No API, just text generation.

**Consequence of not adopting P3 (i.e. shipping WhatsApp Phase 1):**
- Meta WhatsApp Business API requires per-template pre-approval (typically 24-48 hours); three-ping cadence across multiple programmes is 12+ templates to get approved before launch. Timeline risk.
- Per-message cost. Vendor lock-in.
- Reply handling introduces a bidirectional data channel. Replies have to land somewhere, get parsed, and route to the right MOU. Phase 1 does not need this complexity.

**Evidence from ground-truth §3c:** 3 schools (of 57) have no valid email of record; 1 MOU school's email bounced. Email quality is 93 to 96% across the SPOC DB. Works for the majority.

**Evidence from §3b:** 10 CC rules exist precisely because today's workflow is email-centric with manually-remembered CC lists. GSL's ops infrastructure is already email-shaped. P3 works with the grain.

**The click-to-copy alternative (approach c) is genuinely cheap:**

APPROACH A (STRICT EMAIL ONLY)
- Summary: handoff's P3 verbatim. All notifications by email. No WhatsApp affordance in the app.
- Effort: S (part of base scope).
- Pros: simplest. No scope creep. Matches stated Phase 1.
- Cons: ops staff still copy-paste to WhatsApp manually when email does not land. Friction persists outside the system.

APPROACH B (EMAIL PLUS COPY-TO-CLIPBOARD WHATSAPP DRAFT)
- Summary: alongside the email-send button on each three-ping cadence trigger, show a "Copy WhatsApp draft" button that populates a pre-formatted message addressed to the SPOC. Ops pastes into their own WhatsApp Web or phone. No API, no cost, no Meta approvals.
- Effort: S (text generator plus a button).
- Pros: captures 80% of WhatsApp's delight at 5% of the integration cost. Gives ops one less reason to leave the app. Preserves the "app is canonical" principle because the draft is system-generated.
- Cons: system cannot track whether the draft was actually sent, or what the SPOC replied. Creates a soft information leak.
- Reuses: SPOC phone from SPOC DB (already in hand; see ground-truth §3a).

APPROACH C (EMAIL PLUS DEEP-LINK wa.me)
- Summary: same as B, but the button opens `wa.me/<phone>?text=<url-encoded-message>` in a new tab.
- Effort: S.
- Pros: one click instead of two.
- Cons: implies the app "integrates with WhatsApp" without really integrating. User-expectation mismatch. Replies still invisible to the system. URL-length limits on message content.

**RECOMMENDATION: Approach B in Phase 1.** Incremental, no external deps, preserves P3's letter (the app does not SEND via WhatsApp; it prepares drafts for humans to send). Approach C introduces user-expectation debt for minimal UX gain.

**Verdict: HOLD (email canonical), ADD CLICK-TO-COPY DRAFT AS PHASE-1 AFFORDANCE.** Defer the final A-vs-B call to /plan-ceo-review. This adds a fourth micro-axis to the three handoff already sends there (dashboard, SPOC portal, feedback loop, and now WhatsApp draft button).

---

### P4: SPOC has no direct access in Phase 1

**Alternative framings considered:**
- (a) Full SPOC portal Phase 1: uploads, feedback, dispatch tracking.
- (b) Magic-link read-only status page Phase 1 (inherits HR's candidate-portal pattern): SPOC clicks a link in any system email, sees read-only current stage. No accounts, no writes.
- (c) Email replies only, no portal at all.

**Consequence of not adopting P4 (i.e. shipping SPOC access Phase 1):**
- Approach (a): 4-6 weeks additional scope. Bidirectional data flow (SPOC uploads need validation). Postpones core pipeline work, specifically the actuals-to-PI-to-payment-to-dispatch loop.
- Approach (b): 1-2 weeks of incremental work. HR's candidate-portal pattern (candidate-session cookie plus HMAC magic-link, HR CLAUDE.md line 41-42) is proven and directly adaptable.

**Evidence from CEO priorities:** Ameet's #3 success metric is school delight. A read-only magic-link status page is a concrete delight lever. At handoff line 322 ("what Ameet sees when this works"), the ops-facing dashboard is named explicitly, but SPOC-facing visibility is ambiguous.

**Locked-decision tension with D7:** D7 adopts the HR middleware pattern with ONLY the staff-JWT branch; the `/portal/*` candidate-cookie branch is explicitly dropped. If (b) lands in Phase 1, D7 needs the candidate-cookie branch restored. Flagged under Locked-decision tensions.

**APPROACHES:** since P4 is one of the three axes the handoff sends to /plan-ceo-review, detailed alternatives belong there. This ceremony's contribution is flagging the D7 interaction and confirming that ground-truth-report evidence makes approach (b) cheaper than expected: HR's magic-link pattern is already production-adjacent, and SPOC phone plus email are already captured.

**Verdict: P4 HOLDS for full portal (approach a). Approach (b) (magic-link read-only status page) is a live Phase-1 candidate to be decided in /plan-ceo-review, not here.**

---

### P5: no auto-match on payment reconciliation

**Alternative framings considered:**
- (a) Auto-match when amount and PI number in bank narration both match exactly. Human override available.
- (b) Confidence-scored auto-match: amount plus narration tokens plus timing window at 99%+ confidence auto-matches.
- (c) Always shortlist plus human confirm (the P5 proposal).

**Consequence of not adopting P5:**
- Approach (a) saves roughly 30 seconds per reconciliation times roughly 200 payments per quarter, about 100 minutes per quarter. Tradeoff: silent auto-match errors propagate to Tally and GST filings. Financial-data bugs.
- Approach (b) has the same tradeoff with more sophisticated matching; still a silent error class.
- Auto-match false positives are catastrophic in a financial system. Human-in-the-loop by default is the correct bias.

**Evidence:** MOU's CLAUDE.md line 38-39 flags payment reconciliation as Shubhangi's #1 pain point, and MOU's resolution was precisely the shortlist-confirm pattern. P5 is not a new design; it is a direct copy of a pattern the ops team chose after working the problem hands-on. Strong precedent.

**Reinforcement from D1:** D1 adopts the same pattern for MOU-to-Ops school-identity resolution, generalising P5 to two reconciliation queues sharing one UI primitive. This is an architectural clarifier, not a weakening.

**Verdict: HOLD, STRONGLY REINFORCED.** No approaches required. P5 is the template from which D1, P6, and a likely third (communication-log bounce reconciliation, if we get there) descend.

---

### P6: no auto-match on school-identity resolution at import

**Alternative framings considered:**
- (a) Fuzzy-match with human confirm on ambiguous (the P6 proposal).
- (b) Exact name plus region auto-match; ambiguous-only goes to queue.
- (c) All imports go through queue (maximum human-in-the-loop, even for obvious matches).

**Consequence of not adopting P6:**
- Approach (b): ground-truth §3d observed 8 apparent matches of 24 MOUs, of which at least 1 was a false positive ("Don Bosco Krishnanagar" versus "Don Bosco Bandel"). A 1-in-8 false-positive rate is unacceptable. Auto-anything on names is fragile.
- Approach (c) is safe but expensive. Exact-match is genuinely reliable in some cases (same school re-signs a renewal MOU, name unchanged). Queueing those wastes human time.

**Evidence strengthening P6:** ground-truth §1b shows multiple naming variants for the same school within a single MOU file ("K.E Carmel School, Amtala" versus "K E Carmel School, Suri", same city, same base name, different schools by disambiguation context). §1b row 22 is a multi-school chain MOU (Narayana Group). Both violate any auto-match approach.

**Reinforcement from D1:** D1 formally encodes P6 as part of the seam design. "Two reconciliation queues, both shortlist + confirm" becomes the architectural centrepiece.

**Approach refinement:** a pragmatic tweak within P6. If both `name` (normalised) AND `location` match EXACTLY to a single existing school record, auto-link with an audit-log note that the auto-link happened. If either does not match, or multiple candidates exist, queue for human review. This preserves P6's "never silent auto-match" because the audit log makes the auto-link explicit and reversible.

**Verdict: HOLD, STRENGTHENED, WITH AUDIT-LOGGED EXACT-MATCH REFINEMENT.** Defer to /plan-eng-review (Q-A details) for whether the exact-match refinement is day-1 scope or Phase-1.1.

---

## Locked-decision tensions surfaced

Tensions between P1-P6 pressure-test outcomes and D1-D8. Recorded for future re-review if operational evidence mounts. NOT for re-litigation in this ceremony.

**Tension 1: P2 exception mechanism ↔ D5 dispatch state machine.** If P2 ultimately resolves to Approach B (proportional dispatch), D5's dispatch state machine (PO Raised → Dispatched → In Transit → Delivered → Acknowledged, carried verbatim from handoff) would need a `PartiallyDispatched` or `PartiallyReleased` state. The Shubhangi plus Pradeep plus sales-rep call outcome drives this. Monitor.

**Tension 2: P4 approach (b) ↔ D7 middleware pattern.** D7 adopts HR middleware with only the staff-JWT branch, explicitly dropping the `/portal/*` candidate-cookie branch. If /plan-ceo-review pulls the magic-link status page (P4 approach b) into Phase 1, D7 needs the candidate-cookie branch restored, i.e. partial revocation of D7's Phase-1 simplification. Flag for /plan-ceo-review's consideration; not yet a tension, just a cost to include in that axis's scoring.

**Tension 3: P3 click-to-copy WhatsApp draft affordance ↔ D8.** D8 locks the Vercel deploy skip, sync cadence, and outputFileTracingIncludes nesting. No direct conflict. The click-to-copy draft runs fully client-side (text generation from template plus SPOC phone from SPOC DB). Noted here because D8 is occasionally invoked as an argument against "any Phase-1 WhatsApp feature"; this proposal does not trip D8. No tension, just recording the absence.

---

## Approaches considered (summary across premises)

Unlocked structural choices surfaced by this ceremony:

| # | Choice | Approach A (recommended) | Approach B | Approach C |
|---|---|---|---|---|
| 1 | P2 exception mechanism | Ameet-override plus audit | Proportional (reject) | Escalation-as-exception |
| 2 | P3 WhatsApp affordance | Email plus click-to-copy draft | Strict email only | Deep-link wa.me (reject) |
| 3 | P4 SPOC Phase-1 access | Full portal = Phase 2 (status quo) | Magic-link read-only Phase 1 | No portal at all |
| 4 | P6 exact-match refinement | Audit-logged auto-link for exact matches | Queue everything | Queue on ambiguity only (current P6) |

Choice 3 (P4) defers to /plan-ceo-review per handoff step 6 axes. Choices 1, 2, 4 surface here; final decisions await the Shubhangi call (choice 1), /plan-ceo-review (choice 2), and /plan-eng-review Q-A (choice 4).

---

## Recommended direction

Hold P1, P3 (email-canonical default), P4, P5, P6. On P2, hold the absolute default but treat the exception mechanism as a post-Shubhangi-call decision. Add the click-to-copy WhatsApp draft as a Phase-1 affordance recommendation to /plan-ceo-review. Refine P6 with the audit-logged exact-match auto-link, deferring the scope decision to /plan-eng-review.

Net: the system's six premises survive pressure-testing with only P2's exception mechanism genuinely open. The other five are strengthened by ground-truth findings, MOU precedent, or both.

---

## Open questions (forward to /plan-eng-review)

Carrying forward verbatim from step 3 without resolution:

- **Q-A.** MOU-to-Ops import-helper detailed design: cron cadence, dedup by MOU id, mid-write sha-conflict handling, validation-failure disposition.
- **Q-B.** PI counter: GSL-wide continuity versus Ops-specific prefix. Ask Shubhangi.
- **Q-D.** Programme enum expansion. Confirm full list before schema lock: STEAM, Young Pioneers, Harvard HBPE (all MOU), TinkRworks, VEX, GSLT-Cretile, others?
- **Q-G.** MOU's reconciliation infrastructure has near-zero real-world exercise. Ops's test suite must exercise queue plus PI counter race plus reconciliation UI explicitly.
- **Q-I.** Net-new Ops entities: Communication, Escalation (lane plus level), SchoolGroup (Narayana, Techno India, Carmel), CcRule (10 rules from §3b), Feedback.

Added by this ceremony:

- **Q-J (new).** P2 exception mechanism: Approach A (CEO-override), C (escalation-based), or B (proportional)? Depends on the Shubhangi plus Pradeep plus sales-rep call output.
- **Q-K (new).** P6 audit-logged exact-match auto-link: Phase 1 scope or Phase 1.1?

---

## Success criteria (from Ameet, rewritten as measurable)

1. **Accuracy:** zero invoices raised without cross-verified numbers. Zero payment-to-PI matches made in under 3 seconds (silent-auto-match canary). Every data write carries user identity plus before/after snapshot.
2. **Smoothness:** manual Excel updates reduced to zero for ops and accounts on Ops Phase 1 entities. Payment-to-dispatch cycle time measurable per MOU.
3. **Delight:** every school has an acknowledged delivery status. Escalations available from day one. Feedback captured for every installment cycle.

System reliability (implicit, handoff line 327): Ameet opens the Leadership Console weekly without asking for a data refresh.

---

## Dependencies

**Pending HIGH-RISK calls (from Shruti-shadow replacement plan):**
- Shubhangi, Pradeep, one sales rep: a 30-minute call covering current practice on P2 (payment-before-dispatch), actuals-drift sign-off today, commitments-register shadow-copy question, legacy-school import decision, CC rule scope (literal versus representative). Must land before Week 1 code.
- Pranav interview on actuals-drift detail (D3 adjacent).

**Pending external escalation (from D3):**
- Shubhangi on GSTIN availability for existing schools. Determines whether PI generation is unblocked at Ops launch or needs a pre-launch data-collection pass. Outside this ceremony's scope.

**Architectural dependencies:**
- D1 import-helper design (Q-A).
- Q-I entity definitions before schema lock.

---

## The assignment

One concrete next action for Anish:

**Schedule the Shubhangi plus Pradeep plus one-sales-rep 30-minute call this week.** Draft the call agenda from the seven HIGH-RISK items (handoff Shruti-shadow replacement plus this doc's P2 exception-mechanism surfacing). Do not let /plan-ceo-review, /plan-eng-review, or any subsequent ceremony stage land on an unverified P2 assumption.

Secondary: confirm with Ameet that Approach B (click-to-copy WhatsApp draft) is in-scope for Phase 1. Low stakes, but /plan-ceo-review will ask.

---

## What I noticed about how Anish thinks

- Anish treats ceremony steps as actual re-alignment checkpoints, not performance theatre. The step-1 rewrite cycle (four amends to get the em-dash rule correct in the anchor commit) was not perfectionism; it was pattern-setting. The anchor commit has to match the rules the system codifies. Ceremony rigour compounds.
- Anish's D4 (validate at ingestion, generalise to all invariants) and D1 (unify P5 and P6 as two reconciliation queues) show a strong preference for finding the underlying abstraction before committing to a schema. Every specific design decision gets re-asked: "is there a more general shape this is an instance of?" That tends to produce fewer, wider primitives rather than many narrow ones. MOU's flat-file-plus-queue-plus-mtime-guard triple is a good prior.
- The Misba CC-rule override (encode all 10 rules, per-rule enabled toggle, silent removal is information loss) is a "reversibility as safety" move. When uncertain about whether a human's dismissal of data is correct, preserve the data and make dismissal explicit. Same principle drove the step-1 SPOC-DB gitignore: preserve the data, keep dismissal opt-in-or-out and visible.
- Anish's comfort with "I cannot tell" (step 5's framing "if currency verification is not possible, say so clearly rather than papering over it") is a useful counterweight to most AI-assisted workflows where the assistant hallucinates confidence. The pause-and-report cadence keeps this live across every ceremony step. Preserve it through /plan-eng-review, where the pressure to just-lock-the-design will be highest.
