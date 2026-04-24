# /plan-eng-review: Phase 1 architecture lock

Generated via /plan-eng-review framework (HOLD SCOPE mode) on 2026-04-24.
Branch: main. Repo: anishdutta127/gsl-ops-automation. Status: DRAFT.
Mode: HOLD SCOPE. Step 7 CEO review (post-fix, commit `8c21ac0`) locked per-axis scope; this review makes that scope implementable without drift.

## Anchor points (inputs, not subjects of re-debate)

- **step 3 reference reads** (13 MOU files, 5 HR files): D1-D8 locked decisions, MOU architecture as ground truth.
- **step 6 /office-hours**: P1-P6 premises pressure-tested. P1-P5 hold, P6 added (deterministic import). Step 6 Q-J (P2 exception mechanism) resolved to Approach A (CEO-override) via step 6.5 Item A.
- **step 6.5 assumptions-and-triggers**: 10 items A-J with defaults + observational triggers. Replaces the pre-launch shadow call.
- **step 7 /plan-ceo-review post-fix**: SELECTIVE EXPANSION with recommendations: Axis 1 EXPAND-1, Axis 2 HOLD + CONTRACT, Axis 3 HOLD + EXPAND-1, Axis 4 HOLD + EXPAND-1 + EXPAND-2, Axis 5 HOLD (contingent on Ameet). D7 refined per Tension 4.

### Pending-ask status at this review's start

Axis 5 locks at /plan-eng-review start per step 7 Fix 6. Ameet has NOT answered Item C at the time this doc is written. **Axis 5 locks to HOLD (big-bang) for Phase 1.** Legacy-school include becomes a Phase 1.1 flag-flip if Ameet's answer arrives later, not a Phase 1 re-plan.

Item F (Shubhangi on GSTIN availability) remains pending. The PI generator blocks per-school on null GSTIN regardless of Shubhangi's answer (step 6.5 Item F default). If Shubhangi confirms bulk GSTIN capture, the only change is a one-time CSV import at launch; the blocking behaviour stays.

### This review resolves

- Q-A: MOU → Ops import helper detailed design
- Q-B: PI counter continuity policy
- Q-D: Programme enum expansion
- Q-G: MOU reconciliation plumbing test suite
- Q-I: Five net-new entity schemas (Communication, Escalation, SchoolGroup, CcRule, Feedback) plus supporting FeedbackHmacToken
- Q-J: P2 exception mechanism data shape (Approach A, confirmed against step 6.5 Item A)
- Q-K: P6 exact-match auto-link scope
- D7 refinement (Tension 4): staff-JWT middleware + HMAC-verified public feedback endpoint
- Test suite specification (Q-G plus three Phase-1 additional)
- Phase 1 acceptance criteria

### Out of scope for this review

- Ameet's pending answer on Item C. Entity schemas and helper designs stay valid whether legacy is included or not.
- Shubhangi's pending answer on Item F. Doesn't change architecture.
- UI copy, layout, visual treatment: /plan-design-review.
- Onboarding flow, developer ergonomics, self-maintainability: /plan-devex-review.

---

## Architecture lock summary (one-page view)

Phase 1 locks:

- **Data layer**: flat-file-per-entity, JSON array per file, all writes through the queue. ~16 entity files in `src/data/` (MOU-pattern-inherited entity shapes + 5 net-new + 1 supporting `feedback_hmac_tokens.json` + review queues).
- **Queue**: `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts` copy verbatim from MOU. Four strings edited: `DEFAULT_REPO`, `User-Agent`, `PI_COUNTER_DEFAULT.prefix`, nothing else. Concurrency logic untouched.
- **Sync runner**: `.github/workflows/sync-and-deploy.yml` adapted from MOU. Self-hosted Windows runner (same laptop, add new repo authorization). Cron `30 3-13 * * 1-5` UTC (IST business hours, hourly Mon-Fri).
- **Deploy gate**: `vercel.json` byte-identical to MOU (`^chore\(queue\):` ignoreCommand on subject line).
- **next.config.mjs**: `outputFileTracingIncludes` nested under `experimental` (Next 14.2.x silent-strip gotcha). Paths: `/api/pi/generate`, `/api/dispatch/generate`, `/api/delivery-ack/generate`, `/api/feedback/submit`. Template dir: `./public/ops-templates/**/*`.
- **Auth**: `src/middleware.ts` from HR; `/portal/*` candidate-cookie branch stripped; one public path `/api/feedback/submit` added per D7 refinement.
- **MOU → Ops import**: cron-driven pull from MOU's `mous.json` + `schools.json` via GitHub Contents API. Deterministic school-identity resolution: exact name+location match → audit-logged auto-link; ambiguous → human review queue (`src/data/mou_import_review.json`).
- **Entities, net-new**: Communication, Escalation, SchoolGroup, CcRule, Feedback. Supporting: FeedbackHmacToken.
- **Test suite**: 5 mandatory atomicity tests + 3 additional (importer integration, CC resolver, P2 override audit) = 8 tests total.

Everything else (lifecycle stages 1-8, cross-verification matrix, Tally XML generation, ops-templates, dashboard tiles, WhatsApp-draft buttons) is elaboration of these primitives.

---

## Q-A: MOU → Ops import helper (RESOLVED)

**Architecture**: Ops's sync runner fetches MOU's `mous.json` and `schools.json` from `anishdutta127/gsl-mou-system` via the GitHub Contents API on each scheduled tick. Compares each MOU record against Ops's own `mous.json`; new MOUs enter the import pipeline.

**Cron cadence**: Start at the same schedule as Ops's main sync, `30 3-13 * * 1-5` UTC (IST business hours, hourly Mon-Fri). Step 6 proposed `30 * * * *` as a starting calibration; at current volume (under 50 new MOUs/month per handoff growth curve) hourly during business hours is sufficient. Upgrade to every-15-minutes in Phase 1.1 if an observational trigger tells us to.

**Dedup key**: `mou.id` from MOU system (e.g., `MOU-STEAM-2526-001`). Globally unique within MOU's numbering; stable primary key across syncs.

**Mid-write sha-conflict handling**: inherent in the Contents API GET. If MOU is mid-write when Ops reads, Ops sees a slightly stale view; the next tick catches up. Not a correctness problem because import is eventually consistent. The 409 retry inside `atomicUpdateJson` handles Ops's own write collisions separately and is already battle-tested in MOU.

**School-identity resolution** (Q-K Phase 1 scope + P6 principle + Tension 4 safety):

1. **Normalize** incoming school name: lowercase, strip punctuation, collapse whitespace, canonicalize common variants ("St" vs "Saint", "School" vs "Sch", per ground-truth §4b).
2. **Lookup** in Ops's `schools.json` by `(normalized_name, city, state)` tuple.
3. **Exactly one match** → auto-link. Write `auditLog` entry on both the MOU and the School: `action: 'auto-link-exact-match'`, recording source id, target id, and the normalized match key. The audit makes the auto-link visible and reversible.
4. **Zero or multiple matches** → enqueue to `src/data/mou_import_review.json` with full context. Admin or Ops reviews; confirms an existing School id or creates a new School.
5. Every auto-link is reversible: admin route allows re-link with `auditLog` entry `action: 'manual-relink'` capturing before/after school ids.

**Validation at ingestion** (per D4: validate every invariant, quarantine on failure):

