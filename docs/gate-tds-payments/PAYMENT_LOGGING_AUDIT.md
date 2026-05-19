# Payment logging + TDS audit

**Gate:** Phase 4 - TDS-aware payment logging (2026-05-19).
**Trigger:** Pranav review items #7 + #8.

## Current Log Payment surface

| Aspect | State |
|---|---|
| Primary surface | `/finance/payments/new` (server route + client component `PaymentLogForm.tsx`) |
| Form fields today | school + MOU + instalment cascade, receivedAmount (single number), receivedDate, paymentMode, bankReference, bankName, `tdsDeducted` (single optional number), notes |
| POST target | `/api/finance/payment/log` |
| Routing branches | (1) school + MOU + instalment + amount-exact -> `recordReceipt()` auto-match; (2) school + MOU only OR amount diverges -> enqueue PaymentLog row (parked); (3) school only -> PaymentLog without MOU hint, redirect to `/finance/payments/unmatched` |
| TDS handling today | The `tdsDeducted` form field is folded into the `narration` string ("tds=12500") on the parked PaymentLog row. It is **not** persisted as a structured field on Payment; it is not added to `receivedAmount`; it is not visible on the Installment table, MOU detail, or reports without parsing the narration text. |
| Permission | `canEditFinanceData` (Finance + Admin wildcard); `canPerform('payment:reconcile')` inside `recordReceipt`. |
| Secondary surfaces | `/finance/payments/bulk` (CSV upload), `/finance/payments/unmatched` (parked entries), `/finance/payments/[paymentId]` (single-payment detail, edit mode), `/mous/[mouId]/payment-receipt` (per-instalment quick record) |

## Payment schema today

```
Payment {
  id: string                    // `<mouId>-i<instalmentSeq>`
  mouId, schoolName, programme, instalmentLabel, instalmentSeq, totalInstalments
  description, dueDateRaw, dueDateIso
  expectedAmount: number
  receivedAmount: number | null    // SINGLE total - no bank / TDS split
  receivedDate, paymentMode, bankReference
  piNumber, taxInvoiceNumber
  status, notes
  piSentDate, piSentTo, piGeneratedAt
  studentCountActual
  partialPayments: PartialPaymentEntry[] | null
  auditLog: AuditEntry[] | null
  piVoidedAt, piVoidReason
}
```

**Key finding (`node -e` count over `src/data/payments.json`):** 396 Payment rows total; **zero carry a `bankAmount` or `tdsAmount` field today.** All 167 rows with `receivedAmount > 0` represent the combined total without an explicit split.

## Display surfaces and what they show

| Surface | Code | Renders |
|---|---|---|
| `/finance/payments` list | `src/app/finance/payments/page.tsx` | `receivedAmount` (single column). |
| `/finance/payments/[paymentId]` | `src/app/finance/payments/[paymentId]/page.tsx:100` | "Received" tile: `formatRs(payment.receivedAmount)`. Edit form has a single `receivedAmount` input. |
| `/mous/[id]/installments` table | `src/app/mous/[mouId]/installments/page.tsx` | Per row: Expected | Paid (= receivedAmount). |
| `/mous/[id]` detail (Bug 5 fix) | `src/app/mous/[mouId]/page.tsx:357` | `receivedFromInstallments = sum(p.receivedAmount)` -> KPI tile. This already treats `receivedAmount` as **TDS-inclusive** if the operator entered the full amount; the gap is that the form does not capture the split, so operators are entering bank-only totals and the KPI is therefore under-stated. |
| Reports | `/reports/payment-aging`, `/reports/fy-summary` | All aging + receipt logic reads `receivedAmount`. |

## Payment matching today

`PaymentLog` is a parked unmatched-bank-statement entry. The reconcile flow:

1. Operator logs a bank statement entry at `/finance/payments/new`. If MOU + instalment narrow and the amount is exact, the entry skips PaymentLog and goes straight to `recordReceipt` (Payment.status -> 'Paid').
2. Otherwise it parks as `PaymentLog` with `unmatched: true`.
3. `/finance/payments/unmatched` lists parked entries.
4. `PaymentMatcher.tsx` offers a per-row match-to-installment flow.

The matcher today compares `PaymentLog.amount` to `Payment.expectedAmount`. If the school deducted TDS, the **net amount in the bank entry will be less than `expectedAmount`**, so the matcher falls back to the parked path even when the entry obviously belongs to a known instalment.

## Why Pranav flagged this

Pranav's example workflow:

