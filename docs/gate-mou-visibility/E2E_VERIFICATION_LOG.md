# gate-mou-visibility: E2E verification log

Covers two requests: (1) instalment % display in the Add MOU schedule, and
(2) MOUs visible on the dashboard but not in the MOUs list. Task 2's diagnosis
is folded into the data-layer audit (see `docs/gate-db-migration/`), because the
same build-time-vs-live read split is the cause and the planned full DB migration
is the real fix; this log records Task 1 and points to the audit for Task 2.

## Task 1: instalment % in the Add MOU schedule

**Change (`src/app/mous/upload/AddMouForm.tsx`, `src/lib/mou/instalmentPercent.ts`):**

- Each instalment row shows its share of the contract value, computed live, to
  one decimal place (e.g. `25.2% of contract value`), under the amount input.
  Shown only when the contract value is known and the row amount is positive.
- A total row (`Total scheduled: Rs X (Y.Y%) of Rs Z contract value`) shows the
  summed amount and the total percentage.
- The "schedule does not add up to the contract value" `signal-attention`
  warning now fires when the total is not 100% within a +/- 0.1% tolerance
  (previously exact-rupee equality, which warned on harmless rounding).
- Display-only. Entering a % to derive the amount is a possible follow-up
  (noted in the commit), not built here.

Share maths extracted to pure helpers (`instalmentSharePct`, `scheduleAddsUp`)
so they are unit-testable: `percent = contractValue > 0 ? (amount / contractValue) * 100 : 0`.

**Verification:**

| What | How | Result |
|---|---|---|
| Per-row share maths (25%, 50%, 1-dp 25.2%, 0 when contract value <= 0, 0 for empty amount) | `src/lib/mou/instalmentPercent.test.ts` | PASS (16 tests) |
| Add-up tolerance (exact split true; few-rupee rounding true; materially short/over false; unknown contract value false) | same file | PASS |
| Component typechecks + builds | `npm run build` | PASS (exit 0) |

**Residual risk (per V4):** the live visual render of the % was not walked in a
browser this session (no interaction-testing library is installed, and I did not
add one). The numerically-fallible part (the share maths and the tolerance gate)
is unit-tested, and the JSX is a straight render of those values that typechecks.
Confirm the on-screen rendering in the post-deploy browser pass.

## Task 2: MOUs on dashboard but not in the MOUs list

Diagnosed as part of the data-layer audit rather than fixed with a throwaway
interim patch, because (a) the cause is the same build-time-JSON vs live-DB read
split that the audit maps in full, and (b) the user has commissioned a complete
migration to one live DB, which is the correct fix. See
`docs/gate-db-migration/E2E_VERIFICATION_LOG.md` (and the audit summary) for the
side-by-side read-path comparison and the single actual cause.
