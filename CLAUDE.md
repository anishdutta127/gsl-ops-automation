# CLAUDE.md: GSL Ops Automation

**Project:** Post-MOU operations automation for GetSetLearn.
**Owner:** Anish Dutta · **CEO sponsor:** Ameet Zaveri.
**Status:** Scaffold. Architecture planning in progress (gstack ceremony: office-hours → CEO → eng → design → devex).

Full project context and CEO-approved scope live in `ops-data/GSL_Ops_Handoff.md`. The Executive Brief PDF Ameet saw is alongside it. Data-grounded findings from the pre-scaffold analysis are in `ops-data/ground-truth-data-report-2026-04-24.md`. Always start a new Claude Code session by reading those three in that order.

## Non-negotiable conventions

- Next.js 14 App Router · TypeScript strict · Tailwind v3 · Lucide
- British English always · Indian money format (Rs / lakh / crore) · never the em dash
- WCAG 2.1 AA · axe-core CI with shrinking baseline
- No in-app AI calls · prompt library lives at `docs/claude-prompts/*.md` (to be added)
- Single source of truth is the app. Excel is a read-only export after go-live.
- Ops does NOT sync state back to Excel. The legacy `Mastersheet-Implementation_-_AnishD.xlsx` in `ops-data/` is the format being migrated AWAY from, not a sync target. Phase 1.1 may add read-only Excel export if GSL wants the spreadsheet view restored; reverse-sync is net-new work, not a deferral.
- Pending writes auto-drain into the canonical JSON files via a GitHub Actions cron every 5 minutes. The workflow at `.github/workflows/sync-queue-cron.yml` POSTs to `/api/admin/sync-queue` (bearer-auth via `CRON_SECRET`), which calls `src/lib/sync/drainQueue.ts`. GitHub Actions cron rather than Vercel cron because the Vercel project is on Hobby tier (no minutely cadence); both holds work fine and the choice is reversible at any tier upgrade. The MOU `import-tick` and the sync-`health` check stay admin-triggered via `/admin` for ad-hoc use. Architecture decision archived at `plans/anish-ops-w4i3-recon-2026-04-30.md`; chosen interim Path C (auto-cron drain) over read-merger / direct-writes / DB. Production target is Azure migration post-Phase-1 (see `docs/W4-DEFERRED-ITEMS.md` D-041).
- `SyncFreshnessTile` component exists at `src/components/ops/SyncFreshnessTile.tsx` but is NOT mounted on the dashboard in Phase 1. The auto-sync runs every 5 minutes and the latest `sync_health` entry surfaces on `/admin`; a separate freshness tile on `/dashboard` is the next step if testers say they need it.
- Every write is audited: per-entity `auditLog[]` with `{timestamp, user, action, before, after, notes}`
- All writes go through the GitHub Contents API queue (pattern inherited from `gsl-mou-system`)
- Single-tenant. No multi-tenant tax. `config/company.json` holds the identity bundle.

## Department system

Gate 1 Step 2 introduced a workflow-stage department on every User. The field is independent of `role`: the trusted core team carries `role: 'Admin'` per the 2026-04-27 promotion (`docs/role-decisions.md`) but their `department` reflects the real-world function they exercise during the pilot.

| Department | Workflow stages | Role mapping at user-creation time |
|---|---|---|
| `'sales'` | Pipeline, Active MOUs, dispatch approval, school master edits | `SalesHead`, `SalesRep` |
| `'ops'` | Operations (schools, escalations, VEX, vendors, inventory), dispatch raise, training rollout | `OpsHead`, `OpsEmployee`, `TrainerHead` (seed default; Shashank is `null` in the pilot per role-decisions 2026-05-10) |
| `'finance'` | PI generation, payment matching, Tally export, adjustments, dispatch execution | `Finance` |
| `null` | All stages (cross-functional Admin or Leadership) | `Admin`, `Leadership` |

The seed mapping is enforced by `defaultDepartmentForRole(role)` in `src/lib/access.ts`; post-seed the field is editable per user. Production user records live in `src/data/users.json` and `src/data/_fixtures/users.json` with the field set explicitly. Pre-Gate-1 test fixtures may omit the field; `getDepartment(user)` falls back to the role default in that case.

