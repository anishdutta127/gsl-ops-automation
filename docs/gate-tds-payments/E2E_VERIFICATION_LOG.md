# E2E verification log: 2026-05-19 TDS-aware payments gate

**Standard:** CLAUDE.md V4 verification standard.
**Gate:** Phase 4 - TDS-aware payment logging (Pranav review #7 + #8).
**Tooling:** SSR component-tree walks; no Playwright in this repo.

## Verification tooling

1. `src/__e2e/tds-payments-2026-05-19.test.tsx` - 5 SSR walkthrough
   cases.
2. Unit suites:
   - `src/lib/payment/recordReceipt.test.ts` - 15 cases (9 existing +
     6 new TDS).
   - `src/lib/payment/recordBatch.test.ts` - 5 batch cases.
   - `src/lib/payment/matchSuggestion.test.ts` - 9 reconciliation
     suggestion cases.
3. Full vitest suite at HEAD plus production build pass.

## Flow walks

### Flow 1 - Batch payment entry (single instalment)

| Step | Assertion | Result |
|---|---|---|
| `/finance/payments/log-batch` with no `?schoolId=` renders the school picker | `data-testid="batch-school-picker"` present | PASS |
| Picker only lists schools with at least one outstanding instalment | filter in `outstandingForSchool` + `schoolsWithOutstanding` set | PASS (code inspection) |
| One-row submit creates one Payment via recordBatch | `recordBatch.test.ts` "happy path: 3 rows" + per-row outcome shape | PASS |
| MOU detail "Received" tile shows TDS-inclusive total | Phase 1 Bug 5 already wired `receivedFromInstallments = sum(p.receivedAmount)` | PASS (Phase 1 regression test) |

### Flow 2 - Multi-instalment payment with TDS

| Step | Assertion | Result |
|---|---|---|
| Batch page renders the per-row Bank + TDS column inputs | "Bank now" + "TDS now" + "Row total" headers present | PASS |
| Footer surfaces `batch-total-bank`, `batch-total-tds`, `batch-total-credit` | testid presence | PASS |
| `recordBatch` writes N Payment updates for N filled rows | unit test "happy path: 3 rows" | PASS |
| Kavyapta-style 142500 + 7500 = 150000 round-trips on recordReceipt | unit test "TDS split: rows adding to receivedAmount" | PASS |

### Flow 3 - Validation cases

| Step | Assertion | Result |
|---|---|---|
| Overpayment renders per-row warning | `rowWarning` returns "Overpayment: Rs N above balance" when total > balance + 1 | PASS (code inspection) |
| TDS only with no bank renders per-row warning | `rowWarning` returns "TDS only with no bank (likely wrong)" | PASS (code inspection) |
| Submit blocked when every row blank | client-side `validate()` returns "Fill bank or TDS for at least one instalment." | PASS (code inspection) |
| API rejects bank + TDS mismatch | recordReceipt.test.ts "rejects when bank + TDS does not match" | PASS |
| API rejects negative bank or TDS | recordReceipt.test.ts "rejects negative bank or TDS" | PASS |

### Flow 4 - Single payment (fallback at /finance/payments/new)

| Step | Assertion | Result |
|---|---|---|
| Form renders Bank + TDS input pair | `payment-log-bank-amount` + `payment-log-tds-amount` testids present | PASS |
| Old `tdsDeducted` field is gone | `name="tdsDeducted"` absent from HTML | PASS |
| API accepts the split + falls back when omitted | `recordReceipt` extended; backwards-compat test "omitting both fields preserves backwards compat" | PASS |

### Flow 5 - Payment detail surfaces the split

| Step | Assertion | Result |
|---|---|---|
| Detail page renders `payment-detail-received` for an existing row | testid present | PASS |
| When the row carries the split, `payment-detail-tds-split` line renders | conditional render on `payment.bankAmount !== null` | PASS (code inspection; no fixture rows carry the split yet) |
| Installments table row shows the Bank + TDS subline when present | conditional `installment-tds-split-<id>` testid | PASS (code inspection) |

### Flow 6 - Mobile / reports

| Step | Assertion | Result |
|---|---|---|
| Batch form table is `overflow-x-auto` | inspecting the wrapper class on the `<table>` parent | PASS (code inspection) |
| Payment-aging report uses `receivedAmount` (TDS-inclusive) | unchanged: `paymentAging.ts` reads `p.receivedAmount`; recordReceipt invariant keeps the field as bank+TDS sum | PASS (no code change needed) |

## Reconciliation safeguard (Step 5)

| Step | Assertion | Result |
|---|---|---|
| `suggestMatches` returns up to 3 candidates from unmatched PaymentLog rows | matchSuggestion.test.ts "caps at 3 suggestions" | PASS |
| Tier 1: bank-reference equality (case-insensitive trim) | unit test | PASS |
| Tier 2: amount equality + 14-day window | unit test | PASS |
| Tier 3: 1 Rs tolerance | unit test | PASS |
| Already-matched rows skipped | unit test | PASS |
| 14-day window respected | unit test | PASS |
| Banner is non-blocking (saves the batch even if user ignores) | client form: banner renders before submit; no submit guard | PASS (code inspection) |

## Schema migration impact

| Metric | Value |
|---|---|
| Total Payment rows in `src/data/payments.json` | 396 |
| Rows with `receivedAmount > 0` | 167 |
| Rows already carrying `bankAmount` / `tdsAmount` | 0 |
| Rows that would gain `bankAmount = receivedAmount, tdsAmount = 0` if backfilled today | 167 (deferred per audit) |

Per the audit decision: no backfill commit. Existing rows continue to render via the `receivedAmount` total; the split fields are opt-in for new entries posted through the Phase 4 forms. Pranav can revisit historical splits if needed; the gate did not silently rewrite 167 audit-trail rows.

## Residual gaps for honest accounting

- **No live browser walk.** Playwright not installed. SSR walks cover
  structural rendering. Visual + interactive verification is on
  Anish and Pranav post-deploy.
- **PaymentLog auto-link is non-blocking.** The match-suggestion
  banner surfaces candidates but does not write the link. Operator
  must close the loop manually at `/finance/payments/unmatched`. A
  "confirm match" button that mutates is a future gate item.
- **Bulk CSV upload (`/finance/payments/bulk`) not Phase-4-aware.**
  The CSV template still uses the single-amount column. Pranav uses
  the batch form for most reconciliation, so the CSV path is lower
  priority. Tracked as a follow-up.
- **TDS certificate upload (PDF)** deferred; new attachment surface
  outside this gate's scope.
- **Monthly TDS reconciliation report for form 26AS** deferred; new
  report.

## Commits in this gate

```
8cf857a feat(payments): single-payment form gains Bank + TDS columns (replaces tdsDeducted)
<sha>   feat(payments): integrated TDS-aware batch payment logging per school
<sha>   feat(payments): TDS schema fields with backwards-compatible migration
<sha>   feat(payments): TDS breakdown visible on payment detail + installment history
<sha>   feat(payments): auto-suggest bank statement match on batch logging
```

(Full sha chain at the head of `main` at the time of writing; see
final report.)
