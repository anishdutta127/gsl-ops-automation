# GSL Ops Automation System — Handoff Doc

**Project:** gsl-ops-automation (name TBC)
**Status:** Pre-scaffold. CEO brief approved scope, no code yet.
**Owner:** Anish Dutta
**CEO sponsor:** Ameet Zaveri — this is his top priority system
**Last updated:** 24 April 2026
**Paste this entire doc into the first Claude Code session as context.**

---

## Why this system exists

GSL signs MOUs with schools through the Sales team. After the MOU is signed, a long chain of events must happen without breaking:

1. Actual student count, kit count, and delivery details confirmed (often differ from the MOU)
2. Proforma invoice raised per installment plan (1 / 2 / 3 / 4 installments)
3. Payment received, matched to the correct school and sales person (bank narrations rarely name the school)
4. Kits dispatched from vendor warehouse only after Installment 1 paid
5. Training delivered (GSL trainer OR Train-The-Trainer mode)
6. Feedback captured, discrepancies resolved, subsequent installments tracked

Today all of this runs on WhatsApp, manual Excel updates, and individual memory. No cross-verification. Works at 24 MOUs, breaks at 240. Ameet wants the leak fixed before scale.

**Success metrics (ranked per Ameet, 24-Apr-2026 meeting):**
1. Accuracy of info flow
2. Smoothness of implementation
3. School delight

Nothing time-boxed. This is a scope commitment, not a calendar commitment.

---

## What's decided and locked

**Architecture pattern inherited from gsl-mou-system verbatim:**
- Next.js 14 App Router, TypeScript strict, Tailwind v3, Lucide
- JSON data under `src/data/`
- All writes via GitHub Contents API queue (reuse `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts` from MOU)
- Per-entity `auditLog[]` with `{timestamp, user, action, before, after, notes}`
- Self-hosted sync bot on Anish laptop, hourly cron, mtime guard
- `vercel.json ignoreCommand` on `^chore\(queue\):` subject prefix only
- `outputFileTracingIncludes` under `experimental:` in `next.config.mjs` (Next 14.2.x silent-strip gotcha)
- WCAG 2.1 AA, axe-core CI with shrinking baseline
- British English always, Indian money format (Rs / lakh / crore), never emdash
- Single-tenant clean, `config/company.json` for identity bundle, no multi-tenant tax

**Auth:**
- Per-user accounts, bcrypt + JWT httpOnly, 7-day expiry, refresh on activity
- Roles: Admin, Sales, Ops, Finance, Leadership
- Shared starter password `GSL#123` during testing, force-change disabled for testing
- Real @getsetlearn.info emails

**Data philosophy:**
- Single source of truth: the app, not Excel
- One-time import from existing master Excels at go-live
- Excel becomes read-only export thereafter (no two-systems-of-truth)
- Every write is audited with user identity

**No in-app AI** (same rule as HR system):
- Prompt library at `docs/claude-prompts/*.md` + in-app drawer
- Zero API calls from the app itself
- Team uses their own Claude accounts if needed

---

## The eight-stage lifecycle (CEO-approved)

Every MOU flows through these stages. Each stage has a clear actor, a clear cross-checker, and a data gate that blocks progression until cross-verification passes.

