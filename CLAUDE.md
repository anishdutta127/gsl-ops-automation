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
- Every write is audited: per-entity `auditLog[]` with `{timestamp, user, action, before, after, notes}`
- All writes go through the GitHub Contents API queue (pattern inherited from `gsl-mou-system`)
- Single-tenant. No multi-tenant tax. `config/company.json` holds the identity bundle.

## Inheritance from sibling projects

Reuse verbatim (do not reimplement):

- `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts`: queue writer pattern from `gsl-mou-system`
- `src/lib/templates.ts`: docxtemplater pattern for PI / Dispatch Note / Delivery Acknowledgement
- `next.config.mjs` with `experimental.outputFileTracingIncludes` properly nested (Next 14.2.x silent-strip gotcha)
- `vercel.json` with `ignoreCommand` on the `^chore\(queue\):` subject prefix only
- `.github/workflows/sync-and-deploy.yml`: hourly sync with mtime guard
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
