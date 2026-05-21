# Phase 6E investigation: Cretile product routing gap + adjacent issues

Pranav reported three problems intermingled:

1. "No Product Added in MOU" error on Cretile-equipped schools.
2. PI generation error on BIT Global School: "Pick a valid pending instalment".
3. .docx generation failure on YP MOU creation (Image 3 — same fallback toast Phase 6A was supposed to eliminate).

The investigation surfaces **four distinct root causes**. They share the same symptom shape ("error toast on a Cretile / YP / new-MOU flow") but each has a different fix. **No code changes yet** — paused for Anish review of this document.

---

## Finding 1: ALL 183 MOUs in production carry null `productSelection`

Audit:

```
total MOUs:                183
productSelection = null:   183  (100 %)
  STEAM:                   154
  Young Pioneers:           29
```

MOU-STEAM-2627-026 (BIT Global School, the one in Pranav's screenshot) has `productSelection: undefined` and `gradewiseDistribution: undefined`. So does every other MOU including the 9 with Cretile dispatches.

Cross-reference against `dispatches.json`: 9 dispatch records use `skuName: "Cretile Grade-band kit"`. Every one of their parent MOUs has null productSelection.

| MOU id | School | dispatch record | productSelection |
|---|---|---|---|
| MOU-STEAM-2627-007 | St. Mary Convent School | DIS-BF-Cretile-r6 | `undefined` |
| MOU-STEAM-2627-009 | Kavyapta Global School | DIS-BF-Cretile-r4 | `undefined` |
| MOU-STEAM-2627-013 | K.E Carmel School - Amtala | DIS-BF-Cretile-r5 | `undefined` |
| MOU-STEAM-2627-014 | K.E Carmel School - Suri | DIS-BF-Cretile-r10 | `undefined` |
| MOU-STEAM-2627-015 | Blue Angels Global School | DIS-BF-Cretile-r9 | `undefined` |
| MOU-STEAM-2627-020 | Delhi World Public School, Barasat | DIS-BF-Cretile-r8 | `undefined` |
| MOU-STEAM-2627-027 | Don Bosco Krishnanagar | DIS-BF-Cretile-r7 | `undefined` |
| MOU-STEAM-2627-047 | St. Johns High School | DIS-BF-Cretile-r17 | `undefined` |
| MOU-STEAM-2627-050 | Young Horizons School | DIS-BF-Cretile-r16 | `undefined` |

The product data lives in the dispatch record's `lineItems[].skuName` but never propagated up to the MOU. The MOU.productSelection field exists in the type (`src/lib/types.ts:573`) and persists when set via the wizard or `/mous/[id]/kits-details`, but **no importer ever wrote it**.

**Code paths that gate on `mou.productSelection`** (every one of these surfaces the "Product not set" copy when productSelection is null):

| Surface | Line | Behaviour |
|---|---|---|
| `/dispatch/kits/[mouId]/page.tsx:208-217` | shows amber banner "Product selection not yet captured. Set it on the MOU." with link to `/mous/<id>/kits-details` |
| `/dispatch/kits/[mouId]/AllocationForm.tsx:197-201` | shows amber banner "Product selection is not yet set on the MOU. Dropdown is empty until then." |
| `src/lib/kitDispatch/lookup.ts:33` | `eligibleSkusForMou` returns `[]` (empty SKU dropdown) when productSelection is null |
| `src/lib/kitDispatch/allocate.ts:120-127` | rejects `sku-mismatch-product` if the operator somehow submits a SKU not matching productSelection (impossible from the empty dropdown but defensive) |
| `src/lib/kanban/opsWorkflowKanban.ts:275` | reads productSelection for the kanban deriveStage logic (uses null gracefully) |
| `src/lib/dashboard/financeDashboardData.ts:154`, `src/lib/dashboard/opsAugmentData.ts:281` | reads productSelection for the VEX dashboard filter; null is fine |

**Important: the literal string "No Product Added in MOU" is NOT in the codebase.** Pranav was paraphrasing one of the two amber-banner copies on `/dispatch/kits/[mouId]`. PI generation (`/api/pi/generate`) has NO product gate; .docx generation (`/api/mou/generate-docx`) has NO product gate. So Cretile MOUs can issue PIs and render .docx today — but cannot allocate dispatches via the standard form because the SKU dropdown is empty.

**Where the gap originated:**
- Legacy gsl-mou-system `mous.json`: 0 of 152 records carry a `product` or `productSelection` field; the legacy type had no such concept.
- Phase 5A.8 Pranav refresh import (`scripts/import-pranav-refresh.mjs`, `apply-pranav-refresh.mjs`): no `productSelection` mapping in the importer. The Excel may carry a "Product" column; the importer does not read it.
- Phase 6C FY 25-26 import (`src/lib/imports/fy2526Import.ts`): I did NOT set `productSelection`. The Sagaya Matha MOU I created lands with `productSelection: undefined` like every other. My oversight (Pratik's import JSON does carry a `kitsSent` field but no productSelection signal).
- Wizard / kits-details edit pages: these DO persist productSelection correctly (`saveDraftMou` in entityWriters.ts:576 writes it). So freshly-drafted MOUs created via the wizard would have it set if the operator picks. But no historical MOU was ever drafted via the wizard.

---

## Finding 2: BIT Global School PI error is a form/API field name mismatch, not a product gap

BIT (`MOU-STEAM-2627-026`) has:
- 4 instalments, all `Pending`, all expected Rs 2,32,932, no PI on any (`piNumber: null`).
- No dispatches.

So the PI page renders the dropdown with 4 valid pending instalments. Pranav saw "Pick a valid pending instalment" because **the form field is named `installmentSeq` (American, double-L) at `src/app/mous/[mouId]/pi/page.tsx:204` but the API route reads `instalmentSeq` (British, single-L) at `src/app/api/pi/generate/route.ts:42`**. The API gets an empty string, NaN-checks, and 303-redirects back with `?error=invalid-instalment-seq`, which renders the page-level error "Pick a valid pending instalment from the dropdown and try again." (`src/app/mous/[mouId]/pi/page.tsx:59`).

**This is the primary bug Pranav hit on BIT.** It would fire on every MOU's PI form, not just Cretile schools. Has been latent since the form was authored; nobody before Pranav exercised the page in a state where the form submission round-trip actually reached the API (post-cutover most testers' MOUs already had instalments with PIs assigned via the auto-cron).

---

## Finding 3: YP .docx generation toast traces to `outputFileTracingIncludes` covering only 2 of 7 template-loading routes

`next.config.mjs:15-20` currently lists:

```js
experimental.outputFileTracingIncludes: {
  '/api/pi/generate':       ['./public/ops-templates/**/*'],
  '/api/mou/generate-docx': ['./public/mou-templates/**/*'],
}
```

**Missing** (Phase 6A's flagged gap, re-flagged here):

| Route | Reads from | Template missing fallback |
|---|---|---|
| `/api/dispatch/[id]/dispatch-note` | `public/ops-templates/dispatch-template.docx` | `DispatchTemplateMissingError` → 500 to client |
| `/api/dispatch/[id]/handover-worksheet` | `public/ops-templates/handover-template.docx` | `HandoverTemplateMissingError` → 500 |
| `/api/dispatch/generate` (via `raiseDispatch` lib) | `public/ops-templates/dispatch-template.docx` | `DispatchTemplateMissingError` → 500 |
| `/api/delivery-ack/template` | `public/ops-templates/delivery-ack-template.docx` | 500 |
| `/api/finance/pi/[paymentId]/download` (via `renderPi`) | `public/ops-templates/pi-template.docx` | `TemplateMissingError` → 500 |

`/api/pi/generate` and `/api/mou/generate-docx` ARE in the config, so they bundle correctly. **The MOU wizard's "Generate .docx" SHOULD therefore work in production** — but Pranav's Image 3 shows the fallback toast. Two possibilities:

A. The deployed `next.config.mjs` is the current one (with the 2 entries) but a YP-specific code path is reading the YP template via a DIFFERENT route. The wizard's Generate .docx button POSTs to `/api/mou/generate-docx`, which IS covered. So why is the toast firing? Could be: the route was renamed recently and the include path is stale; or the template file is mis-named at the lookup level.

B. The deployed config is an older build that DIDN'T include `/api/mou/generate-docx`. Pranav's screenshot may be from a tab he opened before the Phase 6A fix landed, OR Vercel's cached build is older than expected.

The template-missing copy at `src/app/mous/[mouId]/pi/page.tsx:57` reads: "PI document template is not on this server. Drop the latest PI .docx into `public/mou-templates/` and redeploy. Logged for the operator." Pranav's "Multi error" mention in the brief suggests the toast is `template-missing` with this specific copy.

**Repro to capture in Part 4**: build a tiny diagnostic route that does `readFileSync('public/mou-templates/YP-v2.1.docx')` and reports 200/500. Deploy. If it returns 500 in production, the include is missing or not being applied. If it returns 200, the YP MOU creation toast Pranav saw is from a different code path entirely.

---

## Finding 4: Single-payment Mark-Paid form has no Bank + TDS split

Phase 4 (2026-05-19) added Bank + TDS columns to the BATCH entry form at `/finance/payments/log-batch`. The PER-INSTALMENT Mark-Paid surface — likely `/mous/[mouId]/installments/[paymentId]/mark-paid` or a modal — was not part of that change.

Pranav's Image 1 shows the form he was using: "Amount received" as a single field, no Bank/TDS split. That's the single-instalment path.

The PaymentMatcher component at `/finance/payments/PaymentMatcher.tsx` is for bank-reconcile (incoming credit matching). The per-instalment Mark-Paid flow is separate. Confirmed by grep: 6 .tsx files contain `name="amount"` for a payment form; the batch form has `bankAmount` + `tdsAmount` fields; the per-instalment form does not.

---

## Summary table for Anish's scoping

| Finding | Severity | Affected scope | Fix complexity |
|---|---|---|---|
| 1. Null productSelection on all 183 MOUs (Cretile dispatch SKU dropdown empty) | Pranav-blocking for dispatch only | 9 Cretile-dispatched MOUs (b1), ~150 STEAM MOUs with no dispatch yet, 29 YP MOUs | LOW for backfill script (infer from dispatch.lineItems.skuName); HIGH if the answer is "fix every importer pipeline" |
| 2. PI form `installmentSeq` vs API `instalmentSeq` typo | Pranav-blocking on EVERY MOU's PI form, not just Cretile | 100 % of MOU PI generations attempted via the page form | TRIVIAL: one-char edit + a test |
| 3. `outputFileTracingIncludes` covers 2 of 7 template-loading routes | Latent regression; surfaces as "Multi error" toasts for non-MOU-wizard template downloads (dispatch-note, handover, delivery-ack, Finance PI download). YP wizard MAY or MAY NOT be affected depending on which screenshot Pranav meant | All template downloads except `/api/pi/generate` and `/api/mou/generate-docx` | LOW: 5 extra entries in `next.config.mjs` + a smoke diagnostic to confirm the YP toast root cause |
| 4. Single-instalment Mark-Paid form has no Bank/TDS split | Pranav-blocking for accurate TDS posting on single payments | Per-instalment Mark-Paid flow only; batch form already has it | MEDIUM: form rewrite + matching test |

## Recommended scope decisions for Anish

1. Findings 2 + 3 are clear shippable fixes; their root causes are mechanical and the fix is small.
2. Finding 4 is a UX gap with a known reference implementation (the batch form). Mirror that.
3. Finding 1 is the most consequential — and most expensive — to handle. **My recommendation:** ship the backfill script (option A) only for the 9 MOUs with Cretile dispatches, inferring productSelection from the dispatch `lineItems.skuName`. Leave the other 174 MOUs with null productSelection because they have no dispatch evidence to infer from; the wizard / kits-details page sets it correctly for any new MOU Pranav creates manually. Importers can be fixed in a separate Phase 6F pass once we agree the Excel source carries a product column to map from.

Awaiting `GO` (with any scope adjustments) before writing fixes for Parts 3, 4, 5.