| # | Stage | System action | Primary actor | Cross-checker |
|---|-------|---------------|---------------|---------------|
| 1 | MOU Signed | Imported from MOU system. Ops Owner auto-allocated. | Sales | Ops |
| 2 | Actuals Confirmation | Three-ping cadence: 1 month → 2 weeks → 1 week before next milestone. Student count, kit count, delivery address, SPOC details re-validated. | Sales (initiates with SPOC) | Ops confirms, Finance blocks invoice until done |
| 3 | Dynamic Recalculation | Any commitment change triggers full recalc. Paid amounts carry forward. Contract total, outstanding balance, next installment auto-updated. Audit log captures before/after and authoriser. | System computes | Sales Head signs off on any delta >10% |
| 4 | Proforma Invoice | Raised only after actuals confirmed. Generated from latest numbers. Emailed to SPOC, logged on school record. | Finance raises | Sales forwards to SPOC |
| 5 | Payment Reconciliation | Shortlist helper narrows bank entries to probable PI match (amount, school-name tokens, sales-owner tag, outstanding installments). **Never auto-matched** — human confirms. | Finance matches | Sales confirms if ambiguous |
| 6 | Kit Dispatch | **Hard gate:** unlocked only after Installment 1 paid. Vendor PO raised per school. Status flow: PO Raised → Dispatched → In Transit → Delivered → Acknowledged. School acknowledgment mandatory. | Ops raises PO | Sales confirms school receipt, Finance unlocks next installment |
| 7 | Training Rollout | Trainer allocation captured per MOU. Delivery status per grade tracked. **Phase 1 = allocation only.** Full scheduling is Phase 2. | Ops allocates | Academics delivers, Sales verifies |
| 8 | Feedback & Escalation | Short-form feedback collected after every installment cycle. Escalation button available at every stage — fan-out to Ops Owner + Sales Owner + Ameet in parallel. | School submits | Ops triages, Ameet sees aggregate |

**Terminal states:** Completed (MOU fulfilled), On Hold (paused with reason), Cancelled (before completion, with reason).

---

## Cross-verification matrix (the heart of the system)

Every critical event requires confirmation from at least two independent functions before the system marks it complete. This is the single biggest behavioural change from today's process.

| Event | Sales | Ops | Finance | School |
|-------|-------|-----|---------|--------|
| Actuals confirmed | Primary | Review | Block-lift | Source |
| Invoice accepted | Forward | — | Primary | Confirm |
| Payment matched | Tie-break | — | Primary | — |
| Dispatch triggered | Notified | Primary | Unlock gate | — |
| Delivery confirmed | Verify | Record | — | Acknowledge |
| Training delivered | Verify | Record | — | Acknowledge |

---

## Data entities (Phase 1)

Design in `/plan-eng-review`. Flat-file-per-entity pattern (Option A — MOU-style), not graph-aggregate. The choice is locked because the primary workload is cross-cutting (role pipelines, dashboards, reconciliation feeds), not one-entity-at-a-time deep-dives.

Core entities:

- **School** — master record, SPOC contacts, region, sales owner
- **MOU** — imported from MOU system, references the School, snapshot of committed numbers
- **Actuals** — confirmed numbers over time, versioned (installment-1-actuals, installment-2-actuals, etc.)
- **Installment** — expected amount, due date, status (Pending / Invoiced / Partially Paid / Paid)
- **Invoice** — PI document, generated from Actuals snapshot, linked to Installment
- **Payment** — bank entry, matched to an Invoice, with the matching-evidence trail
- **Dispatch** — vendor PO, courier, AWB, delivery status per school
- **Training** — trainer name (Phase 1 scope ends here), delivery status per grade
- **Feedback** — per-installment feedback record
- **Escalation** — stage, severity, notifications sent, resolution
- **User** — staff with role and per-MOU ownership

Every entity carries its own `auditLog[]`.

---

## The three-ping cadence (the automation backbone)

Before every installment milestone, the system auto-schedules three reminders:

- **T-30 days:** Soft ping to Sales Owner. "Confirm actuals with [School Name] SPOC — installment 2 due on [date]."
- **T-14 days:** Firmer ping, CC to Ops Owner. "Actuals still pending for installment 2."
- **T-7 days:** Escalation-grade. Auto-fan-out to Sales Owner + Ops Owner + Sales Head.

If SPOC doesn't respond by T-7, the system automatically escalates to Ameet (per your "no MOU silently rots" principle).

Reminders go via email Phase 1. WhatsApp / Teams integration is explicitly Phase 2.

---

## Pitfalls the system is designed against

These were called out in the CEO brief and Ameet signed off. Keep them in mind during `/plan-eng-review` — they become test cases.

