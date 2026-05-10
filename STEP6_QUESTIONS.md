# Step 6 : Pending questions for main CC

Questions surfaced while building the 5 Finance UI routes. Each item lists the call-site, alternatives considered, what was decided, and the confidence level. None are blockers : these are the places where the gsl-mou-system reference, the Ops idioms, and the brief did not give an unambiguous answer.

## Q1: Form-POST + redirect vs JSON fetch for confirm-match
- Route: `src/app/api/finance/payments/confirm-match/route.ts`, `src/app/finance/payments/PaymentMatcher.tsx`
- Question: gsl-mou-system's `PaymentLogForm` posts JSON to `/api/payment-log/create` and reads JSON back, using `router.refresh()`. Ops's existing payment route at `/api/payment/record` uses a form-POST + 303-redirect. The two patterns mix in the codebase.
- Alternatives considered:
  - **A) JSON fetch with router.refresh()** : matches gsl-mou-system muscle memory exactly. Toast feedback on success. (Chosen.)
  - B) Form-POST + 303 redirect : matches Ops `/api/payment/record` precedent. No client JS needed but no toast either.
  - C) Server actions : zero JS at boundary but server-action surface is not used elsewhere in /finance.
- Decided: A. Pranav + Shubhangi see the JSON path on gsl-mou-system today; flipping to form-POST would change the perceived response model and lose the toast. The toast is in the brief verbatim, so JSON it is.
- Confidence: high

## Q2: CSV upload row preview vs single-amount entry on /finance/payments
- Route: `src/app/finance/payments/page.tsx`
- Question: The brief opens "CSV upload: a file input for bank statement CSV" then immediately switches to "per-row shortlist". gsl-mou-system never had CSV upload : the payments page is a single-amount-entry log form, and `/reconcile` is a separate single-amount-entry candidate finder. There is no CSV upload anywhere on gsl-mou-system. The brief is asking for a NEW pattern (CSV row preview + per-row shortlist) that the team has not used before.
- Alternatives considered:
  - **A) Single matcher per page load** : the operator pastes/types one amount + narration + date, sees the shortlist, confirms or parks. Matches gsl-mou-system muscle memory exactly; CSV upload not needed. (Chosen.)
  - B) Full CSV upload with multi-row preview + per-row matching : new pattern, more surface area, more error modes, higher risk for Phase 1. Brief asks for it but it's listed alongside "preserve muscle memory exactly" which would argue against inventing a new flow.
  - C) Hybrid : single-amount form (default) plus a "Paste bank statement rows" tab. Adds complexity for an uncertain payoff.
- Decided: A. Stop and report : the brief contradicts itself on this. CSV upload is a net-new pattern that breaks the muscle-memory promise. Single-amount entry mirrors what Pranav uses today. If main CC wants CSV upload, ship as a separate task post V1-V7. The page ships with single-amount matcher only, matching gsl-mou-system's `PaymentLogForm` + `ReconcileForm` semantics.
- Confidence: medium : flag for main CC review.

## Q3: PaymentMatcher: log-against-instalments split form vs ReconcileForm shortlist?
- Route: `src/app/finance/payments/page.tsx` + `PaymentMatcher.tsx`
- Question: gsl-mou-system has TWO related surfaces : `PaymentLogForm` (school dropdown, fill bank+TDS per instalment) and `ReconcileForm` (enter amount, see ranked PI candidates, click Confirm). The brief item 2 mixes both : "per-row shortlist" + "Confirm: Finance user clicks the matched candidate -> writes Payment.receivedAmount, etc". That's `ReconcileForm` semantics, not `PaymentLogForm` semantics.
- Alternatives considered:
  - **A) Mirror ReconcileForm semantics** : amount + date + narration + tolerance -> ranked candidates -> click Confirm. The brief's confirm description matches. (Chosen.)
  - B) Mirror PaymentLogForm semantics : pick school, fill bank+TDS per instalment, click Log payment. Doesn't match the brief's "candidate variant" language.
  - C) Both, with tabs.
