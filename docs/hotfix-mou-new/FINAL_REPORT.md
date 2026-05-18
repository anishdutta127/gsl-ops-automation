# Hotfix: /mous/new 404 + route audit

**Branch:** main
**Trigger:** Pranav clicked the "+ New MOU" CTA on `/mous` and saw the Next.js 404 page.
**Status:** Deployed.

## Root cause

The route exists. The page file is `src/app/mous/new/page.tsx`. The bug was a gate mismatch, not a missing route:

1. The page guard calls `notFound()` if `canEditMOU(user)` returns false (line 29-31).
2. `canEditMOU` (src/lib/access.ts:166-168) allows only Sales department + Admin with `department: null`.
3. Pranav's user record (`src/data/users.json:135-141`) is `role: 'Admin'`, `department: 'finance'`. This is intentional per `docs/role-decisions.md`: the trusted core team has Admin role with an explicit department to preserve write-side scoping (the Misba MM2 pattern applied to Finance).
4. The "+ New MOU" CTAs were rendered without the same gate, so the button appeared for Pranav, then 404'd on click.

The MOU_SYSTEM_PARITY_AUDIT.md report missed this because it verified code references, not the runtime gate behaviour from a non-Sales user's perspective.

Full diagnosis: `docs/hotfix-mou-new/ROUT_CAUSE.md`.

## Fixes shipped

### 1. CTA gating (commit fcce31a)

Wrapped the three leaking CTAs in `canEditMOU(user)`:

- `src/app/mous/page.tsx:250-257` (MOUs list "+ New MOU")
- `src/app/schools/[schoolId]/page.tsx:386-392` (school detail "+ Draft new MOU")
- `src/components/dashboard/ConsolidatedLanding.tsx:474-480` (consolidated landing Quick action)

The page-level `notFound()` guard is preserved as defence in depth. Pranav now sees neither the button nor a 404; the page is honest about who it serves.

### 2. Route audit script + regression test

- `scripts/audit-routes.mjs` enumerates every internal link in `src/` (href, router.push, redirect) and every Next.js route under `src/app/` (page + API), then matches one against the other. Exits 1 on broken links.
- `src/lib/audit-routes.test.ts` invokes the script via vitest so `npm test` catches the same class.
- `package.json` wires `npm run audit:routes` standalone and folds it into `npm run verify` between docs-lint and tests.

Current matrix (`docs/hotfix-mou-new/ROUTE_AUDIT.md`):

| Bucket | Count |
|---|---|
| Routes declared | 232 |
| Distinct linked paths in source | 102 |
| ✅ OK (static match) | 59 |
| ⚠ Dynamic (needs runtime check) | 43 |
| ❌ Broken | 0 |
| ⚠ Page orphans | 29 |
| ⚠ API orphans | 95 |

The audit cannot detect runtime gate mismatches (Pranav's class); that is mitigated by gating CTAs alongside their page guards. A future enhancement could grep for `notFound()` in page files and cross-reference CTAs, but that is more invasive than this hotfix scope allows.

## Broken links fixed during the audit

None. The audit found 0 ❌ broken links after API-route enumeration and template-substitution normalisation were correct. The /mous/new 404 was the only user-visible route failure in the pilot snapshot; it was a gate mismatch, not a missing-route bug, and the static audit confirms no other internal link points at a non-existent route file.

## Orphans documented (Phase C work)

29 page orphans listed in `ROUTE_AUDIT.md` §"Page orphans". A few that look user-meaningful (worth confirming during Phase C triage rather than ignoring outright):

- `/mous/[mouId]/edit`, `/mous/[mouId]/payment-receipt`, `/mous/[mouId]/upload-signed`: MOU detail-adjacent pages with no apparent CTA.
- `/admin/dispatch-requests`, `/admin/mou-import-review`, `/admin/spocs`, `/admin/chain-mou-reconciliation`, `/admin/data-snapshot`, `/admin/pi-counter`: admin surfaces, likely reachable only via direct URL.
- `/dashboard/admin`, `/dashboard/leadership/accountability`, `/dashboard/sales`, `/dashboard/ops/kanban`: alternative dashboard variants; may or may not be wired.
- `/finance`, `/finance/pi/pending`, `/finance/receipts`, `/finance/schools-receipts`, `/finance/payments/[paymentId]`, `/finance/pi/[paymentId]`: Finance surfaces; orphan status here is worth investigating.
- `/help`, `/logout`: false-positive orphans; both are referenced via constant variables (`HELP_HREF`) or form action attributes which the static audit does not yet capture. Not bugs.

95 API orphans listed; expected because API routes are typically called via `fetch()` rather than navigated to. Treat as low signal unless a specific endpoint stands out.

## CI / regression mechanism

- `npm run audit:routes`: standalone script invocation.
- `npm run verify`: wraps tsc + lint + docs-lint + audit:routes + test.
- `npm test`: includes `src/lib/audit-routes.test.ts` which fails the suite if any link is broken.

No GitHub Actions workflow exists for verify today; deploys go via Vercel's automatic build. The Vercel build runs `next build`, not `npm run verify`. So the audit hook is currently:
- Developer-facing: anyone running `npm run verify` or `npm test` locally catches broken links.
- Pre-commit: not hooked here yet (the existing pre-commit hook is `docs-lint && next lint`). Adding audit:routes to the pre-commit hook is a one-line change if friction is acceptable.

## Deploy

- Hotfix commit: fcce31a (gate fix).
- Audit commit: 0512d94 (audit script + regression test).
- Final-report commit: ca660f9.
- Pushed to origin/main and deployed to production.
- Production alias: https://gsl-ops-automation.vercel.app
- Final deployment id: dpl_DDivLX4cm3ev8wSPvsiu737dKKAq.
- Smoke-test expectations: /mous loads for Pranav (Admin + finance) without the "+ New MOU" button visible; Anish (Admin + null) still sees the button and reaches /mous/new without 404; school detail "+ Draft new MOU" and consolidated landing "New MOU" quick action gated the same way.

## What is NOT in this hotfix

- Pranav's MOU-drafting access policy. CLAUDE.md and `docs/role-decisions.md` are explicit that Admin + finance department is intentionally department-scoped (the Misba MM2 pattern applied to Finance). If the policy should change so Finance users can draft MOUs, that is a separate access-model decision, not a hotfix.
- Orphan-route triage. Per the hotfix brief, orphans become Phase C work.
- Fetch-call route verification. The audit covers user-clickable links (href, router.push, redirect) but not `fetch('/api/...')` typos. Adding fetch coverage is a reasonable Phase C enhancement.