1. **MOU-to-actuals drift** — three-ping cadence + Finance blocks PI until Sales + Ops both confirm. No actuals, no invoice.
2. **Payment-to-PI reconciliation errors** — shortlist helper, human confirm. Unmatched entries queue for later, never auto-matched.
3. **Dispatch before payment** — hard gate. Ops cannot raise vendor PO until Finance flips the switch.
4. **Commitment changes that rewrite history** — recalc always carries paid-to-date forward. A student-count drop after Inst. 2 paid does not refund; it reduces remaining balance. Full before/after audit.
5. **Role confusion** — every MOU has a named Sales Owner, Ops Owner, Finance Owner. Cross-verification matrix enforced in the data layer.
6. **School silence / ghost MOUs** — three missed pings triggers auto-escalation to Sales Head + Ameet.
7. **Discrepancy dispute between Sales and Ops** — escalation button triggers parallel notifications to Ops Owner + Sales Owner + Ameet. Log lives on school record.
8. **Two systems of truth** — one-time Excel import at go-live. Excel becomes read-only export. The app owns data thereafter.

---

## What's explicitly out of Phase 1

Flag any scope creep into these:
- Trainer scheduling calendar (Phase 2)
- Vendor warehouse inventory forecasting (Phase 2 — assume supply exists)
- WhatsApp / Teams notification integration (Phase 2 — email only Phase 1)
- Multi-tenant rollout to Arvind Mafatlal Group (Phase 3)
- Auto-payment-matching (never — always human-confirmed)
- Integration with any accounting system beyond the PI generation + Tally XML pattern inherited from MOU

---

## Open questions parked for engineering review

To be resolved in `/plan-eng-review` once Ameet has signed off on this brief.

1. **Payment-to-Dispatch gate — is it absolute?** If school has ordered 1000 kits and paid for 400, do we dispatch only 400 worth, or hold until Installment 1 full payment? Meeting notes ambiguous.
2. **Escalation fan-out level.** Every flag goes to Ops Owner + Sales Owner + Ameet. Should Ameet be copied only on severity-2+ to avoid inbox overload?
3. **"Actuals differ from MOU by >10%" policy.** Auto-approve with audit entry, or Sales Head sign-off required?
4. **Bulk operations.** Can finance mark 20 PIs paid in one action, or does each need individual confirmation? Affects UI and audit shape.
5. **SPOC direct access.** Phase 1 = internal tool, SPOC gets emails only. Phase 2 (maybe) = SPOC portal where school can see status. Explicit decision needed.
6. **Feedback form location.** Embedded in the app (school-facing link, same magic-link pattern as HR candidate portal) or external Google Form (MOU-signing pattern)?

---

## Data provided by the team (already in hand)

Placed under `ops-data/` at project root once scaffolded:

- **Mastersheet-Implementation_-_AnishD.xlsx** — current delivery trackers for TinkRworks and Cretile, current inventory, "to be filled post discussion with sales" register. 14 schools per tracker, per-grade-per-product kit counts, delivery status.
- **MOU Signing Details 2026-2027 (Responses).xlsx** — 24 MOUs captured via Google Form (2026-02 onwards). Product mix: 18 GSLT-Cretile, 5 TinkRworks, 1 VEX. Training mode mix: 14 TTT, 10 GSL Trainer.
- **Whiteboard photo from Ameet (2026-04-24)** — conceptual flow with 5 lanes (Sales, Validation, Execution, Finance, System) and cross-check events. Reference only, system design departs from it where it makes sense.

**Still to be collected from the team** (email to go out after CEO approval):
- SPOC contact database per school (name, email, phone, role)
- Standard PI template with GSTIN, HSN code per product
- Standard Delivery Acknowledgement form
- Sales-person-to-school mapping for current quarter
- Nominated Ops Owner per region
- Feedback form content approved by Academics + Ameet
- Escalation matrix (who escalates to whom at each severity)

---

## Architectural inheritance from MOU and HR

