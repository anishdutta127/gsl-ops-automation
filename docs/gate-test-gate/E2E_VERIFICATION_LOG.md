# gate-test-gate: suite green + non-bypassable test gate

_Date: 2026-06-25._

## Why

The `simple-git-hooks` pre-commit ran only `docs-lint` + `next lint`. It never ran
the test suite, so 23 vitest failures (and, separately, 38 `tsc --noEmit` errors)
sat on `main` invisibly. `next build` did not catch them because it only typechecks
files in the build graph (test files are excluded). The root cause was "tests were
never a gate", not any one broken feature.

## Classification outcome (all 23 failures)

All 23 were STALE TESTS. Zero real regressions; no feature was broken in prod.
Independently code-verified the financial and user-facing claims (not just trusting
the investigation):
- `computeRecalcWithAdjustments` was deliberately retired (recalc.ts) and the live
  schedule-edit path uses `recalcInstallments` (saveSchedule.ts:313). The two
  lifecycleReplay scenarios that imported the retired symbol were removed; coverage
  lives in studentCountRecalc.test.ts + applyCountChange.test.ts.
- PI generation moved off the MOU detail page onto the installments page
  (`canGeneratePI`-gated Generate-PI form); `/mous/[id]/pi` is now a redirect stub.

Root-cause clusters of the 23:
1. PI/schedule pages merged into the installments page (redirect stubs left behind):
   route-redirect assertions + retired-`/pi`-page tests retargeted to the finance PI
   page (9 tests).
2. `BackButton` calls `useRouter()`; test `next/navigation` mocks lacked it -> added
   the stub (7 tests).
3. Legacy fixture/allowlist drift: archive count 92 -> drift-resistant regex; inventory
   TinkRworks 10 -> `>=`; audit allowlist += 3 valid actions (3 tests).
4. ID-format + header redesign drift: VEXD regex widened for the hyphenated FY; list
   registry `received`/`balance` header assertions dropped (now on the detail page) (2 tests).
5. Financial engine swap: 2 obsolete lifecycle scenarios removed.

## tsc (discovered during gate wiring)

`tsc --noEmit` was also red: 57 errors, all in test files, zero in feature code.
- 19 were TS2802 (Set/Map iteration) caused by `tsconfig.json` having no `target`
  (default ES3). Added `"target": "es2017"` (Node 20 runtime is ES2017+; `lib` already
  `esnext`; `next build` is unaffected, it transpiles via SWC). Cleared all 19.
- 38 genuine test-side type issues fixed test-only (mock return types, `never[]`
  annotations, `noUncheckedIndexedAccess` guards, invalid literals corrected or cast,
  one wholesale-stale `School` fixture rewritten to the current type). No feature code,
  no `src/lib/types.ts`, no `src/data/*` touched.

## The gate (the fix for invisibility)

- NEW `.github/workflows/ci.yml`: runs `tsc --noEmit` + `npm run lint` + `npm test`
  (full vitest suite) on every push to `main` and every PR. Runs in CI, so it cannot
  be bypassed with `git push --no-verify` (that only skips local hooks). A red run is
  the signal something is actually broken.
- NEW local backstop: `simple-git-hooks.pre-push` = `npm test` (registered via
  `npx simple-git-hooks`). The full suite is ~3.5 min, acceptable on push; left off
  pre-commit so the fast lint/docs hook stays fast and nobody is tempted into
  `--no-verify` habits.

## Adjacent fix: silent `?error=` gap on the installments page

The PI-generate route redirects failures to `/mous/<id>/installments?error=<reason>`,
but that page read every flash param except `error`, so a failed PI showed no banner.
Added a `PI_ERROR_COPY` map + a `role="alert"` banner (`installment-pi-error`) on the
installments page, with a test asserting it shows on `?error=` and is absent otherwise.

## Verification (local)

- `npx vitest run`: **357 files passed / 12 skipped; 3366 tests passed / 82 skipped; 0 failures.**
- `npx tsc --noEmit`: **0 errors.**
- `npm run lint`: **0 errors** (one pre-existing exhaustive-deps warning, non-blocking).
- `npm run build`: see commit gate.

## Prod data cleanup (separate, done)

Removed two leaked concurrency-test VEX PIs (`VPI-ATOMIC-KUGF42`, `VPI-ATOMIC-KVYYNX`)
and their 20 dangling `VEXPL-ATOMIC-*` logIds (artifacts of
`verify-vex-payment-atomic.mjs`, whose `finally` deletes the row; two runs crashed
first). Backup-first, one transaction, verified: vex_pis 31 -> 29, payment_logs
unchanged (21), both targets gone, 0 dispatches affected. Reversible via
`.recovery-backup/atomic-test-pis-pre-*.json`. Tool: `scripts/cleanup-atomic-test-pis.mjs`.
