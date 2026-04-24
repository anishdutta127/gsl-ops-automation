# Assumptions and observational triggers (replacing the pre-launch shadow call)

Date: 2026-04-24. Author: Anish.
Supersedes: the Shruti-shadow replacement plan's "verify HIGH-RISK items pre-launch" posture.

## Why this doc exists

The original plan was: hold a 30-minute call with Shubhangi (accounts), Pradeep (ops), and one sales rep before Week 1 code, plus a separate Pranav (finance) interview, to verify seven HIGH-RISK assumptions from the ground-truth report (§7). That verification step is now dropped. New plan: ship Phase 1 on defensible defaults, observe real usage, let monitored triggers tell us which assumptions were wrong.

This is not hand-waving. It is a deliberate tradeoff matching how gsl-mou-system and gsl-hr-system were shipped: ship, hand credentials to the ops team, collect feedback from real usage, iterate. It works only if the defaults are actually defensible (not guesses) and the triggers are actually observable (not hopeful). This doc is the artefact that makes both true.

Every item below captures five fields:

1. **Assumption:** the one-line claim the system ships with.
2. **Defensible default:** what code ships with, and why it is safe.
3. **Observational trigger:** the quantified signal that tells us the assumption was wrong.
4. **Rollback cost:** what we would have to change if the trigger fires.
5. **Monitoring mechanism:** where the trigger signal actually shows up (UI, analytics, user report, etc.).

At the end, a section flags any item that is genuinely not convertible to a trigger and needs a call anyway.

---

## A. Payment-1-before-Dispatch strictness (P2)

**Assumption.** Ops cannot raise a vendor PO until Finance flips the "Installment 1 paid" switch.

**Defensible default.** Approach A from the /office-hours output: **absolute gate with CEO-override button.** Dispatch is blocked by default. Ameet (only) sees a "Override gate (requires reason)" button on the dispatch screen. Pressing it opens a mandatory text box ("Why is this dispatch going out without Installment 1 fully paid?"); the reason plus user plus timestamp is written to the Dispatch entity's `auditLog[]` as an `override` action. The override is reversible (Finance can revoke) but the audit log is append-only.

Why this default is safe: it codifies P2's absolute rule without blocking real-world exceptions, and every exception is attributed and visible. It preserves CEO authority (Ameet is the accountable party for any commercial decision to dispatch pre-payment). It does not require Ops or Finance to fight about individual cases.

**Observational trigger.** CEO overrides exceed **3 per week for 2 consecutive weeks**. (The absolute number is a starting calibration; treat this as a canary, not a cliff. If overrides are 2/week steady state, the gate is working. If they are 3+ week after week, the gate is too tight for how GSL actually operates.)

**Rollback cost.** Medium. Graduate to Approach C (escalation-based): override button is removed from Ameet's UI and replaced with an "Open escalation" button on the dispatch screen; Ops raises an L2 escalation (lane OPS, per Misba intel A), Misba reviews and approves or rejects, approval writes the same audit entry. Integration point: adds a `disputedDispatch` entry in the Escalation entity (already in Q-I). Roughly 2-3 days of work. Data model unchanged; auditLog entries stay compatible.

**Monitoring mechanism.** Dashboard counter: "CEO dispatch overrides (last 7 days) / (last 14 days)". Visible to Ameet on the Leadership Console. If the number sits at 3+ for two weeks, Ameet pings Anish to graduate.

---

## B. Actuals-drift threshold

**Assumption.** When actuals differ from the MOU numbers, Sales Head (Pratik) signs off for significant deltas; smaller deltas auto-approve.

**Defensible default.** Per Misba intel B from kickoff: Accounts checks with both Ops and Sales; Sales (Pratik) signs off. Pranav is the detail-level person. Threshold: **drift of 10% or less auto-approves with an audit entry; drift over 10% routes to Pratik as a Sales Head approval queue item.** The 10% number matches the handoff's own "delta >10%" phrasing (line 75) and is explicitly set via one config value at `src/data/config/actuals-drift-threshold.json` (or equivalent) so it can be tuned without a code change.