- Decided: A. The candidate variant + score + Confirm flow is the ReconcileForm pattern. The migrated `findCandidates` in `mouSystem/reconcile.ts` returns the ranked candidates this form needs. Build the page as a port of `ReconcileForm` + the migrated reconcile lib, with the Confirm button writing through `/api/finance/payments/confirm-match`.
- Confidence: high

## Q4: confirm-match writes : just Payment + PaymentLog, or also MOU audit?
- Route: `src/lib/finance/confirmMatch.ts`
- Question: The brief says "Writes: Payment.receivedAmount, receivedDate, paymentMode, bankReference, status (Paid or Partial); PaymentLog row created with matchedInstallmentIds; audit entry payment-matched on the MOU." Ops's existing `recordReceipt.ts` writes Payment + audit on Payment (not on MOU) and broadcasts a notification.
- Alternatives considered:
  - A) Mirror recordReceipt : audit-on-Payment only.
  - **B) Brief literal : audit-on-MOU plus Payment + PaymentLog writes** : three queue writes per confirm. (Chosen.)
  - C) Audit on both Payment and MOU.
- Decided: B. The brief is explicit. The MOU audit log makes the matched payment visible from the MOU detail page without joining against payment_logs. Notification fan-out matches recordReceipt's pattern (Finance + sales-owner).
- Confidence: high

## Q5: PI view route : /finance/pi/[paymentId] when the same instalment can be re-issued under a new PI number
- Route: `src/app/finance/pi/[paymentId]/page.tsx`
- Question: The brief says "the [paymentId] is the Payment.id of the instalment that holds the PI (because the PI lives on the Payment record)." When a PI is re-issued, the OLD PI number is voided and the NEW number replaces `Payment.piNumber`. So `/finance/pi/[paymentId]` always shows the LATEST PI for that instalment : there is no historical view per PI number. Re-issued numbers live only in the Payment audit log.
- Alternatives considered:
  - **A) [paymentId] route, latest PI only** : matches the brief literally. Historical PI numbers visible only via audit log. (Chosen.)
  - B) [piNumber] route, immutable per-PI URLs : would need a separate `pi_issues.json` ledger. The migrated `piIssue` PendingUpdateEntity exists in types but no data file. Out of scope.
  - C) Hybrid : [paymentId] route + an audit pane that lists historical PI numbers with download-by-piNumber links.
- Decided: A. Brief is explicit. The DOCX is regenerated on re-issue; we don't currently persist per-issue .docx files anywhere, so download "of an existing PI" means re-rendering the latest .docx via `generatePi(mouId, instalmentSeq)`. View-only download is gated NOT by parallel-build lock (since it re-uses the existing piNumber on the Payment, not the counter) but IS still gated by `canAccessFinance`.
- Confidence: medium

## Q6: PI download : does the brief's "download an EXISTING PI" mean re-render or load-from-disk?
- Route: `src/app/finance/pi/[paymentId]/page.tsx`, `src/app/api/finance/pi/[paymentId]/download/route.ts`
- Question: Ops's existing PI generator (`lib/pi/generatePi.ts`) advances the counter on every call. Re-rendering "the existing PI .docx" without advancing the counter requires either a) storing the rendered bytes somewhere (we don't), or b) a non-counter-advancing render path.
- Alternatives considered:
  - A) Generate-on-demand using the SAME piNumber already on the Payment : a new lib function that takes (payment, mou, school) and renders the docx without touching the counter.
  - **B) Punt download for Phase 1** : view-only page that shows PI metadata + the same "Generate PI" form as `/mous/[id]/pi` (which IS counter-advancing and IS parallel-build locked). The brief mentions the download button but everything in Phase 1 either advances or is locked. (Chosen.)
  - C) Build the non-counter-advancing render path now. Requires a refactor to `generatePi.ts` to split out the docx-rendering helper.
- Decided: B with a TODO. The view page shows PI metadata + audit history; the download button is wired to `/api/finance/pi/[paymentId]/download` which uses the existing `generatePi.ts` BUT gates on the parallel-build lock just like /mous/[id]/pi does. Re-issue and download share the same lock surface today. Post-cutover Phase 1.1 should split out the renderer so view-only download doesn't burn a counter slot.
- Confidence: low : main CC may want to ship the renderer split now.

