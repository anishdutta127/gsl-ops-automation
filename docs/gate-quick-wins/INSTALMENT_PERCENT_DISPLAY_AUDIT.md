# Instalment % display audit

**Gate:** Phase 2 quick wins (2026-05-19).
**Trigger:** Pranav review item #2: "Also, percentage should be shown
with expected amount for each instalment."

## Surfaces that render instalment rows

| # | Surface | Rendering context | In scope? |
|---|---|---|---|
| 1 | `/mous/[mouId]/installments` table | Primary list view: all instalments of one MOU, full-width table | **Yes.** Add new % column. |
| 2 | `/mous/[mouId]` right-column "Instalments" collapsible card | Per-MOU summary list, dense + concise | **Yes.** Inline `(N% share)` next to amount. |
| 3 | `/mous/[mouId]/installments/[paymentId]/mark-paid` | Single-row action form ("you are marking instalment 2 paid") | **No.** Single-row context; % adds noise. |
| 4 | `/mous/[mouId]/installments/[paymentId]/mark-partial` | Same as #3 | **No.** |
| 5 | `/mous/[mouId]/installments/[paymentId]/edit` | Same as #3 | **No.** |
| 6 | `/mous/[mouId]/installments/[paymentId]/mark-pi-sent` | Same as #3 | **No.** |
| 7 | `/mous/[mouId]/installments/schedule-edit` | Multi-row editor: user is choosing the schedule, percentages are the EDITABLE input (not a display) | **No.** Out of scope; user is already typing the percentages. |
| 8 | `/finance/pi/pending` | Cross-MOU urgency list of pending PIs | **No.** Rows span different MOUs; per-row % would be "% of THAT MOU's contract" which is noise in a triage view. |
| 9 | `/finance/payments/[paymentId]` | Single-row detail | **No.** Single-row context. |
| 10 | `/finance/pi/[paymentId]` | Single PI detail (Phase 5 may add "PI summary table on invoice", explicitly out of scope this gate) | **No.** |
| 11 | `/finance/payments/new` (PaymentLogForm) | Payment matcher | **No.** Adjusting form input, not surveying the schedule. |
| 12 | `/finance/payments/bulk` | Bulk reconciliation matcher | **No.** Same. |
| 13 | `/finance/adjustments/new` | Adjustment entry against one instalment | **No.** |
| 14 | `/finance/receipts` | Receipt history list | **No.** Cross-MOU; not a schedule view. |
| 15 | `/mous/[mouId]/payment-receipt` | Single-row action form | **No.** |
| 16 | `TopOverduePaymentsPanel` (finance dashboard) | 5-row overdue snapshot | **No.** Triage view, single-row signal is balance not % share. |
| 17 | `/dashboard/leadership` | Reports / dashboards | **No.** Aggregate. |

## Percent computation

Per-row percentage = `(payment.expectedAmount / mou.contractValue) * 100`.

Edge cases:
- `mou.contractValue === 0` (rare; only Pending Signature with no schedule yet) → display `-`.
- Sum of all per-row percentages should round to 100. Rounding behaviour matches `deriveScheduleSummary` (last row absorbs remainder) so the table footer reconciles.
- Display: `25%` for whole-integer, `12.5%` for halves, `33.33%` for thirds (two decimal places only when needed; strip trailing zeros).

## Visual treatment

- **Surface 1 (table):** new column between Due and Expected. Right-aligned tabular-nums. `text-muted-foreground` for secondary visual weight. Header label: `%`.
- **Surface 2 (collapsible card):** inline `(N%)` after the amount, in `text-muted-foreground text-[11px]`.

## Mobile

- Surface 1's table is already `overflow-x-auto`; the new column adds ~50px which the existing wrap pass accommodates. No mobile-specific hide needed (the brief permits hiding if necessary; not needed here).
- Surface 2's collapsible card is a single line per row that already wraps gracefully.

## Tests

- `src/lib/mou/instalmentPercent.ts` — unit tests for the formatter (whole, half-decimal, third-decimal, zero contract value).
- SSR walk test asserts `%` column header + at least one row's percent text on the installments page.

## Decision

Implement surface 1 (table column) + surface 2 (inline). Skip surfaces 3-17 per rationale above. If Pranav requests percentages elsewhere post-rollout, this audit is the starting point for the conversation.
