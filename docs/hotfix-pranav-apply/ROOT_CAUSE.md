# Hotfix: /admin/imports/pranav-refresh Apply 500 (digest 2300403757)

Date: 2026-05-14
Owner: Anish (via Claude)

## Symptom

Clicking the **Apply selected changes** button at https://gsl-ops-automation.vercel.app/admin/imports/pranav-refresh returns a Next.js server-side exception with error digest 2300403757. The admin import page itself loads (the diff renders correctly, all five tabs are populated). The crash is on the POST to the `applyRefreshAction` server action.

## Root cause

`src/app/admin/imports/pranav-refresh/actions.ts` writes new state through `node:fs/promises.writeFile` directly to `src/data/{mous,payments,schools,sales_team,import_runs}.json`. On Vercel's serverless runtime the entire deployment bundle is mounted read-only outside `/tmp`, so the first `writeFile` call throws `EROFS: read-only file system`. The throw escapes the action, Next.js renders a 500, and the user sees the opaque server-side exception with the digest above.

The pattern is documented in `src/lib/pendingUpdates.ts:11-13`:
> Persistence goes through the GitHub Contents API (see githubQueue.ts); Vercel's serverless filesystem is read-only outside /tmp so direct fs.writeFile is not viable.

`actions.ts` was the only writer in the import surface that bypassed that rule. The CLI counterpart (`scripts/apply-pranav-refresh.mjs`) writes the same files and works locally only (fine, since the CLI never runs on Vercel).

Additional defects exposed at the same time:

1. `applyPranavRefresh` (`src/lib/imports/pranavApply.ts`) processes rows in a single un-guarded loop. If any one row throws (bad fixture, missing matched id, unexpected null), the whole batch aborts. The function already models per-row `result: 'error'` outcomes but only when it explicitly chooses to (e.g. matched MOU not found); an unexpected throw bypasses that path.
2. The action calls `writeJson` unconditionally even when every outcome is `unchanged`/`skipped`. That means an idempotent re-run on Vercel (where re-classification against the already-applied live state produces zero mutations) still crashes on the first write call rather than silently no-opping.
3. The action's redirect on error swallows the underlying reason. Users see a generic 500 instead of `?error=write-failed&detail=EROFS`.

## Why the apply-as-data already worked

The Pranav 2026-05-13 refresh has already been applied to live data via the CLI script (commit `2af82f1`). When `applyRefreshAction` re-classifies against the live state, every row classifies as `UNCHANGED`. The pure apply core returns a 0-change result. The remaining bug is purely the trailing `Promise.all([writeJson(...)])` block: it would have nothing to write, but it still tries to write and that's what crashes.

## Fix

1. `src/lib/imports/pranavApply.ts`: wrap the per-row body inside the `for (const cls of input.classified)` loop with a `try/catch` so any unexpected throw becomes a `result: 'error'` outcome. The batch finishes; the row is surfaced.
2. `src/app/admin/imports/pranav-refresh/actions.ts`:
   - Short-circuit: if the apply produced zero state-mutating outcomes (every outcome is `unchanged`/`skipped`/`error`/`kept-current`), skip the write phase entirely. Idempotent re-runs are now a true no-op.
   - Wrap the `writeJson` Promise.all in `try/catch`. On failure, log to `import_runs.json` is also wrapped (best-effort), and the action redirects with `?error=write-failed&detail=<message>` plus the apply summary so the operator sees what would have been written.
   - Per-row error counts (`failed`) propagate through the redirect to the page.
3. `src/app/admin/imports/pranav-refresh/page.tsx`: render the failed-row count and the write-failure detail when present, instead of dropping them on the floor.

## Verification

- Locally: `node scripts/apply-pranav-refresh.mjs` confirms 81/81 UNCHANGED against current live state.
- Tests: new vitest case proves an action call against post-apply state writes nothing (no `writeFile` invocations) and redirects cleanly with `applied=1&unchanged=N`.
- Tests: a row that throws inside `applyPranavRefresh` is captured as `result: 'error'` and the remaining rows still complete.
- Live: post-deploy, `/admin/imports/pranav-refresh` Apply returns the success banner with `unchanged=81` and no 500.

## Audit log path

Every write made through the apply core writes an `AuditEntry` with `notes: "source: pranav-refresh-2026-05-13"` on the affected entity's `auditLog[]`. On disk: `src/data/mous.json` (per MOU), `src/data/payments.json` (per payment), `src/data/schools.json` (per school). The structured outcome log per apply attempt lands in `docs/gate-5a.8/apply-result.json` when run via the CLI, and in `src/data/import_runs.json` when run via the admin action. Anish can verify by grepping any of these:

```
grep -l "pranav-refresh-2026-05-13" src/data/mous.json src/data/payments.json src/data/schools.json
```