Reuse verbatim (don't reimplement):

- `src/lib/pendingUpdates.ts` — GitHub Contents API queue writer
- `src/lib/githubQueue.ts` — queue management
- `.github/workflows/sync-and-deploy.yml` — hourly sync with mtime guard
- `vercel.json` with `ignoreCommand` on `^chore\(queue\):` subject prefix
- `next.config.mjs` with `experimental.outputFileTracingIncludes` properly nested
- `src/lib/templates.ts` — docxtemplater pattern for PI / Dispatch Note / Delivery Ack
- `src/lib/format.ts` — Indian money formatting, DD-MMM-YYYY dates, British-English copy lint
- Basic component primitives (status pills, row-hover, empty states) from MOU, re-skinned for ops domain

Replace / rewrite:
- Auth middleware — HR already rewrote it for per-user RBAC, inherit from HR not MOU
- Domain components — school/MOU/dispatch/training cards are new

**Do NOT inherit the HR candidate portal pattern.** Ops is an internal tool, no external users in Phase 1.

---

## Tooling decisions (locked)

- **gstack** — primary planning framework. Use the same cycle as MOU and HR: `/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review` → `/plan-devex-review`.
- **Karpathy CLAUDE.md principles** — append to the project's CLAUDE.md at scaffold. The 4 principles (don't assume, don't hide confusion, surface tradeoffs, minimum code) apply across all future Claude Code sessions.
- **Graphify** — deferred until all 4 GSL projects (MOU, HR, Academics, Ops) are live. Then install once across all four repos for cross-project pattern discovery.
- **GSD (get-shit-done)** — deferred. It overlaps with gstack. Revisit at Sales Automation project if gstack feels heavy there.
- **llm-council** — not adopted. Wrong tool for this workflow.

---

## Vercel + GitHub setup needed before kickoff

Anish will handle these before Claude Code scaffolds. Flag if any are missing when the session starts.

1. GitHub repo: `gsl-ops-automation` (private), under `anishdutta127`
2. Local folder: `C:\Users\anish\Projects\gsl-ops-automation`
3. OneDrive master folder: create `GSL Ops Automation` in `C:\Users\anish\OneDrive - MAF TECHNOLOGIES PRIVATE LIMITED\` and symlink to `onedrive-data/` in repo
4. Vercel project: `gsl-ops-automation`
5. New fine-grained PAT: `GSL_QUEUE_GITHUB_TOKEN`, repo-scoped, Contents Read+Write, 90-day expiry, added to Vercel env vars
6. Fresh signing key: `GSL_SNAPSHOT_SIGNING_KEY` via `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })` in PowerShell
7. Fresh JWT secret: `GSL_JWT_SECRET` same way
8. Calendar reminder at 85 days from PAT creation for rotation

---

## Team and users

Working users (seeded at scaffold, real @getsetlearn.info emails, starter password `GSL#123`, force-change disabled for testing):

- **Admin:** Anish Dutta — `anish.d@getsetlearn.info`
- **Sales head:** TBC — seed placeholder, update when Ameet names the person
- **Ops head (likely):** Pradeep Ragav — `pradeep.r@getsetlearn.info` (listed in employee muster as Chief Manager - Operations, Bangalore)
- **Accounts lead:** Shubhangi Gajakosh — `ujaccounts@getsetlearn.info` (Chief Manager - Finance & Accounts)
- **Leadership:** Ameet — `ameet.z@getsetlearn.info`

Other operational users (sales reps per region, accountants, ops executives) will be seeded after role clarity from the initial team conversations. Don't over-seed before that.

---

## Kickoff sequence for Claude Code

**Paste this whole document as the first message of a fresh Claude Code session at `C:\Users\anish\Projects\gsl-ops-automation` (once created). Then:**

1. **Scaffold:** Next.js 14 App Router + TS + Tailwind v3 + Lucide. First commit. Push to `gsl-ops-automation` GitHub repo.

2. **Reference reads (critical context from sibling projects):**
   - `C:\Users\anish\Projects\gsl-mou-system\CLAUDE.md`
   - `C:\Users\anish\Projects\gsl-mou-system\src\lib\pendingUpdates.ts`
   - `C:\Users\anish\Projects\gsl-mou-system\src\lib\githubQueue.ts`
   - `C:\Users\anish\Projects\gsl-mou-system\src\lib\templates.ts`
   - `C:\Users\anish\Projects\gsl-mou-system\next.config.mjs` (pay attention to `experimental.outputFileTracingIncludes` placement)
   - `C:\Users\anish\Projects\gsl-mou-system\vercel.json`
   - `C:\Users\anish\Projects\gsl-hr-system\CLAUDE.md` (for the per-user auth rewrite)
   - `C:\Users\anish\Projects\gsl-hr-system\middleware.ts` (for JWT auth pattern)