Seven validators run on every incoming MOU record. On failure, the record lands in `mou_import_review.json` with `validationFailed: <category>` and never pollutes `mous.json` until a human resolves.

| # | Invariant | Failure category |
|---|---|---|
| 1 | `spWithTax >= spWithoutTax` | `tax_inversion` |
| 2 | `studentsMou > 0 && studentsMou <= 20000` | `student_count_implausible` |
| 3 | `contractValue > 0 && contractValue < 100_000_000` | `contract_value_implausible` |
| 4 | `endDate > startDate` (or both null) | `date_inversion` |
| 5 | `programme IN Programme enum` (see Q-D) | `unknown_programme` |
| 6 | `schoolName !== "" && schoolName.length < 200` | `schoolname_implausible` |
| 7 | `mou.id` matches `/^MOU-[A-Z]+-\d{4}-\d{3}$/` OR known chain-MOU format | `id_format` |

Thresholds (20000, 100_000_000) chosen for headroom over current observed max (Narayana 7950 students, largest MOU Rs 7 Cr) plus generous safety margin. Values are config, not hardcoded in validator logic.

Review-queue item envelope:
```ts
interface MouImportReviewItem {
  queuedAt: string                  // ISO
  rawRecord: unknown                // full MOU record as received
  validationFailed: string | null   // null if the issue is just school-match ambiguity
  quarantineReason: string          // human-readable summary
  resolvedAt: string | null
  resolvedBy: string | null         // user identity
  resolution: 'imported' | 'rejected' | 'punted-upstream' | null
}
```

**Observability** (ties to Axis 1 EXPAND-1 dashboard):
- Tile: "MOU import queue depth": count of unresolved items.
- Tile: "Import auto-link hits/misses (7d)": auto-link count vs review-queued count.
- Tile: "Validation failure breakdown (7d)": per category.

