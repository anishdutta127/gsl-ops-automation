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
- Pending writes auto-drain into the canonical JSON files via Vercel cron every 5 minutes. The cron hits `/api/admin/sync-queue` (bearer-auth via `CRON_SECRET`), which calls `src/lib/sync/drainQueue.ts`. The MOU `import-tick` and the sync-`health` check stay admin-triggered via `/admin` for ad-hoc use. Architecture decision archived at `plans/anish-ops-w4i3-recon-2026-04-30.md`; chosen interim Path C (auto-cron drain) over read-merger / direct-writes / DB. Production target is Azure migration post-Phase-1 (see `docs/W4-DEFERRED-ITEMS.md` D-041).
- `SyncFreshnessTile` component exists at `src/components/ops/SyncFreshnessTile.tsx` but is NOT mounted on the dashboard in Phase 1. The auto-sync runs every 5 minutes and the latest `sync_health` entry surfaces on `/admin`; a separate freshness tile on `/dashboard` is the next step if testers say they need it.
- Every write is audited: per-entity `auditLog[]` with `{timestamp, user, action, before, after, notes}`
- All writes go through the GitHub Contents API queue (pattern inherited from `gsl-mou-system`)
- Single-tenant. No multi-tenant tax. `config/company.json` holds the identity bundle.

## Inheritance from sibling projects

Reuse verbatim (do not reimplement):

- `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts`: queue writer pattern from `gsl-mou-system`
- `src/lib/templates.ts`: docxtemplater pattern for PI / Dispatch Note / Delivery Acknowledgement
- `next.config.mjs` with `experimental.outputFileTracingIncludes` properly nested (Next 14.2.x silent-strip gotcha)
- `vercel.json` with `ignoreCommand` on the `^chore\(queue\):` subject prefix and `crons` driving auto-sync (W4-I.3.B). The sibling repo's GitHub Actions sync runner is NOT inherited; Vercel cron replaces it for the Ops project.
- Auth middleware from `gsl-hr-system` (per-user RBAC, bcrypt + JWT httpOnly, 7-day expiry)

Do not inherit the HR candidate portal pattern. Phase 1 Ops is an internal tool; no external users.

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