Why this default is safe: it lines up with how the handoff already describes the workflow; it gives Sales Head visibility on material deltas while not forcing them to sign off on every 3% variance; Pranav can be involved in queue review without being a gate.

**Observational trigger.** Sales Head queue exceeds **5 items per week**.  That either means 10% is too tight (most MOUs drift more than 10% on first actuals because MOUs are rounded) or Pratik has no bandwidth to review. Either way, reconsider.

**Rollback cost.** Low. Change the config value from `0.10` to `0.15` or `0.25`. One commit, one queue-item-JSON. Test: existing queue items stay in flight; new drift events re-evaluate against the new threshold.

**Monitoring mechanism.** Sales Head's queue-size gauge on their dashboard. Also: sync runner emits a weekly summary JSON (`src/data/analytics/drift-weekly.json`) with the 7-day count, viewable via an admin route.

Related ask: Anish to interview Pranav opportunistically post-launch for detail-level refinement (what belongs in the drift-reason dropdown, what patterns Pranav sees when reviewing the queue).

---

## C. Legacy-school import

**Assumption.** Ops Phase 1 only imports schools that come through the 2026-04-onward MOU flow. Legacy schools (51 in the SPOC DB without a matching 2026-04 MOU, ground-truth §5) stay on the ops team's existing Excel workflow until Phase 1.1.

**Defensible default.** **EXCLUDED.** Only schools with a 2026-04 MOU (or later) flow into Ops. The SPOC DB is used as a reference / lookup source for schools that DO import (via the D1 pull seam) but the 51 legacy-only schools do not get Ops records until Phase 1.1 explicitly imports them.

Rationale: legacy schools have no MOU documents to reference (pre-date the MOU system going live), mixed pipeline states (some delivered, some in training, some idle), and no signed-values baseline to validate drift against. Importing them cleanly requires the deterministic school-identity reconciliation (P6) to be run at scale with no pre-verified MOU records, plus an acknowledgment backfill for any legacy dispatches. All of that is real work. Better to ship the new-MOU loop first and prove the pipeline, then import legacy once the import helper has been exercised on 10-20 known-good cases.