Two-layer access model:

- **Layer 1, `src/lib/access.ts`**: department-level VIEW + EDIT gates. Surface-level checks for navigation visibility, page guards, primary-action affordances. The single source of truth for department-aware gating; ad-hoc role checks elsewhere are a smell, refactor through this file.
- **Layer 2, `src/lib/auth/permissions.ts`**: action-level `canPerform(user, action)` for fine-grained mutation gating. Stays as the server-side defence in depth even when Layer 1 opens up in testing mode.

EDIT gate semantics: `Admin` with `department: null` is the cross-functional wildcard (Anish, Ameet, Gowri at seed). `Admin` with an explicit department is department-scoped, which is what makes Misba's MM2 redirect work even though her role is Admin: `canGeneratePI(misba)` returns false because her department is `'ops'`, not `'finance'`. `canViewAllAuditLogs` and `canManageUsers` are meta-actions and check role only (Admin / Leadership wildcard regardless of department).

Read this principle as: **Admin role + `department: 'ops'` means trusted Ops user with PI gates still enforced.** The Admin role lifts the testers above the cc-rule + audit-route + dispatch-request scoping that role-decisions.md 2026-04-27 collapsed for the trusted core team; the department field re-establishes write-side scoping per the Misba MM2 acceptance criterion. **Admin role + `department: null` means cross-functional wildcard** (Anish, Ameet, Gowri at seed). **Escape hatch:** flip a user's department to null via `/admin/users` for testing scenarios that need a department-restricted user to act outside their lane (e.g., asking Misba to walk through the PI generation flow once during pilot review). The flip is logged as a `user-role-changed` audit entry; revert post-test.

### VEX dispatch lifecycle role split (Gate 2 Step 7)

The VEX dispatch lifecycle `Requested → Request Raised to Warehouse → Invoiced → Shipped` is gated by TWO department roles at the transition route, not one:

- `canRaiseDispatch` (Ops + Admin wildcard) drives **Request Raised to Warehouse** and **Shipped**. Ops owns the warehouse handover and the final shipped status.
- `canEditFinanceData` (Finance + Admin wildcard) drives **Invoiced**. Marking a dispatch Invoiced attests that the tax invoice exists, which is a Finance act; the tax invoice number + path are Finance-uploaded.
- Either role can read the dispatch detail; the gate is on the specific transition action.

Both roles share Admin's null-department wildcard. The Step 7 brief's "canRaiseDispatch covers everything" wording was imprecise. The split was chosen during build because tax invoicing is semantically a Finance act; locking it behind a Finance gate prevents Ops accidentally attesting an invoice that hasn't been raised. Status transitions are forward-only at the API; rewinds require Admin JSON edit (BACKLOG: dispatch rewind capability).

## Testing-vs-production access defaults

`TESTING_OPEN_ACCESS` env var controls strictness for BOTH VIEW and EDIT gates. Defaults to **fail-open for testers** (a missing or empty env var reads as `true`).

| Env value | VIEW gates | EDIT gates |
|---|---|---|
| unset, `''`, `'true'`, `'TRUE'` (default) | every active user can see every stage | every active user can act on every stage |
| `'false'` (production lockdown) | strict per department; Admin / Leadership are the only cross-cutting roles | strict per department; Misba MM2 + sibling separation-of-duties invariants apply |

Rationale: pilot testers reported friction when role gates hid functions they needed to internalise the system (W3-B, restated 2026-05-19 after Pranav MOU-button hotfix). Testing window opens everything so a department-scoped Admin (Pranav = Finance, Misba = Ops, etc.) can walk every flow end-to-end. Production lockdown re-enables strict EDIT semantics: an Ops user cannot generate a PI; a Finance user cannot draft an MOU; cross-functional Admin (`role: 'Admin'`, `department: null`) is the only wildcard. Production lockdown is a one-line env flip.