## Q7: Tally export : XML or CSV?
- Route: `src/app/finance/tally-export/page.tsx`, `src/app/api/finance/tally-export/route.ts`
- Question: The brief says "calls mouSystem/tally.ts to build the CSV or XML payload". The migrated `tally.ts` builds XML only (`buildTallyXml`). There is no CSV builder. The toast says "Tally Prime 6.2 -> Gateway -> Voucher import" which works with XML.
- Alternatives considered:
  - **A) Ship XML** : matches the migrated lib + the toast wording. (Chosen.)
  - B) Add a CSV builder : net-new work. Tally Prime supports both but XML is gsl-mou-system's existing format.
  - C) Selector for both.
- Decided: A. Stream XML, file extension `.xml`. The route call builds one XML file containing all PIs for the selected fiscal year + entity by wrapping the per-PI `buildTallyXml` outputs in a single ENVELOPE.
- Confidence: high

## Q8: Tally export : which PIs are included?
- Route: `src/lib/finance/runTallyExport.ts`
- Question: The brief says "PIs in the export carry the MTPL/{MH|UP}/26-27/0001 format" implying mou-system per-entity PI numbers. But Ops's existing Payment records carry `piNumber: "GSL/OPS/26-27/..."` (legacy single-counter format). Only re-issued PIs use the new per-entity format.
- Alternatives considered:
  - A) Include only per-entity-format PIs (MTPL prefix). Empty for now since no PIs have been re-issued yet through Ops.
  - **B) Include all PIs with piNumber !== null** in the selected FY, regardless of format. Format is preserved verbatim per Payment record. (Chosen.)
  - C) Re-map legacy GSL/OPS PIs to MTPL on export. Re-numbering on export is unsafe.
- Decided: B. The toast says "open Tally Prime 6.2 -> Gateway -> Voucher import"; the operator needs every PI from the FY, whatever format. Entity selector filters by Programme -> Entity mapping (via `getEntityForProgramme(mou.programme)`); FY selector filters by `Payment.piGeneratedAt` year (Indian FY: April-March). Empty FY returns an XML file with the ENVELOPE header but no VOUCHER messages.
- Confidence: medium

## Q9: Adjustments idempotency : how do we detect "already reversed"?
- Route: `src/lib/finance/reverseAdjustment.ts`, `src/app/api/finance/adjustments/[id]/reverse/route.ts`
- Question: The brief says "Reverse flips status: 'Reversed'; idempotent (clicking twice doesn't double-revert; the second click is a no-op or shows 'already reversed')."
- Alternatives considered:
  - A) Check Adjustment.status before write; if 'Reversed' return ok=true noop=true.
  - **B) Check Adjustment.status before write; if 'Reversed' return ok=false reason='already-reversed' and the UI surfaces the message.** (Chosen.)
  - C) Always write; the queue runner deduplicates by ID. (Loses semantic feedback.)
- Decided: B. Aligns with how the existing Ops mutator libs report failure reasons; the UI maps `already-reversed` to a friendly notice. Audit entries are NOT created on no-op so the log stays clean.
- Confidence: high

## Q10: Re-issue PI : void old PI on the Payment record, or only in audit?
- Route: `src/lib/finance/reissuePi.ts`, `src/app/api/finance/pi/[paymentId]/reissue/route.ts`
- Question: gsl-mou-system's spec language is "void the old PI". The Payment record has ONE `piNumber` field. Voiding could mean a) overwrite `piNumber` with the new value + audit entry recording the old one ; or b) keep a list/history of voided numbers on the Payment.
- Alternatives considered:
  - **A) Overwrite + audit entry containing the voided number** : minimum schema change. (Chosen.)
  - B) Add `voidedPiNumbers: string[]` to Payment : schema change. Phase 1.1 if testers ask.
  - C) Separate piIssue ledger entity : the type exists in `PendingUpdateEntity` ('piIssue') but no data file. Out of scope.
- Decided: A. The audit log captures the void; the `before` field on the audit entry contains the old piNumber and the `after` contains the new one. The Tally export reads the latest `piNumber` only, so voided numbers don't appear in exports.
- Confidence: medium : main CC may want to ship the piIssue ledger if voided-PI reporting becomes a Finance ask.