**⚠ Pending Ameet confirmation.** This is a scope decision Anish does not own unilaterally. The handoff explicitly labels the legacy-in-or-out question as "the open question that needs Ameet's call, and it wasn't in the handoff's list of 6" (ground-truth §5 finding #5). Anish to confirm with Ameet before launch. If Ameet wants legacy-included at launch, this doc's default flips and the Phase 1 scope grows by an estimated 2-3 weeks for the import pass. Capture Ameet's answer as an appended note to this doc (do not silently change the default).

**Observational trigger.** After launch, if ops team reports **>20% of their daily workload is on legacy schools** (e.g. "half my day is still in Excel because most of my active schools aren't in the app"), revisit Phase 1.1 with a legacy import pass. Also monitor: if Shubhangi raises an invoice for a legacy school and cannot find it in Ops → that is a direct ops-friction signal.

**Rollback cost.** HIGH (flagged as highest-cost rollback in this doc). Rollback requires:
- Running the P6 school-identity reconciliation against the SPOC DB's 51 legacy entries (human-review queue of up to 51 items).
- Backfilling acknowledgment state for any legacy dispatches that happened before Ops existed (either "assume acknowledged" blanket migration note, which pollutes audit integrity, or ask each legacy school to retro-confirm, which is a customer-facing operation).
- Reconciling inventory allocations that were already committed out of stock for legacy schools (ground-truth §2d shows the inventory is already tracked but not tied to MOUs in-app).
- Accepting that legacy MOUs have no signed-values baseline, so drift detection (item B) cannot apply retroactively.

Mitigation if trigger fires: do not try to backfill everything. Phase 1.1 imports the legacy set with `origin: migrated` and `preDataWarranty: true` flags (ground-truth §6 Q13 proposal), which excludes them from drift detection and skips acknowledgment backfill. That is a material data-integrity compromise but it caps the rollback cost at roughly 1 week of work.

**Monitoring mechanism.** Two signals:
- Daily active MOU count in Ops vs total active MOUs across the business (delta = legacy still-on-Excel). Target: delta drops to near-zero as new MOUs flow in over 3-6 months.
- Ops team verbal / Slack / WhatsApp complaint: "my workload is still mostly Excel." Capture as weekly check-in with Shubhangi / Pradeep for the first 60 days post-launch.

---

## D. CC rule scope: literal vs representative

**Assumption.** The 10 CC rules from ground-truth §3b are literal. A rule that says "Keep Prodipto, Avishek, Deepjyoti in CC while sending the welcome note for East Schools" fires ONLY for welcome notes, not for installment pings or dispatch notifications.

**Defensible default.** **Literal scoping per rule.** Each CC rule carries an explicit `contexts: [welcome-note, installment-ping, dispatch-notification, closing-letter, all-communications]` array. At rule-encode time (import from SPOC DB), default the context list to whatever the rule's free-text explicitly names (`"welcome note"` → `[welcome-note]`; `"all TTT Schools"` → `[all-communications]`; unspecified → `[all-communications]` as a conservative fallback). All 10 rules ship with `enabled: true`.

Why literal: rules were written by humans who thought about context. Representative-scoping ("welcome note probably means all communications") silently expands the blast radius of each rule beyond what the author intended. Misba or the zonal managers who wrote them can always broaden by toggling.

**Observational trigger.** Misba or a zonal manager reports missing CC recipients on installment or dispatch pings ("hey, why didn't Pallavi get the installment reminder for [school]?"). Also monitor the "communications log" entity (Q-I) for any outbound email where the CC list looks unexpectedly short for the school's region.

**Rollback cost.** LOW. Per-rule context scope is data, not code. Admin UI can widen or narrow a rule's `contexts:` array with one edit; next outbound email re-resolves CC lists at send-time.

**Monitoring mechanism.** Post-send communication log shows CC recipients. A periodic "CC audit" report (e.g. weekly) compares actual CCs against a predicted "you probably meant" shadow calculation that widens each rule to `all-communications`. Large deltas signal either a too-narrow rule or a miscount; either way, worth a look.

---

## E. Commitments-register shadow copy

**Assumption.** No shadow copy of the "commitments made to school" register exists outside `Mastersheet-Implementation_-_AnishD.xlsx` Sheet1. Anything captured informally (WhatsApp, verbal) is lost. The register has 2 rows pending Pratik/Shashank approval (ground-truth §2c).

**Defensible default.** Ops **captures commitments fresh from the next MOU forward.** New-MOU flow includes a "Commitments made to school" free-text field on the actuals-confirmation screen; Sales owner fills it in; Sales Head approves. Historical commitments (pre-Ops-launch) are not retroactively captured.

Why this default is safe: assuming a shadow copy exists without seeing it is speculative. Assuming one does not exist is conservative and still lets the system work for new MOUs.

**Observational trigger.** A MOU arrives where ops remembers a WhatsApp / verbal commitment that the Sales owner did not capture in the actuals-confirmation step. First time this happens, ops flags: "This school was promised X; it is not in the system."

**Rollback cost.** LOW. Add an "Add historical commitment" affordance on the MOU detail page (same entity, free-text field, same approval flow). Roughly half a day of work. No schema change.

**Monitoring mechanism.** Ops-team feedback. A single flag in the first 60 days post-launch is enough to add the affordance. No automated metric needed; the user reports the gap when they hit it.

---

## F. GSTIN availability

**Assumption.** Schools need a GSTIN before a Proforma Invoice can be issued. The MOU system's `schools.json` shows `gstNumber: null` for every record today (step-3 §10b). Ops will need to capture GSTINs before PI generation can run.

**Defensible default.** **PI generation is BLOCKED per-school for schools with null GSTIN,** with a clear UI state on the school detail page: *"GSTIN required before a PI can be issued for this school."* Capture affordance is a single field on the school detail page; Ops or Accounts fills it in; the block lifts. Before blocking, validate GSTIN format (regex for India GSTIN: 15 chars, structured).

Why this default is safe: it surfaces the problem early (first PI attempt on a GSTIN-less school). It does not silently generate an invalid PI. It does not require Ops to do a pre-launch data-collection sweep.

**⚠ Separate ask of Shubhangi (external escalation track per kickoff D3).** Anish to ask Shubhangi: **are GSTINs already captured in Tally, or anywhere else, for our existing schools?** If yes, one-time import at launch closes the gap for the 148-school backlog. If no, per-school capture flow is the only path. The answer changes whether launch-day is smooth or a few weeks of friction while ops fills in GSTINs.

**Observational trigger.** If **>30% of MOUs at launch have null GSTIN AND ops team reports the per-school capture flow is too slow**, consider a bulk CSV import path in Phase 1.1.

**Rollback cost.** LOW. Bulk import is additive: a simple CSV uploader on the admin route that populates `gstNumber` for listed schoolIds. No schema change. Roughly 1 day of work.

**Monitoring mechanism.** PI-generation error rate (attempts blocked by null GSTIN). Ops team complaint volume on the per-school capture flow (subjective but clear). Weekly tally in the admin dashboard.

---

## G. MOU reconciliation plumbing untested at scale (Q-G from step 3)

**Assumption.** MOU's `pendingUpdates.ts` + `githubQueue.ts` + `issuePiNumberAtomic` infrastructure, which Ops is inheriting verbatim, has been exercised only once in production (MOU's `pi_counter.json` shows `next: 2`, meaning one PI ever issued through the app). Inheriting this infra means inheriting an under-exercised race-condition surface.

