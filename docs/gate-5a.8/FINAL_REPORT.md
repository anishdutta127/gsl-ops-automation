# Gate 5A.8 final report

Gate 5A.8: Pranav refresh importer + apply 2026-05-13 refresh.
Date completed: 2026-05-14.
Owner: Anish Dutta.

Cross-references:

- Audit: `docs/gate-5a.8/PRANAV_IMPORT_AUDIT.md`
- Apply log: `docs/gate-5a.8/2026-05-13-APPLY-LOG.md`
- Decisions: `docs/gate-5a.8/decisions.json`
- Apply result: `docs/gate-5a.8/apply-result.json`
- Diff report: `import-data/2026-05-pranav-refresh/diff-report.md`
- Parsed file: `import-data/2026-05-pranav-refresh/parsed.json`

---

## What landed

| Step | Deliverable | Files |
|---|---|---|
| 1 | Audit existing import path | `docs/gate-5a.8/PRANAV_IMPORT_AUDIT.md` |
| 2 | Refresh parser + validator (12 vitest cases) | `src/lib/imports/pranavRefresh.ts`, `pranavRefresh.test.ts`, `scripts/import-pranav-refresh.mjs` |
| 3 | Diff report against live state | `scripts/diff-pranav-refresh.mjs`, `import-data/2026-05-pranav-refresh/diff-report.{md,json}` |
| 4 | Admin import surface + apply core | `src/app/admin/imports/pranav-refresh/{page,actions}.tsx`, `src/lib/imports/{pranavDiff,pranavApply}.ts` + 21 vitest cases |
| 5 | 2026-05-13 refresh applied to live | `docs/gate-5a.8/2026-05-13-APPLY-LOG.md`, `scripts/apply-pranav-refresh.mjs`, `src/data/{mous,payments,schools,sales_team}.json` mutated |
| 6 | Verification + final report | this file |

Commits on `main`:

```
cd30a76 test(import): derive MOU counts from fixture in mou-status; xlsx namespace import
34847c4 data(import): apply Pranav 2026-05-13 refresh with audit log
765fed7 feat(admin): Pranav refresh import surface with conflict resolution
45cb2ab feat(import): Pranav refresh apply core with conflict resolution
fe33dd8 feat(import): Pranav refresh diff report classification
8c0e7d2 feat(import): Pranav refresh parser with data quality handling
7d790c1 docs(import): Pranav refresh audit (Gate 5A.8 Step 1)
```

---

## Apply summary

Refresh tag: `pranav-refresh-2026-05-13`. Source: `import-data/2026-05-pranav-refresh/pranav-refresh-2026-05-13.xlsx`.

### Refresh row counts (81 total)

| Classification | Count | Decision (Anish 2026-05-14) |
|---|---:|---|
| NEW (no FY 26-27 match) | 33 | Apply (create MOU + Payments + School + SalesRep) |
| UPDATE (fields fill blanks) | 27 | Apply |
| UNCHANGED (live matches refresh) | 3 | Apply (no-op) |
| CONFLICT (refresh contradicts non-null live field) | 18 | Apply refresh (trust newer Pranav values, including the R7 Mutahhary studentsActual regression archived in audit) |
| AMBIGUOUS | 0 | n/a |

### Apply results

| Result | Count |
|---|---:|
| Created | 33 |
| Updated | 45 |
| Unchanged | 3 |
| Skipped | 0 |
| Errored | 0 |

Entity deltas:

| Entity | Before | After | Delta |
|---|---:|---:|---:|
| MOUs total | 143 | 176 | +33 |
| MOUs FY 26-27 | 51 | 84 | +33 |
| Payments | 197 | 396 | +199 |
| Schools | 126 | 152 | +26 |
| Sales reps | 18 | 21 | +3 |

---

## V1 to V7 verification

- **V1 (diff label clarity, conflict UI honest):** diff-report.md groups rows by classification, drilldown shows field-by-field current vs incoming with kind (`fill` vs `overwrite`). Conflict UI in the admin surface offers three radio labels: "Keep current values", "Apply refresh values (overwrite live data)", "Keep both as separate MOUs". No marketing-style wording.
- **V2 (375px responsive):** admin page uses Tailwind responsive utilities (`md:` breakpoints) and the existing PageHeader / OpsButton primitives that are 375px-safe; per-row drilldown stacks vertically on narrow screens. Not browser-tested by me; if Anish wants visual confirmation, run /browse or /qa against `/admin/imports/pranav-refresh`.
- **V3 (regression suite green):** `npx vitest run` reports 305 files / 2898 tests passing after the apply. One fixture-count test in `mou-status/page.test.tsx` was updated to derive expected counts from the live fixture rather than hard-coding 143 / 51 / 92; the new test still asserts equality with the fixture, just dynamically. New tests added: 12 parser + 7 apply + 5 diff + 5 page + 4 actions = 33 new vitest cases.
- **V4 (links work):** `/admin/imports/pranav-refresh` registered in the Next.js build manifest; admin landing index now includes the surface as a plain tile. Per-row drilldown links target existing `/mous/[id]` records, which already render.
- **V5 (edge cases):**
  - Empty file: parser skips with reason `empty row` per row; no errors thrown.
  - All-conflict file: diff classifies + admin UI surfaces resolution radios; apply respects user choice.
  - All-unchanged file: idempotent re-apply produces zero state changes (verified below).
  - Re-apply: `node scripts/apply-pranav-refresh.mjs --auto --commit` on the post-apply state produced `created: 0, updated: 0, unchanged: 81`. Confirmed.