Layer 2 (`canPerform` in `src/lib/auth/permissions.ts`) stays as server-side defence in depth regardless of the toggle. All current test users carry `role: 'Admin'`, which trips ADMIN_WILDCARD at Layer 2 and unblocks every write the Layer-1 open gates make discoverable.

The default lives in code (not env), so a missing env var fails open for testers, not closed.

## Inheritance from sibling projects

Reuse verbatim (do not reimplement):

- `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts`: queue writer pattern from `gsl-mou-system`
- `src/lib/templates.ts`: docxtemplater pattern for PI / Dispatch Note / Delivery Acknowledgement
- `next.config.mjs` with `experimental.outputFileTracingIncludes` properly nested (Next 14.2.x silent-strip gotcha)
- `vercel.json` with `ignoreCommand` on the `^chore\(queue\):` subject prefix. Auto-sync is driven by `.github/workflows/sync-queue-cron.yml` rather than Vercel cron because of the Hobby-tier minutely-cadence restriction.
- Auth middleware from `gsl-hr-system` (per-user RBAC, bcrypt + JWT httpOnly, 7-day expiry)

Do not inherit the HR candidate portal pattern. Phase 1 Ops is an internal tool; no external users.

## End-of-session protocol (standing rule, established 2026-05-29)

After any change set, once `npm run build` passes, ALWAYS run `git add -A && git commit && git push` automatically. Do not ask for confirmation to push to main. Pushing and triggering the Vercel production deploy is the desired default behaviour every time. Only pause if the build fails (fix the build, then push).

Standing permission: `npm`, `git`, `vercel`, and `gh` may be invoked without per-command confirmation.

Rationale: Vercel deploys are the only way changes reach the testers. Pausing to ask before each push gates the feedback loop on operator availability and turns the harness into a sequential queue. The build gate is the safety net; the push is the desired side-effect of any successful build.

## Planning discipline

gstack skills, in order, pause between each: `/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review` → `/plan-devex-review`. No auto-advance. Every decision that changes the plan lands in a plan doc in `plans/`, not in chat.

## Karpathy coding principles

Source: [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md) at commit `8462496b34419f20b32778610571ac723e91f94c` (upstream committed 2026-01-27).

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## V4 verification standard (2026-05-19)

Past gates passed verification by checking "route returns 200" or "import exists" without walking the actual flow. That pattern shipped the installment CTA gap, the `/mous/new` 404, and the `/mous/new` client-side crash to production.

**V4 verification means the gate has not passed until the canonical user flow has been walked with realistic data.** Concretely, for any route or feature this gate's changes touch:

1. Reproduce the flow locally with `npm run dev` (or `npm run start` after `npm run build` for production-mode parity).
2. Use Playwright if available, otherwise manually walk the component tree with realistic mocked data through every render and submit.
3. Confirm the page actually **renders** without a client- or server-side exception, **and** the action actually **completes** end-to-end.
4. Capture the result in a verification log under `docs/gate-<name>/E2E_VERIFICATION_LOG.md`: which user, which flow, what happened.

"Auth-gated, couldn't verify visually" is **no longer acceptable** for routes covered by the gate's changes. Use `TESTING_OPEN_ACCESS=true`, a seeded test user, or the test-bypass hook to walk the flow in the same env where the bug would appear. Vitest render tests (`renderToStaticMarkup` of the page component) catch SSR-side crashes; they do not substitute for E2E walking but they are the floor.

When a flow cannot be E2E-walked in a given environment (real third-party dependency unavailable, etc.), state that explicitly in the verification log and name what the residual risk is. Do not silently fall back to "the route returns 200".

### Playwright screenshot verification (Phase 6D)

For gates with UI-visible changes, run `scripts/verify-deploy.mjs` as the final verification step. The script logs into the live deploy with the supplied credentials, walks a list of URLs in headless Chromium, and writes screenshots to `.verification/<timestamp>/<name>.png`. Paste the screenshot paths in the final report so the reviewer can audit what each URL actually rendered.