**Defensible default.** **Ops ships with its own explicit test suite** covering:
- Queue-append atomicity under concurrent writes (two API requests enqueue simultaneously; both entries land with distinct UUIDs; queue file shape is valid JSON after).
- PI counter atomicity (two simultaneous `issuePiNumberAtomic` calls produce two distinct PI numbers; counter advances by exactly 2).
- Reconciliation UI: payment-to-PI shortlist produces stable results under the same payment data; human-confirm writes a valid `Payment.piNumber` with an `auditLog[]` entry.
- 409 sha-conflict retry path (mock-GitHub responding 409 once, then 200 on retry; caller sees success with a single entry in the queue).
- Commit-message prefix contract (every queue-driven commit starts with `chore(queue):` so Vercel `ignoreCommand` skips correctly).

Target: these tests run on every PR via `npm test` (Vitest, same harness as MOU). Red CI = no merge.

**Observational trigger.** **Any** of: race condition reported in production, PI counter skip observed (e.g. two PIs with the same number, or a jump in the sequence), queue file corruption (invalid JSON, missing entries, duplicate entries). Emergency review, not a graceful degradation.

**Rollback cost.** HIGH. A corrupted queue or skipped PI counter is a data-integrity incident. Recovery requires: git history archaeology on the queue file, manual state reconstruction, potentially re-issuing PIs (which breaks accounting continuity). The test suite IS the rollback prevention; if the tests are green and the prod incident happened anyway, that tells us the test coverage had a gap, and Phase 1.1 adds the missing test.