3. **Install gstack** if the CLI is stale locally, run `/gstack-upgrade` first.

4. **Append Karpathy principles** to CLAUDE.md:
   ```powershell
   cd C:\Users\anish\Projects\gsl-ops-automation
   curl -o karpathy.md https://raw.githubusercontent.com/forrestchang/andrej-karpathy-skills/main/CLAUDE.md
   "`n`n# Karpathy Coding Principles`n" | Out-File -Append CLAUDE.md
   Get-Content karpathy.md | Out-File -Append CLAUDE.md
   Remove-Item karpathy.md
   git add CLAUDE.md
   git commit -m "chore: append Karpathy coding principles to CLAUDE.md"
   git push
   ```

5. **Run `/office-hours`.** The premises to challenge in office-hours:
   - P1: Flat-file data model per entity (is cross-cutting the dominant workload? Confirm.)
   - P2: Hard Payment→Dispatch gate (is this absolute, or partial-proportional?)
   - P3: Email-only notifications Phase 1 (confirm WhatsApp/Teams is genuinely Phase 2)
   - P4: SPOC has no direct access in Phase 1 (confirm or flag if Ameet wants school portal earlier)
   - P5: No auto-match on payment reconciliation (confirm — never silent)

6. **Run `/plan-ceo-review`.** Mode: SELECTIVE EXPANSION. The three axes to pressure-test:
   - Dashboard depth for Ameet (basic health view vs full analytics)
   - SPOC portal — Phase 1 or Phase 2
   - Feedback loop — embedded vs external form

7. **Run `/plan-eng-review`** — resolve the 6 open questions listed above.

8. **Run `/plan-design-review`** — single pass (internal surfaces only, no candidate portal to design). DESIGN.md can reuse HR's since both are internal staff tools.

9. **Run `/plan-devex-review`** — especially around who can upload new schools, new SPOCs, new products (self-maintainability principle from HR system carries over — HR + Sales should be able to maintain data without Anish in the loop).

10. **Then kick off Week 1 implementation** per the plan docs.

---

## Non-negotiable principles to carry forward

- **Challenge premises, don't assume.** If the plan assumes something that could be wrong, stop and ask. (Karpathy principle, explicitly in CLAUDE.md.)
- **Surface tradeoffs, don't pick silently.** Every meaningful decision gets logged in the plan doc.
- **Minimum code.** No speculative flexibility, no "maybe we'll need X later" abstractions. If requirement appears, build then.
- **Push back when warranted.** If Claude Code wants to build something I haven't asked for, resist.
- **Audit everything.** Every write to data has a user identity, timestamp, before/after.
- **One source of truth.** Never two systems holding the same data.
- **Quality over speed.** Ameet is depending on this being correct, not fast.

---

## What Ameet sees when this works

When he opens the Ops dashboard in a quiet moment:
- Every active MOU visible, with its current stage and the next scheduled action
- Exception feed highlighting MOUs where something is stuck — late actuals, overdue invoice, stuck dispatch, missing feedback
- Escalation inbox of school-side issues that have been flagged
- No emails to chase, no "can you check with X" messages to fire off

When a new MOU comes in from sales:
- System picks it up automatically from the MOU repo
- Auto-allocates an Ops Owner per the rules
- Schedules the first actuals-confirmation ping for 30 days before the first installment
- Everyone who needs to know is notified once, in their channel

When a payment lands in the bank:
- Finance sees the shortlist helper narrow it to 2-3 possible matches
- Picks the right one, confirms
- System flips the "Installment 1 paid" gate on that school
- Ops gets notified that dispatch can now be raised
- Audit log captures the full trail

That's the system. Now build it.

---

**End of handoff. Paste this into Claude Code as context. Then execute the kickoff sequence.**
