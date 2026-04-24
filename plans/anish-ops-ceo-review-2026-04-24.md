# CEO review (SELECTIVE EXPANSION) on five axes

Generated via /plan-ceo-review framework (SELECTIVE EXPANSION mode) on 2026-04-24.
Branch: main. Repo: anishdutta127/gsl-ops-automation. Status: DRAFT.
Mode: SELECTIVE EXPANSION (hold current scope as baseline; surface expansions individually; let taste-calls anchor on Ameet's priorities).
Supersedes: handoff step 6 lists three axes (dashboard, SPOC portal, feedback loop); this doc adds two more (WhatsApp draft button from the /office-hours output, launch strategy from the dropped shadow call).

## Anchor points

The review holds all of the below constant:

- **Ameet's ranked priorities** (handoff line 25): **accuracy > smoothness > delight**. Every axis recommendation is tested against these before any expansion is accepted.
- **D1-D8 locked decisions** from step 3. Not subject to re-debate. Where an expansion would rub against a locked decision, tension is recorded (not re-litigated).
- **Step 6.5 assumptions-and-triggers** (10 items A-J). Where an expansion would change a default or a rollback cost, that ripple is made explicit.
- **Two pending asks**: Ameet on item C (legacy-school import), Shubhangi on item F (GSTIN availability in Tally). Where an answer to either would change an axis recommendation, noted.

Out of scope for this review:
- Re-debating P1-P6 (step 6 office-hours closed these).
- Resolving /plan-eng-review questions Q-A through Q-K (defer).
- Pre-launch verification via the shadow call (dropped; step 6.5 replaces).

---

## Axis 1: Dashboard depth

CEO intent from the handoff (exec brief architecture + line 327): Ameet's Leadership Console shows "live health, exception feed, escalation inbox." Weekly cadence: Ameet opens the dashboard without asking for a data refresh.

### CONTRACT

**Exception feed only.** A flat, date-sorted list of "things that need attention right now": late actuals, overdue invoices, stuck dispatches, missing feedback, failed communications. No summary tiles, no trend graphs, no health gauges. Single route `/dashboard/exceptions`. Ameet opens when pinged by email; otherwise ignores.

Effort: S. Risk: Low (pure query view).

Pros: simplest, fastest to ship, matches the handoff's "exception feed" wording literally. Costs nothing extra.
Cons: no pre-exception signal. Ameet sees "accuracy is broken" only after a specific bad row shows up, not when a trend is going the wrong way.

### HOLD (current handoff default)

**Exception feed + escalation inbox + 5 health tiles.** Exception feed (as CONTRACT) plus a parallel "escalation list" (fan-out entries per Stage 8 of the exec brief) plus ~5 health tiles at the top: active MOUs, accuracy health (invoices raised without cross-verified numbers), collection %, dispatches-in-flight, schools-needing-action. Weekly-viewable, no refresh required.

Effort: M. Risk: Low.

Pros: matches the handoff precisely; deliverable against CEO priority #1 (accuracy) via the "accuracy health" tile.
Cons: the 5 tiles are CEO-facing summaries, but step 6.5 introduces 10 observational triggers that ALSO want monitoring. Without instrumentation, those triggers are theoretical; Anish has to hand-query data to check them.

### EXPAND-1

**HOLD plus assumption-trigger instrumentation.** Every trigger from step 6.5 (CEO-override count, drift queue depth, comm-failure queue depth, bounce rate, PI-counter health, auto-link audit count, etc.) gets a small tile or inline chart. The dashboard becomes both Ameet's operational-exception view AND Anish's self-monitoring view for the assumptions doc. Closes the loop: step 6.5 promised "monitoring mechanism" per item; EXPAND-1 makes that mechanism a single surface.

Effort: M+ (the incremental cost over HOLD). Risk: Low (each trigger's metric source is already named in 6.5; aggregation layer is the only new work).

Pros: step 6.5's ship-with-defaults posture only works if triggers are actually observable. EXPAND-1 is the difference between "we have defaults and hope we notice when they break" and "we have defaults and the dashboard tells us when they break." This expansion is the thing that makes the entire ship-without-shadow-call decision rigorous rather than lazy.
Cons: each trigger-tile adds surface area. Some trigger metrics (e.g. CEO override count) are easy to emit; others (e.g. bounce rate per 7-day window) need a minor sync-runner computation.

### EXPAND-2

**EXPAND-1 plus cross-temporal trends and drill-downs.** 30-day trend lines on every tile. Click a tile to drill into the list of contributing items. "Accuracy health" becomes a compound gauge (actuals confirmed %, PI on-time %, reconciliation backlog). "Collection %" becomes a cohort analysis (MOU vintage × collection curve). Full analytics workbench rather than a health dashboard.

Effort: L. Risk: Med (real-time aggregation over JSON files is fine at current scale; gets awkward past ~500 MOUs).

Pros: Ameet could answer questions like "are Q2 MOUs collecting faster than Q1?" without leaving the app.
Cons: Phase 1 doesn't have the data volume to make trend lines informative yet (24 MOUs → trivial signal). This is a Phase 2 shape.

### Cross-axis interactions

- EXPAND-1 depends on each trigger from 6.5 actually emitting a metric. That work is distributed across the item implementations; dashboard gets expensive only if the items ship without their monitoring hooks.
- Axis 4 (WhatsApp draft) at EXPAND-2 emits a new metric ("draft copy rate per school") that belongs on this dashboard as a bounce-corollary tile. Coherent.
- Axis 5 (launch strategy) at EXPAND-1 (incremental) adds a "launch progress" tile: schools imported, stages active, ops workload still on Excel. That's dashboard scope, not launch-strategy scope.

### Recommendation (Axis 1): EXPAND-1

The expansion is the thing that makes step 6.5's framing operational instead of aspirational. Ameet gets the handoff-promised view; Anish gets the trigger-observability view; they share the same surface. Marginal cost over HOLD is M+, not a separate L-sized build. EXPAND-2's trend lines need Phase 2 data volumes to be worth the effort.

---

## Axis 2: SPOC Portal

Context: P4 holds in office-hours (step 6). Approach (b), magic-link read-only status page using HR's candidate-portal pattern, was flagged as a live candidate. D7 currently drops the `/portal/*` candidate-cookie branch from HR's middleware.

### CONTRACT

**Rich email status block in every system notification.** Instead of any portal, each email in the three-ping cadence includes a structured block: "Here's where [school name] is: Actuals confirmed on [date]. Invoice dispatched on [date]. Dispatch unlocked on [date]. Training scheduled for [date]. Next action: [SPOC to confirm receipt]." No clickable link to a portal. No auth. The SPOC's existing email client is the "portal."

Effort: S (template work only; new placeholders in the existing email templates). Risk: Low.

Pros: zero new routes, zero new auth surface, zero D7 revocation. Reaches every SPOC the emails reach (i.e. 94% of SPOCs per ground-truth §3c, and the 6% who don't get email need a manual path anyway). Delivers the "I can see where my school is" delight without building a portal.
Cons: status block ages the moment the email is sent; if the SPOC reads it 3 days later, the displayed state could be stale. Ops-critical events (e.g. "Dispatch just failed") won't reach the SPOC until the next email. Not real-time.

### HOLD (handoff default, step 6 verdict)

**No portal Phase 1.** SPOC sees only what system emails convey. Zero UI for SPOCs. Defer full portal to Phase 2.

Effort: S (no work; it's the baseline). Risk: Low (nothing new).

Pros: matches P4 exactly. Preserves D7 simplification. Phase 1 focuses on the internal loop.
Cons: Ameet's priority #3 (delight) is addressed only indirectly, through whatever the ops team proactively communicates.

### EXPAND-1 (office-hours approach b)

**Magic-link read-only status page.** SPOC gets a link in every system email; clicking lands on a read-only page showing current stage, next milestone, dispatch tracking (if applicable), feedback form (if applicable per Axis 3). HMAC-signed link, 15-minute link expiry, candidate-session cookie on click (30-day rolling). Inherits HR's candidate-portal pattern verbatim. Restores D7's `/portal/*` branch.

Effort: M (1-2 weeks per office-hours estimate). Risk: Low (HR's pattern is proven).

Pros: real-time visibility; a SPOC can check status at any moment. Sets up the magic-link primitive that Axis 3's feedback loop can piggyback on.
Cons: partial revocation of D7. Adds a candidate-cookie code path that Phase 1 doesn't strictly need if Axis 3 is external Google Form. 1-2 weeks of critical-path time spent on priority #3 delight work before priority #1 accuracy is proven end-to-end in production.

### EXPAND-2

**Status page + SPOC-facing actions.** Everything in EXPAND-1 plus: SPOC can download their signed MOU, download the delivery-acknowledgement form, upload a receipt photo as acknowledgement proof, update their own contact details. True Phase 2 preview.

Effort: L (3-4 weeks). Risk: Med (bidirectional data flow introduces validation + attachment storage surface).

Pros: SPOC becomes a first-class participant in their own MOU lifecycle. Acknowledgement-upload is the strongest delight lever in the system (schools love having proof).
Cons: scope doubles. Every uploaded photo needs size limits, format validation, URL storage. Every self-updated contact detail needs a re-verification flow. This is Phase 2 in disguise.

### Cross-axis interactions

- Axis 3 (feedback loop): if Axis 3 is "embedded feedback in the magic-link portal," EXPAND-1 here + embedded-feedback on Axis 3 combine cleanly (same auth, same route family). If Axis 3 is "external Google Form," Axis 2 and 3 are independent; EXPAND-1 here loses its double-duty justification and becomes harder to defend cost-wise.
- D7 tension (step 6 Tension 2): EXPAND-1 partially revokes D7's "staff-JWT only" simplification. HR's candidate-cookie code path comes back. Not a blocker (HR has proven code), but it needs to be flagged in /plan-eng-review.
- Item F (GSTIN) in 6.5 becomes easier with EXPAND-2 because schools could self-submit their GSTIN. But EXPAND-2 is Phase 2; don't drag GSTIN-self-submit into the decision.

### Recommendation (Axis 2): HOLD (no portal) + CONTRACT (rich email status block, IN Phase 1 scope)

HOLD remains the default for any portal in Phase 1. CONTRACT (rich email status block in every system notification) is a genuinely cheap addition that captures much of EXPAND-1's delight without the D7 revocation or the 1-2 weeks of critical-path time. Cost of CONTRACT is S (email template work); delight delivered is ~60% of what EXPAND-1 would deliver. **CEO review puts CONTRACT firmly IN Phase 1 scope.**

The push-back on EXPAND-1 is this: the /office-hours output flagged it as a "live candidate in /plan-ceo-review," and this review is saying **no for Phase 1**. Reasoning: Ameet's priority #3 doesn't earn 1-2 weeks of critical-path time before priority #1 is proven end-to-end. Ship the internal loop; prove the data flows; add the magic-link portal in a fast Phase 1.1 once the internal surface is stable and Axis 3's feedback mechanism has locked.

What /plan-devex-review pressure-tests on CONTRACT: the status-block copy, the layout inside the email template, whether the 94%-email-reach threshold is good enough UX for priority #3 (delight), any visual or accessibility details. Devex-review does not re-decide inclusion; inclusion is settled here.

---

## Axis 3: Feedback loop

Context: handoff says "short-form feedback collected after every installment cycle," plus an escalation button on every stage. Ground-truth report §5 Q6 recommended embedded rather than external Google Form.

### CONTRACT

**Nothing captured systematically.** Feedback continues via WhatsApp to account owners, ad-hoc emails, the occasional annual survey done by Academics. Current state persists.

Effort: S (zero work). Risk: High from a priority-#3 standpoint (the system explicitly fails to deliver on "school delight").

Pros: zero additional scope.
Cons: violates the handoff. No data to populate Ameet's dashboard with. Schools have no formal way to flag issues between installment cycles. Not a viable option; listed only for contrast.

### HOLD (handoff default, embedded per ground-truth Q6)

**Short-form feedback, embedded in the app, triggered after installment payment.** A single "Rate your experience 1-5 + free text" form. Submitted via a magic-link email after each installment is paid. Stored as a Feedback entity (per Q-I). Ameet sees aggregate: average rating per school, per programme, over time.

Effort: M (entity + submission UI + aggregation view). Risk: Low.

Pros: delivers the handoff. Aggregates feed Ameet's dashboard. Data source for the delight priority.
Cons: 1-5 star ratings are low-signal noise. "Everything was 3/5 meh" doesn't tell you whether training was weak, kits arrived late, or the trainer didn't show up.

### EXPAND-1

**HOLD plus structured categories.** Feedback is split across 4 categories: training quality, kit condition, delivery timing, trainer rapport. Each gets a 1-5 rating plus optional comment. Aggregation supports cross-school comparison per category. Academics team can see trainer-rapport trends separately from delivery-timing trends.

Effort: +S over HOLD (form design + 4-category aggregation). Risk: Low.

Pros: converts feedback from noise to signal. Academics can act on trainer-rapport scores without reading every free-text comment. Ops can catch delivery-timing drift before it becomes a school-complaint. Aggregation per category is the thing that gives the dashboard real diagnostic power.
Cons: slightly more UI work in the feedback form itself. Marginal additional entity complexity (category enum + per-category rating).

### EXPAND-2

**EXPAND-1 plus negative-feedback auto-escalation.** Any category rating ≤ 2 auto-creates an Escalation (lane selected by category: training-rapport → Academics lane, delivery-timing → Ops lane, kit-condition → Ops lane, training-quality → Academics+Ops joint lane). Fan-out to the relevant owner within 24 hours of feedback submission. Reuses the Escalation entity from Q-I.

Effort: +S over EXPAND-1. Risk: Med (auto-escalation is a new "system acts on its own" pattern that needs deliberate thresholds to avoid noise).

Pros: closes the loop automatically. A school that rates training 1/5 doesn't just sit in a list; the right person gets pinged within a day. School delight priority is served proactively rather than reactively.
Cons: threshold calibration is an unknown. "≤2" may fire too often if the 1-5 scale skews low. Q-I's Escalation entity isn't finalized; EXPAND-2 depends on /plan-eng-review locking that schema.

### Cross-axis interactions

- Axis 2 (SPOC portal): HOLD here works with HOLD on Axis 2 via a magic-link email to a minimal-auth form page (small partial revocation of D7 even at HOLD, actually; flag). EXPAND-1 on Axis 2 makes the feedback form a native portal component, tighter UX.
- Axis 1 (dashboard): EXPAND-1's per-category aggregates are the richest dashboard fodder.
- Axis 5 (launch strategy): feedback loop only produces signal after the first installment is paid, which for new MOUs is 30-90 days post-launch. Launch-day feedback is empty regardless of HOLD/EXPAND.

### Recommendation (Axis 3): HOLD + EXPAND-1

Structured categories are the single highest-leverage addition to the feedback loop. Cost is marginal (S over HOLD); information density jumps from "an average" to "a per-dimension diagnostic." Without this, the aggregate is unactionable; with it, the dashboard becomes diagnostic.

EXPAND-2 (auto-escalation) is the right long-term shape but depends on Q-I's Escalation entity being locked in /plan-eng-review. Proposal: land EXPAND-2 in Phase 1.1 as the first consumer of the Escalation entity. Flag to /plan-eng-review that the Escalation entity should support feedback-origin creation.

The Axis 2 + Axis 3 combo implies a candidate-auth surface even at HOLD-on-both; that observation is lifted into the new "Locked-decision tensions surfaced (new from this ceremony)" section below rather than buried here.

---

## Axis 4: WhatsApp draft button

Context: new axis from step 6 office-hours. Approach B (click-to-copy draft) was recommended; this review decides scope within that approach.

### CONTRACT

**Out.** No WhatsApp affordance in Phase 1. Ops staff continue to copy-paste manually as they do today. Captures the letter of handoff line P3.

Effort: S (no work). Risk: Medium on priority #2 (smoothness); ops friction persists outside the system.

Pros: simplest. No new surface.
Cons: ops keeps a WhatsApp Web tab open alongside the app, flipping between them. The handoff's "smoothness" priority is compromised unnecessarily given EXPAND options are near-free.

### HOLD (office-hours recommendation)

**Click-to-copy WhatsApp draft on every three-ping cadence trigger.** System generates message text with placeholders filled (school name, stage, next-expected-action, dates). One click copies to clipboard; ops pastes into their own WhatsApp. Not an API. Not a deep-link. Just a text generator + a copy button on the three-ping-cadence screens.

Effort: S. Risk: Low.

Pros: exactly what office-hours proposed. Covers the primary ops-to-SPOC communication pattern (the cadence).
Cons: the button exists only on cadence screens, not on other ops-outgoing communications (payment confirmations, dispatch-raised notifications, delivery-acknowledgement reminders, feedback requests). Ops still copy-pastes for those.

### EXPAND-1

**HOLD plus the button on every outbound ops communication.** Not just the three-ping cadence. Also: payment confirmation, dispatch-raised notification, delivery-acknowledgement reminder, feedback-request email. Every template that generates an email also generates a matching WhatsApp-draft text.

Effort: +S over HOLD. Risk: Low.

Pros: consistent UX. Ops never has to think "does this email have a WhatsApp button or not?" It always does. Incremental cost over HOLD is ~2-3 days (template-prose variants for ~5 more template types) once HOLD is built.
Cons: slightly more template work. Each template needs a WhatsApp-prose variant (WhatsApp formatting is looser than email; the text needs to read well as a chat message, not as a formal letter).

### EXPAND-2

**EXPAND-1 plus logged copy events.** Each copy action appends a single entry to a `CommunicationCopyLog` JSONL (or similar lightweight stream) capturing: timestamp, user, school, template type. Gives anonymous-volume data without knowing reply content. "Draft-copied per school per week" becomes a weak signal.

Effort: +S over EXPAND-1 (JSONL append + a dashboard tile). Risk: Low.

Pros: converts "the system knows nothing about what happened after copy" into "the system knows how often ops needed the copy path." If a particular school's copy-rate is high, suggests email isn't landing for that school (corroborates the Item I bounce-rate trigger from 6.5). Cheap observability.
Cons: adds a small data stream. Ops staff may feel surveilled ("my copy clicks are being logged"); framing in the UI matters ("this helps us see which schools have email delivery issues").

Mitigation for /plan-devex-review to pressure-test: CommunicationCopyLog is anonymized-by-default from the dashboard view: shows copy-rate-per-school aggregates, not per-user attribution. Per-user attribution only accessible via the admin audit route, not the dashboard. This framing is a UX constraint, not just a tone note.

### Cross-axis interactions

- Item I (email deliverability) in 6.5 explicitly names WhatsApp click-to-copy as the first fallback. Axis 4 HOLD is the implementation of that fallback. Strong coherence: if Axis 4 is CONTRACT, Item I's rollback path gets more expensive.
- Axis 1 (dashboard): EXPAND-2's copy-rate-per-school stream is a natural dashboard tile at EXPAND-1 on Axis 1. Complements the bounce-rate trigger from Item I.
- Axis 2 (SPOC portal): independent. The copy-to-WhatsApp is an ops-side affordance, not a SPOC-facing one.

### Recommendation (Axis 4): HOLD + EXPAND-1 + EXPAND-2

Three expansions bundled, all at S cost: HOLD is 1-2 days, EXPAND-1 adds 2-3 days of template-prose work, EXPAND-2 adds 1 day for JSONL + dashboard tile. The work compounds because the template-rendering primitive is shared.

- HOLD: the button exists at all.
- EXPAND-1: on every outgoing communication, not just cadence.
- EXPAND-2: log copy events as weak signals, visible on the dashboard (Axis 1 EXPAND-1 territory).

Net scope: <=1 week of work, covers smoothness priority on the ops side, provides a data stream that backs Item I's email-bounce trigger from 6.5. Push-back: CONTRACT (the handoff's literal P3) leaves obvious smoothness gain on the table.

---

## Axis 5: Launch strategy

Context: new axis, relevance gained when the pre-launch shadow call was dropped. Handoff implies big-bang (no specific language); step 6.5 frames launch as "ship, hand credentials, observe triggers."

### CONTRACT

**Shadow-parallel launch.** Ops continues Excel + WhatsApp workflow as canonical. Ops app runs in parallel. No cutover. No one is forced to use Ops. Anish uses real data to validate; ops uses voluntarily. Shadow period: 30 days minimum. After shadow, decide whether to cut over or adjust.

Effort: L (all Phase 1 scope plus 30 days of shadow double-entry for ops). Risk: High on the "one source of truth" handoff principle.

Pros: maximally safe. If the app has a critical bug, Excel is authoritative; ops is never at risk.
Cons: creates the exact "two systems of truth" anti-pattern the handoff explicitly forbids (line 148). Double-entry burden falls on Shubhangi and Pradeep, whose time is the tightest constraint. The app never gets real-world stress because no one is forced to use it; bugs go undiscovered.

### HOLD (implied handoff default, made explicit here)

**Big-bang single launch.** All 8 lifecycle stages live day 1. Ops team switches over completely. Excel becomes read-only export. All users (Shubhangi, Pradeep, Misba, Ameet, any named sales reps) get credentials simultaneously. No shadow period. Seeded with the import of every 2026-04-onward MOU via the D1 pull.

Effort: M (implementation plus seeded data plus credentials distribution). Risk: Medium (every assumption default tested live on day one; any mis-default surfaces fast but also impacts ops workflow immediately).

Pros: matches how gsl-mou-system and gsl-hr-system were shipped. Consistent team behaviour. Excel becomes the read-only export from day one (handoff-compliant). Step 6.5's triggers all begin ticking immediately.
Cons: day-one load on Item G (reconciliation plumbing) is maximal. Every trigger from 6.5 has to fire on meaningful data within the first 7-14 days for the "weekly for 4 weeks" review cadence to work. If a fundamental issue surfaces (e.g. import reconciliation produces too many queue items), ops feels it before alternatives can be staged.

### EXPAND-1

**Incremental module rollout.** Week 1 live: import + actuals + PI generation (Stages 1-4). Week 3 live: payment + dispatch (Stages 5-6). Week 5 live: training + feedback (Stages 7-8). Sales team onboarded week 2 after accounts/ops have validated stage 1-4. ~5-week ladder vs 1-week bang.

Effort: L (same features as HOLD but with launch-scheduling complexity and per-module credentials cascades). Risk: Low-Medium (each week's launch is smaller; issues are scoped to the week's module).

Pros: spreads Item G (reconciliation plumbing) load. Each trigger from 6.5 gets its own observation window rather than all firing simultaneously. Rollback per module is cheaper. Sales team doesn't see the system until accounts/ops have validated the inputs.
Cons: adds scheduling and credential-distribution complexity. Ops workflow has a hybrid period (some MOUs on the app, some still on Excel) that weakly echoes CONTRACT's two-systems-of-truth problem, though capped at 5 weeks and per-stage rather than per-MOU.

### EXPAND-2

**Incremental + 30-day shadow per module.** Each module goes live but Excel continues in parallel for 30 days. Ops double-enters during shadow. After 30 days of zero-diff confirmation, Excel goes read-only for that module. Most cautious.

Effort: XL (5 weeks plus 30 days shadow per module = 3+ months total). Risk: Very Low (any critical bug has Excel as authoritative fallback).

Pros: maximal safety. Catches edge cases with Excel as a reference.
Cons: 3+ months is not consistent with handoff's "quality over speed" tempo. Double-entry burden is Shubhangi's bandwidth cost; at 240 MOUs/year target, double-entry becomes the critical constraint. EXPAND-2 would delay Phase 2 work indefinitely.

### Cross-axis interactions

- Item C (legacy-school import) in 6.5 is the driving factor. If Ameet says "include legacy at launch," big-bang (HOLD) becomes operationally implausible (you'd need to import 51 legacy schools + ship the pipeline + train everyone simultaneously). EXPAND-1 (incremental) becomes the natural choice. If Ameet says "exclude legacy" (current default), HOLD is viable.
- Item G (reconciliation plumbing) in 6.5 is most vulnerable at HOLD's big-bang: all race conditions manifest in the same week. EXPAND-1 spreads that risk across 5 weeks.
- Step 6.5 review cadence says "weekly for first 4 weeks, then monthly through month 3." HOLD makes the first 4 weeks a single cadence for all triggers. EXPAND-1 staggers the cadence across modules: first 4 weeks of each module starts from that module's launch, not from the overall launch. The review cadence section of 6.5 would need a short update.

### Recommendation (Axis 5): HOLD, contingent on Ameet saying "exclude legacy" on Item C

HOLD matches the shipping pattern that worked for MOU and HR. CONTRACT creates the two-systems-of-truth anti-pattern explicitly. EXPAND-2 is too slow for the handoff tempo.

EXPAND-1 (incremental) is the right move in two scenarios:
1. Ameet says "include legacy" on Item C. At that point EXPAND-1 is effectively mandatory.
2. /plan-devex-review surfaces a day-one developer-experience issue that blocks a clean big-bang.

Default now: HOLD. Flip to EXPAND-1 if either condition triggers. Anish holds this decision. Ameet's legacy answer forces a mechanical flip; devex-review-surfaced blocker requires Anish's judgment call. The decision locks at /plan-eng-review start. If Ameet has not answered by then, HOLD applies and any legacy-include later becomes a Phase 1.1 conversation rather than a Phase 1 re-plan.

---

## Combined recommendation

Picking one level per axis:

| # | Axis | Level | Net effort over handoff baseline |
|---|---|---|---|
| 1 | Dashboard depth | EXPAND-1 (exception feed + escalation + 5 health tiles + trigger instrumentation) | M+ (trigger tiles add on top of the 5 health tiles) |
| 2 | SPOC Portal | HOLD (no portal) + CONTRACT (email status block, in scope) | S (email template work) |
| 3 | Feedback loop | HOLD + EXPAND-1 (structured categories) | S+ (category enum + per-category aggregation) |
| 4 | WhatsApp draft button | HOLD + EXPAND-1 + EXPAND-2 (button everywhere, copy events logged) | S (compounding template work) |
| 5 | Launch strategy | HOLD (big-bang), contingent on Ameet=exclude-legacy | 0 |

Effort sum over handoff: 8-14 days (~2 weeks) of marginal work, decomposed as:

| Item | Actual days |
|---|---|
| Axis 1 EXPAND-1 (trigger tiles on top of HOLD dashboard; aggregation layer + ~10 tile components) | 3-5 days |
| Axis 2 CONTRACT (rich email status block template + placeholders across existing notification types) | 1-2 days |
| Axis 3 HOLD + EXPAND-1 (Feedback entity + submission UI + per-category aggregation view) | 1-2 days |
| Axis 4 HOLD + EXPAND-1 + EXPAND-2 (3-cadence copy button + extend to ~5 more templates + CommunicationCopyLog + dashboard tile) | 3-5 days |
| Axis 5 HOLD | 0 |
| **Total** | **8-14 days** |

Not overscope: Phase 1's "MOU-to-Delivery-to-Paid loop" (exec brief) still fits. But the honest number is ~2 weeks of marginal work over the handoff baseline, not 1. Earlier drafts of this doc said "about one additional week"; that compressed three to five days into prose and papered over real cost. Corrected here.

---

## Overscope check

Phase 1 per handoff covers the "MOU-to-Delivery-to-Paid loop" (exec brief). The above recommendations stay inside that loop. Specifically out of scope:

- Full SPOC portal (Axis 2 EXPAND-1 or EXPAND-2): deferred.
- Full BI dashboard (Axis 1 EXPAND-2): deferred.
- Negative-feedback auto-escalation (Axis 3 EXPAND-2): deferred to Phase 1.1 as first consumer of the Escalation entity.
- WhatsApp Business API (ruled out by office-hours P3): deferred.
- Incremental rollout + 30-day shadow (Axis 5 EXPAND-2): rejected as anti-pattern.
- Trainer scheduling, vendor inventory forecasting, multi-tenant: deferred per handoff line 153-160.

The recommendation is coherent as a Phase 1 scope, matches handoff priorities, and does not silently expand into Phase 2 territory.

---

## Axes where the recommendation pushes back on Anish's prior framing

1. **Axis 2 (SPOC Portal) recommendation is HOLD, not EXPAND-1, with CONTRACT (email status block) IN Phase 1 scope.** Anish's framing in step 6 (office-hours) positioned (b) as "live candidate in /plan-ceo-review." This review says NO for Phase 1 on the portal itself, and YES on the CONTRACT fallback (rich email status block). Rationale: the 1-2 weeks of critical-path time is better spent proving the internal loop than on priority-#3 delight work before priority-#1 accuracy is proven end-to-end. CONTRACT is IN Phase 1 scope; devex-review pressure-tests its UX, not whether to include it.

2. **Axis 1 (Dashboard) recommendation is EXPAND-1, adding scope vs the handoff's implicit "exception feed + escalation" only.** The trigger instrumentation IS the thing that makes step 6.5's "ship with defaults + triggers" framing operational. Without instrumentation, triggers are aspirational. With it, observability is a single surface.

3. **Axis 5 (Launch strategy) recommendation is conditional, not static.** HOLD is the default, but Ameet saying YES on legacy mechanically forces EXPAND-1. This is the first recommendation in the ceremony that has a hard branch based on a pending ask's answer.

---

## Cross-axis interactions that would force a re-think of step 6.5

One genuine cascading change:

- **If Axis 5 flips to EXPAND-1 (triggered by Ameet = legacy-include):** step 6.5's review cadence section needs a small update. Currently: "weekly for first 4 weeks, monthly through month 3" from the single launch date. Under incremental: "weekly for 4 weeks from each module's launch date, monthly through month 3 from the final module's launch." Triggers A (CEO overrides), B (drift queue), G (reconciliation plumbing) get per-module observation windows. Items I (email) and J (sales-owner) still work on overall launch date because they touch every module.

No other cross-axis interaction requires re-thinking 6.5. Items A through J's defaults and rollback costs stay valid at any recommendation mix above.

---

## Locked-decision tensions surfaced (new from this ceremony)

**Tension 4 (extends step 6 Tension 2): Axis 3 HOLD (embedded feedback) also partially revokes D7.**

Step 6 identified Tension 2 as "P4 approach (b) ↔ D7 middleware pattern" (i.e., IF we chose the magic-link portal, D7's staff-JWT-only simplification would be partially revoked). This ceremony surfaces a second instance at a smaller scope: the recommended Axis 3 HOLD + EXPAND-1 (embedded structured-category feedback form) ALSO requires minimal candidate-auth. Feedback form submission needs to prove "you are the SPOC of this school" or the form is unauthenticated and spammable. Single-use HMAC token (same key as any future magic-link) is a single function, not a whole cookie session. But it is still a partial D7 revocation.

Implication: D7 "staff-JWT-only middleware" is not literally tenable at the recommended Phase 1 scope. The minimum viable surface is staff-JWT-middleware + HMAC-verified public feedback endpoint. /plan-eng-review locks this explicitly. Decision in this ceremony: feedback submission CAN live in Phase 1 at HMAC-token scope without reintroducing the full candidate-cookie session; D7 remains "no full candidate session cookie in Phase 1" while accepting a narrow HMAC-verification surface. This is a meaningful refinement of D7, not a full revocation.

---

## Pending-ask sensitivity

**Ameet on Item C (legacy-school import):**
- YES (include legacy): Axis 5 flips HOLD → EXPAND-1 (incremental). Ripple into 6.5 review cadence per above.
- NO (exclude legacy, current default): recommendation stands as-is.

**Shubhangi on Item F (GSTINs in Tally or elsewhere):**
- YES (captured somewhere): one-time import at launch closes the GSTIN gap for the 148-school backlog. No change to any axis recommendation.
- NO (not captured): per-school capture flow is the default regardless. No change to any axis recommendation.

So of the two pending asks, only Ameet's has a material effect on this CEO review's output. Shubhangi's answer is orthogonal.

---

## Asks surfaced for downstream ceremonies

- **/plan-devex-review**: pressure-test the Axis 2 CONTRACT status-block copy, layout, accessibility, and whether the 94% email-reach threshold is good enough UX for priority #3 (delight). Inclusion is already decided here (IN scope). Devex-review owns the how-it-feels, not the whether-to-include.
- **/plan-eng-review**: lock the Escalation entity (Q-I) in a shape that supports feedback-origin creation. This doc's vote: EXPAND-2 on Axis 3 (negative-feedback auto-escalation) becomes the first consumer in Phase 1.1.
- **/plan-eng-review**: confirm that the dashboard trigger-tile infrastructure (Axis 1 EXPAND-1) can read per-item metrics cheaply from the data files. Each item in 6.5 already names its "monitoring mechanism"; /plan-eng-review should confirm that aggregation is a read-only JSON traversal, not an expensive query.
- **/plan-eng-review**: Axis 3 HOLD + EXPAND-1 (structured categories) requires the Feedback entity schema to include per-category ratings. Lock the shape early.

---

## Summary for Anish

The CEO review recommends:

- **EXPAND on Dashboard** (Axis 1) because it's where step 6.5's ship-without-shadow-call rigor lives or dies.
- **HOLD on SPOC Portal** (Axis 2) + CONTRACT (email status block in scope). Devex-review pressure-tests the status-block UX, not the inclusion decision.
- **EXPAND on Feedback** (Axis 3) with structured categories; defer auto-escalation to Phase 1.1.
- **EXPAND on WhatsApp draft** (Axis 4) bundling all three levels (3-5 days total of compounding template work).
- **HOLD on Launch strategy** (Axis 5) with incremental as the fallback if Ameet includes legacy.

Net: 8-14 days (~2 weeks) of marginal work over the handoff baseline, decomposed per axis in the Combined Recommendation table. All of it load-bearing for step 6.5's monitored-triggers posture or Ameet's ranked priorities. Nothing silently expanded into Phase 2. No locked decisions re-debated.

The single meaningful push-back is Axis 2: SPOC Portal approach (b) does not earn Phase 1 scope. Stage the magic-link portal for Phase 1.1 once the internal loop is proven. The CONTRACT fallback (email status block) covers the delight gap in the meantime.