**Monitoring mechanism.**
- CI: every PR runs the test suite. Any failure blocks merge.
- Prod: a daily sync-runner check reads `src/data/pi_counter.json` and `src/data/pending_updates.json`, verifies JSON validity, verifies counter monotonicity against the prior day's value, alerts Anish on any anomaly.
- A "reconciliation health" admin dashboard that shows: queue entries in last 24h, PIs issued in last 24h, retry counts, 409s encountered, 5xx errors from the Contents API.

---

## H. CC rule override (Anish overrode Misba's "ignore")

**Assumption.** The 10 CC rules matter in Phase 1, despite Misba's framing that they are "manual bookkeeping, skip it." Anish's override rationale: the friction today is manual CC (humans remembering who to copy); the system makes CC automatic so the burden goes to zero. The rules exist for real reasons (zonal visibility, TTT training-team loop, multi-trainer coordination); silent removal is information loss.

**Defensible default.** All 10 rules encoded per D's schema (context-scoped arrays, per-rule `enabled: true`), behind a per-rule admin toggle. Toggle UI is visible to Admin (Anish) and Ops Head (Misba by role). Default state for every rule is `enabled: true`.

Why safe: reversible. If Misba decides a rule is genuinely bookkeeping cruft, she flips the toggle, and the rule stops firing from that moment forward. If she is wrong about a rule (a zonal manager complains), she flips it back. The only thing we cannot do is retroactively un-send an email that was CC'd because a rule fired; but no version of this doc's plan does that.

**Observational trigger.** Misba or Ameet explicitly request a rule to be disabled post-launch. First toggle-off is a signal; multiple toggle-offs in the first 30 days signal that the "literal CC rules matter" assumption was oversold.

**Rollback cost.** TRIVIAL. One toggle per rule. Admin UI change propagates to next outbound email at send-time.

**Monitoring mechanism.** Admin toggle-off events logged to the Admin audit log (separate from per-MOU audit logs). A monthly count visible on Admin dashboard.

---

## I. Email deliverability (new, not in A-H)

**Assumption.** Email is the canonical notification channel (P3). Ground-truth §1a row 13 already shows one MOU school ("SD Sr Sec School, Rohtak") with a bounced thank-you email and no alternate captured. Ground-truth §3c shows 3 of 57 SPOC DB schools with missing or malformed email addresses. Email reaches around 94% of schools at launch.