```
VERIFY_PASSWORD='<password>' node scripts/verify-deploy.mjs
# or with custom targets:
node scripts/verify-deploy.mjs --user anish.d@getsetlearn.info --password '<pw>' --urls custom-targets.json
# mobile viewport (375 wide):
node scripts/verify-deploy.mjs --viewport mobile --password '<pw>'
```

A summary.json drops alongside the screenshots with the HTTP status of each capture. Exit code is 1 if any URL failed; the failed URLs still capture their screenshots so the post-mortem has evidence.

---

## Routing tree (post-ceremony, 2026-04)

For any question CC encounters in this repo, this table picks the first document to consult. Read this once; it becomes background.

| Question type | First document | Notes |
|---|---|---|
| "What does the system do?" | `ops-data/GSL_Ops_Handoff.md` | Plus the executive brief if the question is strategic. |
| "What's in Phase 1 scope?" | `plans/anish-ops-ceo-review-2026-04-24.md` | 5 axes; out-of-scope items are explicit. |
| "What entity / endpoint / test?" | `plans/anish-ops-eng-review-2026-04-24.md` | 6 entity types, 9-test suite, D7 refinement. |
| "What does it look like / what copy?" | `DESIGN.md` (canonical), then `plans/anish-ops-design-review-2026-04-24.md` (rationale) | DESIGN.md wins on conflict (living source vs review snapshot). |
| "How do I run / launch / recover?" | `docs/RUNBOOK.md` | Living document; post-incident updates here. |
| "How do I contribute / first PR?" | `docs/DEVELOPER.md` | 6-command first-run flow. |
| "What's deferred?" | `plans/anish-ops-eng-review-2026-04-24.md` §"Phase 1.1 backlog" | Plus risk registry above. |
| "Who can do X without Anish?" | `plans/anish-ops-devex-review-2026-04-24.md` §"Item 8" | Self-maintainability matrix. |
| "What's the trigger for Item A through J?" | `plans/assumptions-and-triggers-2026-04-24.md` | 10 items A-J with thresholds. |
| "Why does X have a weird shape?" | grep `plans/` for the relevant Q-x or Tension-x | Decision archive; never silently re-litigated. |
| "What was decided at office hours?" | `plans/anish-ops-office-hours-2026-04-24.md` | P1-P6 + Q-J resolution. |

For any UI-touching task: always read DESIGN.md before the editor opens.
For any task: always read CLAUDE.md (this file) at session start.

### Single-`<main>` rule

The root layout (`src/app/layout.tsx`) owns the only `<main id="main-content">` element. Sub-layouts and sub-pages must NOT add their own `<main>`. The single `<main>` keeps the skip-link target valid across all routes; a duplicate `<main>` in a sub-page would either shadow the root target or yield invalid HTML. Page-level wrappers should use `<div>` or `<section>`. See DESIGN.md "Surface 6 / Skip-to-content link."

## Read-order for fresh sessions

For every fresh CC session opening this repo:

1. Read CLAUDE.md (you're already doing this).
2. Read DESIGN.md (always; visual + copy rules).
3. If the task touches a Phase 1 decision: read the relevant plans/ artefact.
4. If the task is implementation: read the file you're touching plus its sibling tests.
5. If the task is a launch / monitoring / failure question: read docs/RUNBOOK.md.

The goal is enough context to make judgement calls without needing to ask, while not re-reading the entire repo every session.

## Plans are an archive, not a guide

Documents under `plans/` are the decision archive. They explain *why* a Phase 1 decision is the way it is. They are NOT implementation guides; once Phase 1 has landed, the code is the implementation guide and `plans/` answers historical questions only.

Do not reference `plans/` line numbers in implementation code or docstrings; use code self-evidence and DESIGN.md cross-references instead. If you need to cite a plan in a code comment for context, name the section by title, not line number, so the reference survives plan edits.

<!-- cc-brain-project:begin -->
## Working memory (Obsidian vault), read first, persists across sessions
@C:/Users/anish/obsidian/cc-brain/Projects/gsl-ops-automation/_index.md

Memory protocol: read state.md before starting; append to decisions.md / learnings.md inline as you go; update state.md + write a session log at the end of every work batch.
<!-- cc-brain-project:end -->