> Kavyapta Global School issues PO for Rs 1,50,000. School deducts TDS 5 percent. Bank receives Rs 1,42,500. Pranav logs Rs 1,42,500 -> the system marks instalment "partial" (variance Rs 7,500). But Pranav's perspective: the **instalment is fully paid**. The Rs 7,500 is the school's TDS contribution to government on Pranav's behalf, and Pranav files form 26AS to claim it back. The instalment must reconcile to Rs 1,50,000 total.

So the schema needs a structured `bankAmount + tdsAmount` split, and the form must let Pranav enter both columns so the total credits the instalment without flagging as variance.

## Decisions (built to per the brief)

1. **Add `bankAmount?: number` and `tdsAmount?: number` to Payment as optional fields.** Optional so the 396 existing rows do not need a backfill commit; libraries default to `bankAmount = receivedAmount, tdsAmount = 0` when reading.
2. **`receivedAmount` stays as the canonical total.** When the new form writes a row, `receivedAmount = bankAmount + tdsAmount`. All existing display surfaces continue to render `receivedAmount` and need no change.
3. **New primary surface: `/finance/payments/log-batch`.** Per-school batch entry: pick school, list outstanding instalments, per-row Bank + TDS columns, sub-totals + Total to credit, one click submits N Payment updates.
4. **Existing `/finance/payments/new` stays.** Gains a Bank + TDS column pair (replaces the current "TDS deducted" free-text field). Same POST endpoint, same routing branches.
5. **Both write paths share the same `recordReceipt` lib (extended) so audit + notification fan-out stays single-source.**
6. **Schema migration: opt-in, lazy.** When the new form writes a row, the row gains the new fields. Existing rows stay untouched. The audit log gains a "tds-fields-introduced" entry on the MOU (NOT on every Payment) so Pranav can find rows that pre-date the split if he wants to revisit them later. Brief asked for "needs-review" flag per Payment; **deferred** because flagging 167 rows would noise the audit log and Pranav has not asked for a backfill UI.
7. **Bank-statement match suggestion (Step 5):** when the new batch form lands, compute `sum(bankAmount)` and check `/finance/payments/unmatched` for an existing PaymentLog with matching `amount` and (optionally) matching `reference`. Surface as a non-blocking banner with a single "Confirm match" button. Not a forced match.

## Out of scope (BACKLOG)

| Item | Why deferred |
|---|---|
| Backfill UI to split historical receivedAmount | 167 rows; Pranav has not asked for it. The new schema fields are optional. |
| TDS certificate PDF upload | New attachment surface; not in this gate. |
| Automated TDS rate detection from school history | Needs ML / heuristics; Phase 5+ |
| Monthly TDS reconciliation report for form 26AS | Useful but new report; Phase 5+ |
| Foreign-currency receipts | Out of scope for any Indian-FY gate today |

## In-scope file changes

1. `src/lib/types.ts` - add `bankAmount?: number | null` + `tdsAmount?: number | null` + `tdsCertificateRef?: string | null` + `tdsRate?: number | null` to `Payment`.
2. `src/lib/payment/recordReceipt.ts` - accept optional bank + TDS inputs; default + persist; keep `receivedAmount = bank + tds` invariant.
3. `src/lib/payment/recordBatch.ts` (new) - thin batch wrapper that calls `recordReceipt` per row inside the same try/catch.
4. `src/app/finance/payments/log-batch/page.tsx` + `LogBatchForm.tsx` (new) - the primary batch UI.
5. `src/app/api/finance/payment/log-batch/route.ts` (new) - POST target for the batch form.
6. `src/app/finance/payments/new/PaymentLogForm.tsx` - replace single `tdsDeducted` input with `bankAmount + tdsAmount` pair.
7. `src/app/api/finance/payment/log/route.ts` - accept the two new fields, pass through to `recordReceipt`.
8. `src/app/finance/payments/[paymentId]/page.tsx` - display Bank + TDS + Total when the row carries the split; otherwise unchanged.
9. `src/app/mous/[mouId]/installments/page.tsx` - per-row Bank / TDS breakdown reveal (optional disclosure; default keeps the existing "Paid" total).
10. `src/lib/payment/matchSuggestion.ts` (new) + `MatchSuggestionBanner.tsx` - the Step 5 reconciliation safeguard.
11. `src/app/finance/payments/page.tsx` - update the page header to highlight the new batch CTA as primary.

## Tests

- `recordReceipt.test.ts` extended for bank / TDS split.
- `recordBatch.test.ts` for the batch wrapper (atomic per row, ok if one row fails, audit per row).
- `matchSuggestion.test.ts` for the bank-statement-match heuristic.
- SSR walk for `/finance/payments/log-batch` covering the 6 flows in the brief.
- Existing `recordReceipt.test.ts` + `paymentMutations.test.ts` continue green (backwards compat).