**Defensible default.** Ship with **email as the only outbound channel**, plus a **"communication failure" queue** that catches bounces, SMTP errors, and explicit no-email-of-record schools. Queue items require ops intervention (fetch a fresh email, use the click-to-copy WhatsApp draft from P3's /office-hours recommendation if approved by /plan-ceo-review, or fall back to phone). Bounces route automatically; missing-email schools are flagged at the moment a ping would have fired ("This school has no email captured; action required before we can notify them").

Why safe: email quality is high-enough (94% of SPOCs reachable) that an all-WhatsApp pivot is unjustified. The fallback UI surfaces exceptions rather than hiding them.

**Observational trigger.** Bounce rate exceeds **5% of sends in any 7-day window**. That would push us from ~6% failure today (3/57 SPOCs missing + known bounces) up into territory where a second channel is worth the integration cost. Also trigger: ops team reports spending significant time on communication-failure queue entries.

**Rollback cost.** MEDIUM. Depends on the next channel:
- If the chosen next channel is WhatsApp click-to-copy draft (already on /plan-ceo-review's agenda as Approach B of P3), rollback is the Phase-1 scope addition itself, already estimated as S (a button + text generator).
- If the next channel is WhatsApp Business API, rollback is 2-3 weeks for Meta template approvals + per-message infra.

**Monitoring mechanism.** Communication-failure queue depth (dashboard tile). Bounce-rate weekly trend (analytics). Ops report of "schools I couldn't reach this week."

---

## J. Sales-owner-to-school mapping (new, not in A-H)

**Assumption.** The "sales-person-to-school mapping for current quarter" exists and can be captured at launch. Today it is implicit (handoff line 190 lists it as "still to collect from the team"). MOU's `sales_team.json` has 5 placeholder entries (step-3 §10e). The Google Form MOU submissions have unreliable Account Owner values (step-3 §10b: school names, SPOC names, failed delivery emails appearing in the sales-owner column).

**Defensible default.** Per kickoff D2, **Anish seeds Ops's own `src/data/sales_team.json` with real sales-team data at launch.** Per-MOU sales-owner assignment is captured on the MOU-detail screen at import time (not derived from the Google Form's Account Owner column, which is advisory only). Ambiguous or missing assignments route to an "assignment queue" for Anish or Ameet to resolve before the MOU advances to actuals-confirmation.

Why safe: treats the Google Form field as what it is (a notebook), and forces an explicit sales-owner capture at a clear moment (import). Does not try to auto-infer from unreliable source data.

**Observational trigger.** Assignment queue backlog exceeds **5 MOUs not resolved within 48 hours of import**. That says either the sales team list is incomplete, or the MOU import volume is outpacing the resolution bandwidth.

**Rollback cost.** LOW. Extend `sales_team.json` with the missing people; close the queue items. If the Google Form becomes more reliable later (e.g. MOU system adds a structured sales-owner dropdown), Ops's import can auto-assign with human-confirm for ambiguous cases (same P6 pattern applied to a third queue).

**Monitoring mechanism.** Assignment queue tile on the Admin dashboard. Weekly "unassigned MOUs" count.

---

## Call-requiring items not convertible to triggers

After synthesising A through J, one item genuinely does not convert to a trigger pattern:

**C (legacy-school import) requires Ameet's confirmation before launch, not a post-launch trigger.** The default proposed here (EXCLUDED) is a scope decision, and Phase 1 is Ameet's project. If he says "include legacy schools at launch," a post-launch trigger would be too late; the launch plan itself would be different. Anish to get Ameet's explicit answer and append it to this doc as a dated note before Week 1 code lands.

No other item on A-J has this property. Items A, B, D, E, F, G, H, I, J all have defensible defaults that are correct often enough to ship, with observable signals that surface wrongness before it compounds.

One item deserves a nearby "ask this quickly" rather than "wait for a trigger":

**F (GSTIN availability) benefits from Anish asking Shubhangi NOW** (not blocking launch, but pre-launch rather than post-launch). "Do we have GSTINs for our schools in Tally or anywhere else?" is a 5-minute question. If the answer is yes, import at launch unblocks PIs immediately; if no, the per-school capture flow is the default regardless and launch is unaffected. Asymmetric upside: ask.

---

## Aggregate risk posture

Of the 10 items above:
- **HIGH rollback cost:** C (legacy import), G (reconciliation plumbing).
- **MEDIUM rollback cost:** A (P2 exception mechanism), I (email deliverability).
- **LOW or TRIVIAL rollback cost:** B, D, E, F, H, J.

The HIGH rollback items both have strong mitigations: C has the `preDataWarranty: true` escape hatch; G has the test suite as prevention. Neither is a launch blocker; both are launch risks to monitor actively for the first 60 days.

The MEDIUM rollback items are both channel or workflow questions with well-known alternative implementations. Neither is novel engineering.

The LOW rollback items are mostly config values or minor UI affordances. Not launch-shaping.

## Review cadence

Proposal: **Anish reviews this doc plus the actual monitoring signals weekly for the first 4 weeks post-launch, then monthly through month 3.** If any trigger fires, the corresponding default is reconsidered and the doc is updated with the decision and date. This doc becomes a living artefact, not a one-shot commitment. Update cadence is tracked in the commit log under `docs(plan):` prefix.

## Pending notes (to be appended before launch)

1. Ameet's confirmation on item C (legacy-school import in/out). Date and answer to be added as a note below this line.
2. Shubhangi's answer on item F (GSTINs in Tally or elsewhere). Date and answer to be added as a note below this line.

_No notes appended yet._
