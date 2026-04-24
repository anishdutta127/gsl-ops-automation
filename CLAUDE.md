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

## Karpathy principles

_Appended in a follow-up commit at step 4 of the kickoff sequence._