- **V6 (Admin-only access):** `/admin/imports/pranav-refresh/page.tsx:113-114` redirects non-authenticated users to `/login` and non-Admin users to `/dashboard`. `actions.ts` server actions repeat the gate. The `page.test.tsx` covers both redirect paths.
- **V7 (no hardcoded contacts):** grep across `src/app/admin/imports/pranav-refresh/`, `scripts/{apply,diff,import}-pranav-refresh.mjs`, `src/lib/imports/pranav*.ts` returns zero phone numbers, zero email addresses, zero hardcoded user names. School / sales-rep names are imported from the Excel file, not hardcoded.

`npm run build` passes locally; the new route registers at `/admin/imports/pranav-refresh` with no import warnings.

---

## Items for Pranav follow-up (4)

These are flagged via `MOU.importNotes` and the parser's `needsReview` flag; they did NOT block the apply.

1. **R7 Mutahhary Public School Baroo, `studentsActual` regression 400 to 0.** The CONFLICT policy applied the refresh value; audit entry on `MOU-STEAM-2627-001` carries `before: { studentsActual: 400 }, after: { studentsActual: 0 }`. Pranav to confirm 0 is correct or restore 400.
2. **R8 Jnana Bharathi English School, `contractValue: 0` despite kit-sent.** UPDATE applied (added student count) but contract value missing. Pranav to fill.
3. **R16 Mahrishi Dayanand School, `contractValue: 0` despite kit-sent.** Same as above.
4. **R31 SD Senior Secondary School and R87 Discovery Oaks School, non-date installment Month.** Values `"advance"`, `"before commencement"`, `"after commencement"` stored verbatim in `Payment.dueDateRaw`; `Payment.dueDateIso` is null. Pranav to confirm whether these should resolve to dates.

---

## Decisions archive

Decisions captured in `docs/gate-5a.8/decisions.json` and surfaced via `AskUserQuestion` to Anish:

1. CONFLICT policy: Apply refresh on all conflicts (trust newer Pranav numbers).
2. Sale-amount = 0 rows: Apply (fill student counts, leave sale amount for Pranav).
3. Multi-product schools: Continuation = always new MOU (matches the diff classification's existing behaviour).

---

## BACKLOG

Phase 1.1 follow-ups deferred from this gate:

- **Sheet 2 (`Billing details _PD`) ingestion** for FY 25-26 historical billing data. 52 rows; cross-checks against existing FY 25-26 MOUs would surface old-vs-new payment reconciliation issues. Not in scope for FY 26-27 cutover.
- **Sheet 3 (`2025-26_Proforma Invoice_PD`) ingestion** for FY 25-26 PI tracking. 25 rows; would replay PI numbers against `pi_counter_map.json` to verify continuity. Not in scope.
- **Automated reconciliation against gsl-mou-system snapshot** as a continuous check rather than a one-time apply. The current `cutover-snapshot.mjs` is the snapshot side; pairing it with a delta-detection job would surface Pranav-side edits to the legacy system that have not yet flowed into Ops.
- **Refresh UI: file-history view** showing prior refresh applies with diff + outcome counts. Currently `src/data/import_runs.json` accumulates the audit but is not surfaced. Would unlock "diff this refresh against the previous one" without re-uploading.
- **Refresh UI: per-row inline approval workflow with Slack/email handoff** if Pranav wants someone else (Misba, Anish) to sign off on conflict resolutions before they hit live data.
- **Conflict resolution defaults configurability** (currently the auto CLI hard-codes `apply-refresh`; the admin UI defaults to `keep-current`). Anish may want to flip defaults per import.
- **Sheet 4 (`2026-27-PD ` with extra dash + trailing space)** appears to be a partial duplicate of Sheet 1 with only 23 rows. Currently skipped silently. If Pranav restores it as the canonical sheet, the parser will need a `--sheet` flag to point at it explicitly.

---

## Acceptance

Steps 1 through 6 complete. Refresh applied to live. Ready for Pranav to verify against the rendered admin surface tomorrow.