**File paths**:
- `src/lib/importer/fromMou.ts`: main import helper.
- `src/lib/importer/fromMou.test.ts`: integration tests (Test 6 in Q-G's suite).
- `src/lib/importer/validators.ts`: the 7 validators, each pure and unit-testable.
- `src/lib/importer/schoolMatcher.ts`: normalization + exact-match lookup.
- `src/data/mou_import_review.json`: review queue storage (queue-managed writes).

**Legacy-school behaviour** (Item C pending, anchor section above): the Phase 1 helper filters incoming MOUs by `academicYear >= '2026-27'` at ingestion. If Ameet flips to include-legacy later, the filter gates on a single config flag; the Phase 1.1 change is a flag flip plus a one-time import pass against MOU's 148-MOU backlog. Not a helper rewrite.

---

## Q-B: PI counter continuity (RESOLVED with pending Shubhangi ask)

**Default**: Ops ships with its own PI counter file `src/data/pi_counter.json`, prefix `GSL/OPS`, starting at `{ fiscalYear: "26-27", next: 1, prefix: "GSL/OPS" }`.

In `src/lib/githubQueue.ts`:
```ts
const PI_COUNTER_DEFAULT: PiCounter = { fiscalYear: '26-27', next: 1, prefix: 'GSL/OPS' }
```

**Rationale**: MOU's counter advanced to `next: 2` in production (one PI issued). Ops has its own PI-raising flow with distinct accounting significance (Phase 1 Ops loop vs historical MOU PIs). Separate prefix avoids cross-app conflation and the 409-surface of two repos writing to a shared counter via Contents API.

**Pending Shubhangi ask (D3-adjacent)**: if accounts explicitly want GSL-wide continuous numbering (single stream across MOU and Ops for Tally clarity), flip `PI_COUNTER_DEFAULT` to `{ fiscalYear: "26-27", next: <MOU current + 1>, prefix: 'GSL/MOU' }` at launch. Single config change. Rollback cost: LOW.

**Observability**: the daily sync-runner check (step 6.5 Item G monitoring mechanism) reads `pi_counter.json`, verifies `next` monotonicity vs prior day. Skip or duplicate fires emergency review.

---

## Q-D: Programme enum expansion (RESOLVED, with one open item flagged)

**Ops Programme enum, locked**:
```ts
export type Programme =
  | 'STEAM'            // MOU-originating
  | 'Young Pioneers'   // MOU-originating
  | 'Harvard HBPE'     // MOU-originating
  | 'GSLT-Cretile'     // 18 of 24 2026-04 MOUs per ground-truth §1
  | 'TinkRworks'       // 5 of 24
  | 'VEX'              // 1 of 24; no MOU per MOU's templates.ts line 21-22 comment
```

Six values. Three carry from MOU's enum. Three are Ops-native.

### Open item: STEAM vs GSLT-Cretile at import

Ground-truth §1 identifies 18 of 24 MOUs as `GSLT-Cretile`. MOU's enum has only `STEAM`. At import, every `GSLT-Cretile` MOU would hit validator 5 (`unknown_programme`) and land in the review queue unless resolved ahead of time.

**Question for Ameet or Shubhangi** (one-line Slack): *Is `GSLT-Cretile` a sub-programme of `STEAM` (and MOU's enum abstracts it away into `STEAM`), or a distinct programme that just got absorbed under the `STEAM` label in MOU's current data?*

**Phase 1 default until answered**: treat as distinct. Ops's enum has all 6 values; incoming MOUs with `programme: 'STEAM'` import as `STEAM`. If the expected product mix (Cretile kits per student) doesn't materialize at actuals-confirmation, an admin `re-classify-programme` action on the MOU moves it to `GSLT-Cretile`. This is a non-destructive migration (the `programme` field is a value, not a structural identity key).

**Migration cost by answer**:
- *"Distinct, as drafted"* → zero. Current design is correct.
- *"They are the same, absorbed under STEAM"* → one enum-merge commit + a bulk `programme` update across affected MOUs. Low cost.
- *"Distinct, but GSLT-Cretile is a STEAM sub-type"* → add `programmeSubType` field on MOU; existing Ops-imported `STEAM` MOUs get reclassified when actuals confirm. Moderate cost.

**Flagged in**: `docs/OPEN_ITEMS.md` (to be created as part of Phase 1 scaffolding) with the one-line Slack to draft. This open item does NOT block Phase 1; it affects at-launch data hygiene.

---

## Q-G: Reconciliation plumbing test suite (RESOLVED)

**Test environment**: Vitest (matches MOU's test harness). Tests in `src/lib/**/*.test.ts` colocated with their subjects.

### Five mandatory tests (red CI = no merge)

**Test 1: `queueAppend.test.ts`: concurrent queue-append atomicity**

```
Given: two concurrent enqueueUpdate calls with distinct entities.
When:  both resolve.
Then:  pending_updates.json contains exactly 2 entries with distinct UUIDs;
       file is valid JSON; both calls report status 200.
```

Mock GitHub Contents API: first PUT 200, second PUT 409, retry 200 with merged state. Assert both entries land. Assert `retryCount === 1` on the loser's PendingUpdate record (read back from `pending_updates.json` after both writes complete). This verifies the entity-level retry tracking, which feeds the "retries last 24h" dashboard metric.

**Test 2: `piCounterAtomic.test.ts`: concurrent counter atomicity**

```
Given: two concurrent issuePiNumberAtomic calls.
When:  both resolve.
Then:  two distinct piNumber values returned; pi_counter.json.next
       advances by exactly 2; neither caller sees a duplicate.
```

Same 409-retry mock. Assert `piNumber1 !== piNumber2 && counter.next === initial.next + 2`.

**Test 3: `reconcileShortlist.test.ts`: shortlist stability and top-3 accuracy**

```
Given: payments.json with 10 unmatched entries; pis.json with 15 pending.
When:  shortlist helper runs for a specific payment amount.
Then:  deterministic ranked list (same input → same order);
       known-correct PI appears in top 3 candidates.
```

Stability: run twice, assert identical order. Accuracy: inject a known payment-PI pair; assert the PI is in top-3.

**Test 4: `409Retry.test.ts`: sha-conflict retry path**

```
Given: GET returns sha S1, PUT 409, retry GET returns sha S2, retry PUT 200.
When:  atomicUpdateJson resolves.
Then:  mutate called twice (fresh state on retry); final state reflects
       the second mutate; retry count < maxRetries.
```

**Test 5: `commitPrefixContract.test.ts`: every queue commit is `chore(queue):` prefixed**

```
Given: any call to appendToQueue or issuePiNumberAtomic.
When:  the call resolves.
Then:  the commit message recorded by the Contents API matches
       /^chore\(queue\):/ exactly.
```

Regression-catch rationale: if a refactor drops or mutates the prefix, `vercel.json`'s `ignoreCommand` silently stops skipping queue commits. Every queue write then triggers a Vercel build and burns quota. This test guards the contract explicitly.

### Three additional Phase 1 tests (in Phase 1 scope; not in the "5 mandatory" label but required before launch)

**Test 6: `importerIntegration.test.ts`**: end-to-end mock of MOU Contents API responses; drives `fromMou.importOnce()`; asserts import queue items, validation failures, and auto-link decisions match fixtures across 10 representative input shapes (single-school MOU, chain MOU, name+location exact match, near-duplicate name, tax-inverted pricing, date-inverted dates, unknown programme, missing required field).

**Test 7: `ccRuleResolver.test.ts`**: for each of the 10 pre-seeded SPOC-DB rules, assert `resolveCcList(context, schoolId, mouId)` returns the right CC list across the context matrix (`welcome-note` / `three-ping-cadence` / `dispatch-notification` / `feedback-request` / `closing-letter` / `escalation-notification` / `all-communications`). Verifies literal scoping per step 6.5 Item D.

**Test 8: `p2ExceptionAudit.test.ts`**: CEO-override on a Dispatch writes the expected `auditLog` entry with user, reason, and before/after gate state. Finance acknowledgement writes follow-up entry. State machine transitions are consistent with the Q-J data shape. Covers the Axis 5 Approach-A contract.

### Acceptance criterion for Q-G

All 8 tests green in `npm test`. Red CI blocks merge. CI runs on every PR.

### Beyond tests: production observability

The daily sync-runner check reads `pi_counter.json` and `pending_updates.json` in production, verifies JSON validity and counter monotonicity, and alerts Anish on any anomaly. This check catches prod incidents that unit tests can't reproduce (e.g., corrupted JSON due to an interrupted sync commit). Step 6.5 Item G monitoring mechanism.

---

## Q-I: Five entity schemas (RESOLVED)

All schemas declared in `src/lib/types.ts` (flat types module, matching MOU's pattern: plain TypeScript, no Zod, no runtime validation layer). **Every new entity includes `auditLog: AuditEntry[]` inherited from MOU's pattern** (step 3 §10c): `{timestamp, user, action, before, after, notes}`. Exception: FeedbackHmacToken is a short-lived auth primitive and carries no auditLog (justified inline).

Phase 1 ships six entity types total: Communication, Escalation, SchoolGroup, CcRule, Feedback, plus the supporting FeedbackHmacToken.

### Communication

The outbound-messages entity. Covers both email sends (Axis 2 CONTRACT, handoff three-ping cadence, all lifecycle notifications) and WhatsApp-draft copy events (Axis 4 HOLD + EXPAND-1 + EXPAND-2 in one record shape).

```ts
export type CommunicationChannel =
  | 'email'
  | 'whatsapp-draft-copied'

export type CommunicationType =
  | 'welcome-note'
  | 'three-ping-cadence-t-30'
  | 'three-ping-cadence-t-14'
  | 'three-ping-cadence-t-7'
  | 'actuals-confirmation-request'
  | 'pi-sent'
  | 'payment-received-confirmation'
  | 'dispatch-raised'
  | 'delivery-acknowledgement-reminder'
  | 'feedback-request'
  | 'escalation-notification'
  | 'closing-letter'

export type CommunicationStatus =
  | 'queued'        // email channel only: record written, send not yet attempted
  | 'sent'          // email channel only: delivered to SMTP OK
  | 'bounced'       // email channel only: bounce detected
  | 'failed'        // email channel only: non-bounce send failure
  | 'draft-copied'  // whatsapp-draft-copied channel only: terminal; no send state

export interface Communication {
  id: string                    // UUID
  type: CommunicationType
  schoolId: string              // FK schools.json
  mouId: string | null          // FK mous.json when MOU-specific
  installmentSeq: number | null // when installment-specific
  channel: CommunicationChannel
  subject: string | null        // email channel only
  bodyEmail: string | null      // rendered email body
  bodyWhatsApp: string | null   // rendered WhatsApp-variant prose
  toEmail: string | null
  toPhone: string | null
  ccEmails: string[]            // resolved at send-time via resolveCcList
  queuedAt: string              // ISO; always set
  queuedBy: string              // user identity
  sentAt: string | null         // set when status transitions to sent/bounced/failed
  copiedAt: string | null       // set when channel is whatsapp-draft-copied
  status: CommunicationStatus
  bounceDetail: string | null   // SMTP bounce reason or "no-email-of-record"
  auditLog: AuditEntry[]        // inherited from MOU pattern
}
```

#### Channel × Status matrix

State machine differs per channel. Enumerated explicitly so successor ceremonies see the full shape:

| Channel | Initial status | Terminal statuses | Transition trigger | Notes |
|---|---|---|---|---|
| `email` | `queued` | `sent`, `bounced`, `failed` | SMTP/provider callback or send timeout | `queuedAt` always set; `sentAt` set on terminal transition |
| `whatsapp-draft-copied` | `draft-copied` | `draft-copied` | Server-side write on "Copy draft" click | Written directly as terminal; never passes through `queued`; `copiedAt` set at write time |

Invalid combinations rejected at write time:
- `channel: 'email'` with `status: 'draft-copied'`.
- `channel: 'whatsapp-draft-copied'` with `status !== 'draft-copied'`.
- `channel: 'email'` without `subject` and `bodyEmail` (empty content).
- `channel: 'whatsapp-draft-copied'` without `bodyWhatsApp`.
- `status: 'bounced'` without `bounceDetail`.

Phase 1.1 additions (WhatsApp Business API, SMS) extend both enums; the Communication interface itself does not need a schema migration, only new channel/status values.

### Escalation

The exception-flow entity. Driven by Misba's escalation matrix (lane + level structure from kickoff intel A). Phase 1 writes Escalations for manual flags, P2 CEO-overrides (Q-J), and system-generated cases. Feedback-origin escalations are Phase 1.1 (Axis 3 EXPAND-2) but the schema supports them now, so no migration is needed when the trigger lands.

```ts
export type EscalationLane = 'OPS' | 'SALES' | 'ACADEMICS'
export type EscalationLevel = 'L1' | 'L2' | 'L3'
export type EscalationOrigin = 'manual' | 'p2-override' | 'feedback' | 'system'
export type EscalationStage =
  | 'mou-signed'
  | 'actuals-confirmation'
  | 'dynamic-recalculation'
  | 'proforma-invoice'
  | 'payment-reconciliation'
  | 'kit-dispatch'
  | 'training-rollout'
  | 'feedback-escalation'

export type EscalationStatus = 'open' | 'acknowledged' | 'resolved' | 'withdrawn'
export type EscalationSeverity = 'low' | 'medium' | 'high'

export interface Escalation {
  id: string
  createdAt: string
  createdBy: string         // user identity; 'system' for auto-created
  schoolId: string
  mouId: string | null
  stage: EscalationStage
  lane: EscalationLane
  level: EscalationLevel
  origin: EscalationOrigin
  originId: string | null   // FK to Feedback.id (origin='feedback') or Dispatch.id (origin='p2-override')
  severity: EscalationSeverity
  description: string
  assignedTo: string | null // computed from (lane, level) at creation per Misba intel
  notifiedEmails: string[]  // fan-out list snapshotted at creation
  status: EscalationStatus
  resolutionNotes: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  auditLog: AuditEntry[]    // inherited from MOU pattern
}
```

**Fan-out resolver** (per Misba intel A):
```
OPS lane:   L1 trainer   → L2 zonal manager → L3 Misba → L4+ Shashank OR Pratik
SALES lane: L1 sales rep → L2 zonal manager → L3 Misba OR Shashank → L4+ Pratik D
```

At creation time, `notifiedEmails` is populated with addresses for `(lane, level)` plus one-level-up (L2 notifications CC L3). Snapshotted so the fan-out is auditable even if user roles change later.

### SchoolGroup

The chain-MOU entity. Confirmed pattern per Misba intel C: Narayana (West Bengal), Techno India, Carmel. Not a one-off. Seed records at launch.

```ts
export type SchoolScope = 'SINGLE' | 'GROUP'

export interface SchoolGroup {
  id: string                  // "SG-NARAYANA_WB", "SG-TECHNO_INDIA", "SG-CARMEL"
  name: string                // "Narayana Group of Schools, West Bengal"
  region: string              // "East" | "North" | "South-West" per SPOC DB sheet nomenclature
  createdAt: string
  createdBy: string
  memberSchoolIds: string[]   // FK array to schools.json
  groupMouId: string | null   // FK to mous.json when one-MOU-covers-all-members
  notes: string | null
  auditLog: AuditEntry[]      // inherited from MOU pattern
}
```

**Additions to the existing `MOU` interface** (inherited shape from MOU system, extended for Ops):

```ts
// Extensions applied to MOU in src/lib/types.ts:
schoolScope: SchoolScope     // 'SINGLE' default; 'GROUP' for chain MOUs
schoolGroupId: string | null // FK to SchoolGroup when schoolScope is GROUP
```

**GROUP-scope semantics**: installment plan lives at the MOU level; Dispatch, Training, Actuals live at the member-school level; Feedback can live at both levels. Validator: an MOU with `schoolScope: 'GROUP'` requires `schoolGroupId` non-null AND a valid SchoolGroup with non-empty `memberSchoolIds`.

At Q-A import, the helper detects likely GROUP patterns (school name contains "Group of Schools", `studentsMou` exceeds the single-school plausibility threshold ~1500, or matches a ground-truth-known group name) and routes to the review queue for human SINGLE-vs-GROUP classification plus (if GROUP) SchoolGroup selection or creation.

### CcRule

The email-CC rule entity. Encodes all 10 SPOC-DB rules from ground-truth §3b. Literal scoping per step 6.5 Item D. Per-rule `enabled` toggle defaulting `true` per step 6.5 Item H.

```ts
export type CcRuleScope =
  | 'region'           // all schools in a region
  | 'sub-region'       // e.g. "Bangalore" within South-West
  | 'school'           // single schoolId
  | 'training-mode'    // all TTT schools, all GSL-Trainer schools
  | 'sr-no-range'      // North sheet "Sr.no 1 to 7"

export type CcRuleContext =
  | 'welcome-note'
  | 'three-ping-cadence'
  | 'dispatch-notification'
  | 'feedback-request'
  | 'closing-letter'
  | 'escalation-notification'
  | 'all-communications'   // fallback for unscoped rules

export interface CcRule {
  id: string                // "CCR-SW-RAIPUR-PUNE-NAGPUR", etc.
  sheet: 'South-West' | 'East' | 'North' | 'derived'
  scope: CcRuleScope
  scopeValue: string | string[]  // e.g. "East", ["Raipur","Pune","Nagpur"], "1..7"
  contexts: CcRuleContext[] // literal scoping per step 6.5 Item D
  ccUserIds: string[]       // FK to users.json; resolved to emails at send-time
  enabled: boolean          // step 6.5 Item H; default true
  sourceRuleText: string    // original free-text from SPOC DB (audit)
  createdAt: string
  createdBy: string         // 'import' for 10 pre-seeded, 'admin' for later
  disabledAt: string | null
  disabledBy: string | null
  disabledReason: string | null
  auditLog: AuditEntry[]    // inherited from MOU pattern
}
```

**Resolver signature**:

```ts
// src/lib/ccResolver.ts
export function resolveCcList(params: {
  context: CcRuleContext
  schoolId: string
  mouId: string | null
}): Promise<string[]>        // returns deduplicated CC email list
```

Implementation sketch: load all enabled `CcRule` records; for each rule, test whether `(scope, scopeValue)` matches the school AND `contexts` includes the given context OR contains `all-communications`; union `ccUserIds` across matching rules; resolve via `users.json`; dedupe; return.

**Pre-seed at launch**: 10 `CcRule` records from ground-truth §3b. Examples:
- South-West rule 1 ("Keep Suresh and Pallavi in Cc for Raipur, Pune, Nagpur Schools") becomes `{ sheet: 'South-West', scope: 'sub-region', scopeValue: ['Raipur','Pune','Nagpur'], contexts: ['all-communications'], ccUserIds: [<Suresh>, <Pallavi>], enabled: true, sourceRuleText: "Keep Suresh and Pallavi in Cc for Raipur, Pune, Nagpur Schools" }`.
- East rule 1 ("Keep Prodipto, Avishek, Deepjyoti in Cc while sending the welcome note for East Schools") becomes `{ sheet: 'East', scope: 'region', scopeValue: 'East', contexts: ['welcome-note'], ... }`. Literal scoping: `welcome-note` only, NOT `all-communications`.

Test 7 (`ccRuleResolver.test.ts`, per Q-G) asserts all 10 rules resolve correctly across the context matrix.

### Feedback

The post-installment feedback entity. Per step 7 Axis 3 HOLD + EXPAND-1: 4 structured categories with optional per-category skip. Submitted via magic-link email with HMAC-authenticated submission endpoint (D7 refinement).

```ts
export type FeedbackCategory =
  | 'training-quality'
  | 'kit-condition'
  | 'delivery-timing'
  | 'trainer-rapport'

export interface FeedbackRating {
  category: FeedbackCategory
  rating: 1 | 2 | 3 | 4 | 5 | null   // null = SPOC explicitly skipped this category
  comment: string | null
}

export interface Feedback {
  id: string                      // UUID
  schoolId: string
  mouId: string
  installmentSeq: number          // which installment cycle this follows
  submittedAt: string             // ISO
  submittedBy: 'spoc' | 'ops-on-behalf'
  submitterEmail: string | null   // SPOC email at submission; null for ops-on-behalf
  ratings: FeedbackRating[]       // always length 4; categories in fixed order
  overallComment: string | null
  hmacTokenId: string | null      // FK to FeedbackHmacToken; null for ops-on-behalf
  auditLog: AuditEntry[]          // inherited from MOU pattern
}
```

**Invariants** (enforced at write):
- `ratings.length === 4`; each category present exactly once; order fixed for aggregation stability.
- `submittedBy === 'spoc'` requires `hmacTokenId` non-null AND `submitterEmail` non-null.
- `submittedBy === 'ops-on-behalf'` requires `hmacTokenId === null` (ops manual entry when the SPOC has no email or couldn't use the link); `submitterEmail` optional.
- Per-category `rating: null` means "SPOC chose to skip"; aggregation excludes null ratings rather than treating as 0.

**Phase 1.1 auto-escalation hook** (Axis 3 EXPAND-2, deferred): any `FeedbackRating.rating <= 2` triggers an `Escalation` with `origin: 'feedback', originId: feedback.id, lane: <category-to-lane mapping>`. Category-to-lane mapping:
- `training-quality` → ACADEMICS
- `trainer-rapport` → ACADEMICS
- `delivery-timing` → OPS
- `kit-condition` → OPS

Escalation entity already supports this shape; Phase 1.1 just wires the trigger (no schema change).

### FeedbackHmacToken (supporting entity)

The single-use HMAC token entity supporting the public `/api/feedback/submit` endpoint (D7 refinement, Tension 4). Stored in a separate file `src/data/feedback_hmac_tokens.json` (not embedded on Communication) because tokens are high-churn single-use artefacts; embedding would bloat Communication long-term.

```ts
export interface FeedbackHmacToken {
  id: string             // UUID; used as the "token" query param on the magic link
  mouId: string
  installmentSeq: number
  spocEmail: string      // who the link was issued to
  issuedAt: string       // ISO
  expiresAt: string      // ISO; +48h from issuedAt
  usedAt: string | null  // null until consumed
  usedByIp: string | null
  communicationId: string // FK to Communication that carried this token
}
```

**No `auditLog` by design**: this is a short-lived auth primitive, not a domain entity. The Communication record that carried the token is the audit anchor; Feedback.hmacTokenId links the submission back to the consumed token. Diverges from the MOU pattern deliberately and flagged here so successor ceremonies don't try to re-add it.

**Pruning policy (locked)**: tokens with `usedAt` set AND `expiresAt` in the past are pruned weekly by the sync runner. Before deletion, pruned tokens are archived to `src/data/_audit/feedback_hmac_tokens_YYYY-MM.json` so the observational signal (how many tokens got used, which ones, how long between issuance and use) is preserved. Unused-and-not-yet-expired tokens stay. Unused-and-expired tokens are kept for a 30-day grace window (so Anish can investigate if a SPOC reports a link that should have worked), then archived-and-pruned the same way.

**HMAC verification**: signature over `${mouId}|${installmentSeq}|${spocEmail}|${issuedAt}` using `GSL_SNAPSHOT_SIGNING_KEY` (same key HR uses for candidate magic links). Endpoint confirms single-use: checks `usedAt === null` before accepting; on accept, atomically updates `usedAt` and `usedByIp`.

---

## Q-J: P2 exception mechanism data shape (RESOLVED, Approach A)

Per step 6.5 Item A default (confirmed in step 7 Axis 5 anchor): Approach A (CEO-override with mandatory reason and optional Finance acknowledgement). Data shape on the Dispatch entity:

```ts
export interface DispatchOverrideEvent {
  overriddenBy: string             // user identity; Leadership role only at UI level
  overriddenAt: string             // ISO
  reason: string                   // mandatory; non-empty; UI enforces content
  acknowledgedBy: string | null    // Finance user identity; optional post-hoc ack
  acknowledgedAt: string | null
}

// Extension to the Dispatch entity:
// Forward-compat: same field supports Approach C (Ops raises an L2 Escalation instead
// of Ameet pressing an override button) by widening the UI gate. Server-side data
// shape stays identical; only the route that populates this field changes. No schema
// migration needed for the Approach-A-to-C graduation.
overrideEvent: DispatchOverrideEvent | null
```

Write-side behaviour at gate-override time:

1. Ameet (Leadership role) presses "Override gate" on a Dispatch where Installment-1 is not fully paid.
2. UI collects a non-empty reason.
3. Server writes `dispatch.overrideEvent = { overriddenBy: <Ameet>, overriddenAt: <now>, reason, acknowledgedBy: null, acknowledgedAt: null }`.
4. Server appends `auditLog` entry `action: 'p2-override'` with before `{ overrideEvent: null }` and after `{ overrideEvent: <as written> }`.
5. Server creates an `Escalation` with `origin: 'p2-override', stage: 'kit-dispatch', severity: 'medium', originId: dispatch.id`.
6. The Dispatch's PO-raise gate unblocks. Gate check: `installment1Paid === true || overrideEvent !== null`.
7. Dashboard trigger metric "CEO dispatch overrides (7d / 14d)" reads from `overrideEvent.overriddenAt` across all Dispatches.

Finance acknowledgement (optional, post-hoc): writes `acknowledgedBy` and `acknowledgedAt`; appends `auditLog` entry `action: 'p2-override-acknowledged'`. Neither unblocks nor re-blocks; it's a review-completed marker.

**Rollback to Approach C** (if step 6.5 Item A trigger fires, i.e., CEO overrides exceed 3/week for 2 consecutive weeks): remove the Leadership-only button from the UI; replace with "Open escalation" button that fills the same `overrideEvent` after Misba (OPS lane L3) approves the escalation. Data shape unchanged. UI migration: 2-3 days.

---

## Q-K: P6 exact-match auto-link scope (RESOLVED, Phase 1)

Phase 1 scope, as detailed in Q-A. Re-stated here for completeness:

- Implementation: in `src/lib/importer/schoolMatcher.ts`, exact-match lookup by `(normalized_name, city, state)` tuple.
- If exactly one match: auto-link with `auditLog` entry `action: 'auto-link-exact-match'` on both the incoming MOU and the matched School. Reversible via admin route.
- If zero or multiple matches: queue for human review in `mou_import_review.json`.

Ground-truth §3d's 1-in-8 false-positive rate was on naive name-only matching. Name+location tuple equality is safer: same city + same state + same normalized name is almost always the same school.

Observability: dashboard tile "Import auto-link hits/misses (7d)" (Q-A). If miss-rate spikes, normalization needs tuning; Phase 1.1 watch item.

---

## D7 refinement (Tension 4): staff-JWT middleware + HMAC-verified feedback endpoint

Tension 4 from step 7 established that the recommended Phase 1 scope requires HMAC-token verification on the `/api/feedback/submit` endpoint. D7 originally read "staff-JWT-only middleware, `/portal/*` candidate-cookie branch dropped." Refined as below.

**Middleware**: staff-JWT (from HR's `src/middleware.ts`) with `/portal/*` branch fully stripped. One new public path added:

```ts
// Excerpt from Ops's src/middleware.ts (forked from HR):
const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
  '/api/feedback/submit',   // NEW: D7 refinement per Tension 4
]
// No /portal/* branch. No CANDIDATE_SESSION_COOKIE code path in Phase 1.
// Everything else remains staff-JWT-gated.
```

**Feedback submission endpoint** (`src/app/api/feedback/submit/route.ts`):

1. Parse `tokenId` and the signed HMAC from the query string.
2. Look up FeedbackHmacToken by id; if not found, or `usedAt !== null`, or `expiresAt < now`, return 403.
3. Recompute HMAC over `${mouId}|${installmentSeq}|${spocEmail}|${issuedAt}` using `GSL_SNAPSHOT_SIGNING_KEY`; if mismatch, return 403.
4. Validate submitted Feedback payload (ratings array length 4, each rating in {1..5, null}, etc.).
5. Write Feedback record via the queue with `hmacTokenId: <token.id>, submittedBy: 'spoc', submitterEmail: <token.spocEmail>`.
6. Update FeedbackHmacToken atomically: `usedAt: <now>, usedByIp: <x-forwarded-for>`.
7. Return 201.

**Narrow surface principle**: single route, single function, single-use token. Does NOT reintroduce the full candidate-cookie session path from HR. If Phase 1.1 adds the magic-link SPOC status portal (Axis 2 EXPAND-1), THAT is where the candidate-cookie code path returns; the HMAC endpoint stays as a fast-path for direct-from-email feedback submission.

**D7 final statement** (supersedes original in step 3): staff-JWT middleware as the single authentication primitive for all authenticated surfaces; one narrow public endpoint with HMAC verification for feedback submission. No full candidate-cookie session in Phase 1. Phase 1.1 may reintroduce the candidate-cookie path when/if the magic-link portal lands.

---

## Axis-by-axis implementation plan (files + acceptance per axis)

Step 7's per-axis recommendations, translated to concrete file paths and per-axis acceptance criteria.

### Axis 1: Dashboard depth (EXPAND-1)

**Files**:
- `src/app/dashboard/page.tsx`: Leadership Console root. Server Component; imports from `src/data/` JSON at build time.
- `src/app/dashboard/exceptions/page.tsx`: CONTRACT-style flat exception feed (inner route for pinged landings).
- `src/lib/dashboard/tiles/` (directory): one per-tile aggregator module (`activeMous.ts`, `accuracyHealth.ts`, `collectionPct.ts`, `dispatchesInFlight.ts`, `schoolsNeedingAction.ts`, plus 10 trigger tiles from step 6.5).
- `src/lib/dashboard/aggregate.ts`: shared read-only JSON-traversal helpers (per step 7 Axis 1 ask, no query layer).

**Acceptance**:
- 15 tiles render server-side at build time. Zero `useEffect`-driven data fetches.
- Page cold-load under 500 ms on Vercel free tier.
- Dashboard is effectively static (weekly cadence); real-time is not a Phase 1 goal.
- Per-tile component has a unit test asserting the aggregation logic against a fixture `src/data/*.json` snapshot.

### Axis 2: SPOC portal (HOLD + CONTRACT)

**Files**:
- `src/lib/templates/emailStatusBlock.ts`: helper that renders the "Here's where [school] is" block from MOU + Installment state.
- Updates to all existing outbound-email templates under `src/lib/templates/` to include the status block.

**Acceptance**:
- Every outbound `Communication` with `type IN ('welcome-note', 'three-ping-cadence-*', 'pi-sent', 'dispatch-raised', 'delivery-acknowledgement-reminder')` includes a rendered status block.
- Snapshot test: block output against fixture MOU state reproduces expected copy to the byte.
- Status block never references data the SPOC shouldn't see (internal-only fields like `salesPersonId`, audit log entries).

### Axis 3: Feedback loop (HOLD + EXPAND-1)

**Files**:
- `src/lib/types.ts`: Feedback + FeedbackHmacToken entities (landed in Write 2).
- `src/data/feedback.json` and `src/data/feedback_hmac_tokens.json`: storage; both queue-managed.
- `src/data/_audit/` (directory): archived token JSONL files per pruning policy.
- `src/app/api/feedback/submit/route.ts`: HMAC-authenticated POST handler (D7 refinement).
- `src/lib/hmac.ts`: HMAC sign/verify helpers (shared primitive).
- `src/app/feedback/[tokenId]/page.tsx`: SPOC-facing form page; HMAC-gated at page level.
- `src/lib/dashboard/tiles/feedbackAggregates.ts`: per-category aggregation for dashboard.

**Acceptance**:
- Submit endpoint rejects expired or already-used tokens with 403.
- Submit endpoint rejects payloads with `ratings.length !== 4` or rating values outside `{1..5, null}`.
- Aggregation correctly averages per-category, excluding null ratings.
- All Feedback + FeedbackHmacToken writes go through the queue (no `fs.writeFile`).
- Pruning job (`scripts/prune_hmac_tokens.ts` or equivalent sync-runner step) runs weekly, archives before delete.

### Axis 4: WhatsApp draft button (HOLD + EXPAND-1 + EXPAND-2)

**Files**:
- `src/lib/templates/whatsAppProse.ts`: per-template WhatsApp-variant renderers (~6 templates).
- `src/app/api/communications/log-copy/route.ts`: writes a `Communication` record with `channel: 'whatsapp-draft-copied'`.
- UI components: "Copy WhatsApp draft" button next to each Send affordance.
- `src/lib/dashboard/tiles/whatsAppCopyRate.ts`: per-school aggregation tile (anonymized per step 7 Fix 5).

**Acceptance**:
- Button appears adjacent to every Send affordance in the ops UI (3 cadence screens + 5 other template types).
- Click writes a Communication with `channel: 'whatsapp-draft-copied', status: 'draft-copied', copiedAt: <now>, bodyWhatsApp: <draft>`.
- Dashboard tile "Draft copies last 7 days per school" reads from Communication filtered by channel. **Per-school aggregate only; per-user attribution NOT shown on the dashboard** (step 7 Fix 5 mitigation).
- Per-user attribution accessible ONLY via admin audit route `/admin/audit?filter=communication-copy`.

### Axis 5: Launch strategy (HOLD, big-bang)

**Files**: no code files. This is a rollout plan, captured in `docs/RUNBOOK.md` (to be drafted after /plan-devex-review).

**Acceptance**:
- All entities pre-seeded on launch day: users, schools (from MOU + SPOC DB merge), SchoolGroups (Narayana, Techno India, Carmel), CcRules (10 pre-seeded), sales_team.json (real data per step 6.5 Item J).
- All 2026-04 MOUs imported via Q-A helper; each has `schoolScope: 'SINGLE'` or `'GROUP'` set explicitly at import (never undefined). Narayana's multi-school MOU imports as `'GROUP'` with `schoolGroupId: 'SG-NARAYANA_WB'`.
- Ops credentials distributed to Shubhangi, Pradeep, Misba, Ameet, and named sales reps on the same day.
- Excel tracker marked "read-only export" (social contract, not technical enforcement; see handoff line 148).

---

## Inheritance checklist from MOU

Files and patterns carried from `gsl-mou-system` into Ops, annotated with what needs editing vs what copies verbatim.

| Item | Action | Notes |
|---|---|---|
| `src/lib/pendingUpdates.ts` | copy verbatim | Single file, no changes needed. |
| `src/lib/githubQueue.ts` | copy + edit 4 strings | `DEFAULT_REPO` to `'anishdutta127/gsl-ops-automation'`; `User-Agent` to `'gsl-ops-automation-queue'`; `PI_COUNTER_DEFAULT.prefix` to `'GSL/OPS'` (per Q-B); commit-message prefix stays `chore(queue):` (contract with vercel.json). Concurrency logic untouched. |
| `src/lib/types.ts` | fork, add Ops entities | Keep MOU's types for imported records; add the 5 net-new + FeedbackHmacToken + Dispatch extensions from Q-I/Q-J; add `schoolScope` + `schoolGroupId` to MOU interface. |
| `tsconfig.json` | extend + strict upgrade | Per D6 (step 3 HR-drift adoption), add `noUncheckedIndexedAccess: true` on top of MOU's strict config. Without this row, consumer code that index-accesses arrays/objects stays implicitly non-null-safe against MOU's baseline and D6 never materialises. |
| `src/lib/format.ts` | copy verbatim | Indian money formatting (`Rs 1,50,000`), DD-MMM-YYYY dates, British-English copy lints. |
| `src/lib/templates.ts` | fork pattern, new templates | MOU's templates are MOU-agreement docs (STEAM/YP/HBPE). Ops needs NEW templates for PI, Dispatch Note, Delivery Ack. Reuse the `TemplateSpec`/`PlaceholderSpec` shape. |
| `.github/workflows/sync-and-deploy.yml` | adapt | Concurrency group `ops-sync` (not `sync`); bot email `sync-bot@gsl-ops.local`; env var strategy differs from MOU (Ops has multi-source ingestion via Q-A, not a single xlsx). Revisit before landing. |
| `vercel.json` | copy byte-for-byte | Identical `ignoreCommand`. |
| `next.config.mjs` | fork, new `outputFileTracingIncludes` paths | Route list: `/api/pi/generate`, `/api/dispatch/generate`, `/api/delivery-ack/generate`, `/api/feedback/submit`. Template dir: `./public/ops-templates/**/*`. Keep `experimental.outputFileTracingIncludes` nesting exactly as HR documents it. |
| `src/middleware.ts` (from HR) | fork; strip `/portal/*`; add `/api/feedback/submit` as public | Per D7 refinement, Tension 4. |
| `docxtemplater` + `pizzip` | add as runtime deps | For PI / Dispatch Note / Delivery Ack generation. |

---

## Phase 1 acceptance criteria (end-to-end demo flow)

Phase 1 is "done" when this 11-step flow works against real seeded data at launch:

1. **MOU import**: a new MOU in MOU's `mous.json` (e.g., `MOU-STEAM-2627-001`) appears in Ops's `mous.json` within one sync tick. School is auto-linked (exact-match) or queued (ambiguous). **`schoolScope` is set explicitly (`'SINGLE'` or `'GROUP'`), never left undefined.**
2. **Actuals + cross-verification**: Sales marks actuals confirmed; Ops reviews and confirms; Finance's PI-raise gate unblocks.
3. **PI generation**: Finance clicks "Generate PI" on the MOU; PI docx renders with GSTIN from the school record (OR PI generation is blocked if `gstNumber === null` per step 6.5 Item F, with the "GSTIN required" UI state visible); PI number issued via `issuePiNumberAtomic` with `GSL/OPS` prefix (or `GSL/MOU` if Shubhangi flipped Q-B).
4. **PI sent**: email template fires; `Communication` record written with `channel: 'email', type: 'pi-sent'`; CC list resolved via `resolveCcList`; matching WhatsApp-draft button available on the ops UI.
5. **Payment logged**: Finance enters bank entry; reconciliation helper narrows to top-3 candidate PIs (Q-G Test 3 shape); Finance confirms match; Payment record links to PI.
6. **Dispatch gate unlocks**: Installment-1 paid → Ops sees "Raise PO" button on Dispatch screen. If pre-payment dispatch is needed, Ameet's override writes `overrideEvent` per Q-J.
7. **Dispatch flow**: Ops raises PO → Dispatched → In Transit → Delivered → Acknowledged. Each state change writes to `auditLog`.
8. **Delivery acknowledgement**: ops uploads signed handover form URL (the `Regular_Kits_Handover_template.xlsx` serves as the source template); Dispatch transitions to Acknowledged.
9. **Feedback request**: after Installment-1 paid, feedback-request email fires; `FeedbackHmacToken` issued; SPOC clicks magic link, HMAC verified, form submits ratings + comments; Feedback record written.
10. **Dashboard**: Ameet's Leadership Console shows accurate 5 health tiles + 10 trigger tiles, pre-populated from live data. Exception feed lists items needing attention.
11. **Observability**: the daily sync-runner check (Q-G) passes: JSON validity, counter monotonicity, no race anomalies. All 8 tests green in CI.

**Launch gate**: all 11 flows working end-to-end against at least 3 distinct real MOUs from the 2026-04 cohort: (a) one SINGLE-scope STEAM, (b) one SINGLE-scope TinkRworks or GSLT-Cretile (whichever has a seeded example matched to a GSTIN-captured school), and (c) the Narayana GROUP MOU to exercise the multi-school dispatch path. Any of the 11 flows failing on any of the 3 MOUs = launch blocked. If Ameet flips Item C to legacy-include before launch, add (d) one representative legacy school as the fourth gate.

**Seeding assertion for launch day**: the 2026-04 cohort of 24 MOUs imports with every MOU carrying `schoolScope` set explicitly. The Narayana chain MOU imports as `GROUP` with a pre-seeded `SchoolGroup`; the other 23 import as `SINGLE`. Any MOU without `schoolScope` set at `mous.json` write time fails the Q-A validator and lands in the review queue; this is enforced by a test in `fromMou.test.ts`. Defensive coding in consumer modules (e.g., "if schoolScope undefined, assume SINGLE") is explicitly forbidden: the importer is the single source of truth for this field.

---

## Open items forward to /plan-design-review

- Visual treatment of the 15 dashboard tiles (health + triggers). Layout, typography, alert thresholds (Item A trigger at 3/week: what colour?).
- Feedback form UI (mobile-first per handoff; 4 categories with 1-5 ratings + skip affordance).
- Status-block email template copy + visual layout (Axis 2 CONTRACT). Decides what "good" looks like.
- WhatsApp-draft-copied button placement, copy-confirmation animation, accessibility labels.
- Accessibility audit baseline (WCAG 2.1 AA per handoff; axe-core CI with shrinking baseline).

## Open items forward to /plan-devex-review

- Onboarding flow for non-Anish users (Shubhangi adding a school, Pradeep raising a dispatch, Misba toggling a CcRule).
- Self-maintainability: who can add a new school, new SPOC, new programme, new template without Anish in the loop?
- Admin route discoverability and permissions.
- Launch runbook content (`docs/RUNBOOK.md`).
- CLAUDE.md routing rules for the prompt library.
- Developer-first-run experience (setup instructions, test suite onboarding, ops-data staging).
- `docs/OPEN_ITEMS.md` framing for Q-D's STEAM vs GSLT-Cretile open question (how does it get resolved, by when, who owns it).

---

## Phase 1.1 backlog (deferred)

- Axis 2 EXPAND-1: magic-link read-only SPOC status portal (candidate-cookie code path returns here).
- Axis 3 EXPAND-2: feedback-driven auto-escalation (wires the Escalation `origin: 'feedback'` trigger).
- Axis 5 EXPAND-1: incremental rollout (flag-gated in Q-A importer; activated if Ameet says include-legacy).
- Legacy-school import: 51 SPOC-DB-only schools + 148 MOU backlog (if Item C flips).
- Bulk CSV GSTIN import (if Item F trigger fires at 30%+ null-GSTIN rate).
- P2 Approach C migration (if step 6.5 Item A trigger fires: override count exceeds 3/week for 2 weeks).
- Trainer scheduling (handoff Phase 2).
- Vendor warehouse inventory forecasting (handoff Phase 2).
- WhatsApp Business API (handoff Phase 2).
- Tally XML pattern integration (inherited from MOU, not spec'd in Phase 1).
- Multi-tenant retrofit for Arvind Mafatlal Group (handoff Phase 3).

---

## Risk registry

Launch risks with mitigations. Eight total (seven called out in your brief plus one of my own).

| # | Risk | Mitigation |
|---|---|---|
| 1 | Q-G reconciliation plumbing under-exercised in MOU (1 PI issued ever). First prod stress happens on Ops. Race conditions, counter skips, corrupted queue JSON are all plausible. | 8-test suite (5 mandatory + 3 additional) must pass on every PR; daily sync-runner production check on JSON validity and counter monotonicity per step 6.5 Item G. |
| 2 | Item C legacy-include flip (Ameet). If he says yes, Phase 1.1 back-fills 51 schools (+ 148 MOU backlog) through the Q-A helper at scale in one import pass. Auto-link misses and validator failures will pile up. | Q-A importer already designed as a flag-gated filter (`academicYear >= '2026-27'`); flip the flag and run one-time import pass. Review queue depth handles volume. No helper rewrite. |
| 3 | Programme enum ambiguity (Q-D open item). If GSLT-Cretile is actually STEAM or a STEAM sub-type, 18 of 24 2026-04 MOUs either misfile or need migration. | Phase 1 default treats as distinct; migration cost enumerated by answer in Q-D. Flagged for Slack to Ameet/Shubhangi; `docs/OPEN_ITEMS.md` tracks. |
| 4 | Item F GSTIN non-availability at launch. If Shubhangi confirms no central GSTIN capture exists, every PI generation for a school with `gstNumber === null` must block. | PI generator blocks per-school on null GSTIN with UI state "GSTIN required" (step 6.5 Item F default). No invalid PIs issued silently. Bulk CSV import path available in Phase 1.1 as additive rollback. |
| 5 | Ops-team underuse of the WhatsApp copy-log observability (Axis 4 EXPAND-2). If ops staff feel surveilled by copy-logging, they'll route around the button and the signal degrades. | Dashboard view is anonymized-by-default (copy-rate per school, not per user) per step 7 Fix 5 mitigation. Per-user attribution only via admin audit route; framing in the UI is "this helps us see which schools have email delivery issues," not "we're tracking your clicks." |
| 6 | D7's new HMAC surface (`/api/feedback/submit`) is a novel external entry point. Abuse vectors include: token guessing, token replay, bulk-POST against issued tokens, user-agent/IP enumeration. | 48-hour token expiry; single-use enforced via `usedAt` atomic update; recompute HMAC over `(mouId, installmentSeq, spocEmail, issuedAt)` with `GSL_SNAPSHOT_SIGNING_KEY`; rate-limit the endpoint (20 requests per IP per minute via Vercel edge config). Not a blocker; standard narrow-surface hygiene. |
| 7 | **Sync runner single point of failure (Anish's Windows laptop)**. The runner hosts the self-hosted GitHub Actions worker. If the laptop is offline, asleep, on the go, or has Windows Update restart, the hourly sync stops. The MOU import stops. The dashboard goes stale. Ops team hits "why isn't the new MOU showing up?" Anish is a dependency for sync availability. | Phase 1 mitigation: keep laptop plugged in + awake during business hours; disable automatic Windows Update reboots; monitor workflow run failures via GitHub notifications. Phase 1.1 real fix: migrate sync to a cloud runner (Fly.io, Railway, GitHub-hosted Windows runner) once the core pipeline is stable. Flag added to Phase 1.1 backlog; same risk applies to MOU and HR today, so not strictly an Ops regression, but Ops stakes are higher because it's the active operational system at 240-MOU target scale. Preferred Phase 1.1 path: GitHub-hosted Windows runner if the sync script can be refactored to read xlsx masters via SharePoint Graph API (removing the OneDrive-symlink dependency). Fly.io or Railway only needed if OneDrive filesystem access stays a hard requirement. Evaluate when Phase 1.1 is actually scheduled: the preference may flip if SharePoint Graph proves unreliable or expensive. |

Phase 1.1 backlog (above) already carries items 2, 4, 5-mitigation, 7-real-fix. Risks 1, 3, 6 are architectural and mitigated in the Phase 1 design itself.

---

## Summary for Anish

Architecture locked. Seven Q-series questions resolved. Five net-new entity schemas specified (Communication, Escalation, SchoolGroup, CcRule, Feedback) + one supporting internal entity (FeedbackHmacToken). Eight-test suite specified (5 mandatory + 3 Phase-1 additional). D7 refined per Tension 4: staff-JWT middleware + narrow HMAC-verified public feedback endpoint, no full candidate-cookie session in Phase 1.

**What carries verbatim from MOU**: `pendingUpdates.ts`, `githubQueue.ts` (modulo 4 strings), `format.ts`, `vercel.json`, the Contents API queue pattern, the sync-and-deploy workflow shape.

**What forks**: `types.ts` (add 5 net-new entities + MOU extensions), `templates.ts` (MOU's templates are MOU-agreements, not PIs; fork the pattern and build new PI / Dispatch Note / Delivery Ack templates), `middleware.ts` (HR origin with `/portal/*` stripped + `/api/feedback/submit` added).

**Phase 1 acceptance**: 11-step end-to-end flow from MOU import (with explicit `schoolScope` set on every record) through feedback submission works against real seeded data. Launch-day seeding includes pre-seeded `SchoolGroup` records, 10 `CcRule` records from SPOC DB, real `sales_team.json`, and every 2026-04 MOU imported with explicit scope.

**Deferred to Phase 1.1**: SPOC portal, feedback auto-escalation, incremental rollout (flag-ready), legacy-school import (flag-ready), bulk GSTIN CSV, P2 Approach C migration, cloud sync runner, Tally XML path.

**No D1-D8 reopened**. D7 refined (narrower surface per Tension 4, not full revocation). Two pending asks (Ameet on Item C, Shubhangi on Item F) remain launch-plan inputs; architecture is stable against both outcomes.

**Open items carried forward as non-blockers**: Q-D STEAM vs GSLT-Cretile distinction (one-line Slack), Axis 5 flip-to-incremental trigger (Ameet's Item C answer), Phase 1.1 backlog scheduling.

---
