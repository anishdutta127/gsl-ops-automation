# Gate: VEX dispatch delivery confirmation + PI roll-up + tax-invoice restore

Date: 2026-06-26. Branch: main. Trigger: Pranav, on a real VEX PI (MTPL/UP/26-27/0030,
Fountainhead Wockhardt Global School).

## The two gaps

1. **No way to confirm DELIVERY.** A VEX dispatch advanced `Requested -> Request Raised to
   Warehouse -> Invoiced -> Shipped` and dead-ended at Shipped. There was no "Delivered" step, and
   the PI-level status sat at "Delivery Pending" forever. The PI roll-up was the thing Pranav noticed
   not updating.
2. **Tax invoice upload missing.** The dispatch showed "awaiting upload" under Tax invoice with no
   way to record one.

## Diagnosis (brief step 1)

- **Gap 2 is a REGRESSION (migration regression), not never-built.** The capability lived in
  `gsl-mou-system` at `src/app/api/vex/dispatch/tax-invoice/route.ts` (a binary PDF upload via
  `putBinaryFile`, committing to `public/tax-invoices/<id>.pdf` and flipping the dispatch to
  Invoiced). The gsl-ops-automation rebuild ported only the read side: the `VexDispatch`
  `taxInvoiceNumber`/`taxInvoicePath` fields plus the read-only "awaiting upload" display.
  `DispatchRowActions.tsx` even carried the comment *"Upload UI lives on gsl-mou-system today; Ops
  adds it in Phase 1.1 (deferred)."* So half of it (schema + display) was already here; only the
  write/upload action was missing. **We restored the capability** rather than building new.
- **Storage decision (owner-confirmed): paste a Drive/SharePoint link, not a binary upload.** The
  old binary path needs `putBinaryFile` (never ported to this repo) and would commit a PDF per
  upload + trigger a Vercel redeploy. The repo's own POD/challan upload routes write to `public/`
  via `fs.writeFile`, which is EROFS-broken on Vercel (read-only filesystem outside `/tmp`, per
  `docs/hotfix-pranav-apply/ROOT_CAUSE.md`). The paste-a-URL idiom (the same one
  `acknowledgeDispatch` uses for the signed handover form) reflects LIVE instantly and is the repo's
  working file-handling pattern.

## State model (owner-confirmed)

**Dispatch lifecycle** (`VexDispatchStatusV3`): `Requested -> Request Raised to Warehouse ->
Invoiced -> Shipped -> Delivered`.
- "Shipped" keeps its meaning (out for delivery / delivery pending). "Delivered" is the new
  confirmed state: captures `deliveredAt` + `deliveredBy`, audited (`status_change`), forward-only,
  gated to **Ops** (`canRaiseDispatch`) per "Ops owns the final shipped status".

**PI roll-up** (`rollUpVexPiStatus`, pure helper): on every dispatch transition, recompute the PI:
- `Completed` only when **every ordered line-item qty is dispatched AND every dispatch is
  Delivered** (never marks a PI done while goods remain unshipped).
- `Partially Dispatched` when some delivery has happened but the PI is not fully delivered.
- Otherwise no change (e.g. dispatches only Shipped -> PI stays "Delivery Pending").
- Forward-only: never rewinds a status Finance set by hand; idempotent on re-run.

**Tax invoice** (Finance, `canEditFinanceData`): records `taxInvoiceNumber` + `taxInvoicePath`
(Drive/SharePoint URL) and advances the dispatch to `Invoiced` unless it is already further along
(no rewind past Shipped/Delivered). Audited (`tax-invoice-recorded`).

## Permission + audit + LIVE

- Delivered: Ops-gated; tax invoice: Finance-gated; both fail loud on write failure. The PI roll-up
  fails loud too (returns 500 `pi-rollup-failed` with an accurate "dispatch saved, roll-up failed,
  retry" message rather than silently dropping the PI update).
- Every action appends an `AuditEntry` (dispatch `status_change` / `tax-invoice-recorded`; PI
  `status_change` with a roll-up note).
- Reflects LIVE: the PI roll-up enqueues via the same `enqueueUpdate({entity:'vexPi',
  operation:'update'})` path the existing live PI transition uses (wired in
  `dispatchToRepo` at `src/lib/pendingUpdates.ts:214`), and `vexDispatchRepo.updateWithAudit` writes
  to postgres directly. No Sync step.

## Verification

### Automated (green)

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors (1 pre-existing warning in GeneratorWizard.tsx, unrelated).
- `npm run docs-lint`: passed (only pre-existing AI-slop WARNs; no em-dash, no American spelling in
  the new files).
- `npm run audit:routes`: broken=0.
- `npm test` (full vitest): **3383 passed / 82 skipped** (was 3366/82 before; +17 new).
- `npm run build` (next build): exit 0, compiled successfully, 170 static pages generated.

New tests (17):
- `src/lib/mouSystem/vexPiRollup.test.ts` (8): the roll-up rule, incl. the confirmed guards
  (Completed needs full qty + all delivered; partial -> Partially Dispatched; forward-only; never
  Completed with undispatched items).
- `.../dispatch/[dispatchId]/transition/route.rollup.test.ts` (4): Delivered stamps who/when + rolls
  PI to Completed; Shipped does not roll up; partial delivery -> Partially Dispatched; backward
  transition rejected.
- `.../dispatch/[dispatchId]/tax-invoice/route.test.ts` (5): records invoice + advances to Invoiced;
  no rewind past Shipped; rejects missing number / invalid link; 403s a non-Finance user.

### Prod (V4) walk: BLOCKED, with the exact unblock

The full prod walk (dispatch -> Shipped -> Delivered -> PI status updates -> tax invoice) requires
**migration 019 applied to prod first** (`scripts/migrations/019-vex-dispatch-delivered.sql` adds
`vex_dispatches.delivered_at` + `delivered_by`). Marking Delivered against prod before that would
fail on the missing columns. Per the established gated-prod-migration pattern (014/017/018), this
migration is **NOT YET APPLIED** and needs owner authorisation (backup-first, reversible via
`019-...down.sql`).

Apply (owner-authorised):

```
node scripts/apply-migration.mjs 019-vex-dispatch-delivered.sql   # confirm the exact runner args first
```

After the migration is live, walk on a throwaway VEX PI (mirroring the gate-phase3 / gate-sku-fix
pattern: create a tiny test PI, log a token payment to unlock dispatch, raise a dispatch, mark
Shipped, mark Delivered, confirm the PI flips to Completed, record a tax-invoice link, then clean up
the test PI). VERIFY_PASSWORD (owner-held, not stored) is needed for the Playwright live walk.

Residual risk until the prod walk runs: the persist path is the same one the existing live PI
transition + dispatch transition already use, and the postgres column additions are the only new
surface; the tax-invoice path touches only pre-existing columns. The roll-up + Delivered logic is
covered by the unit/integration tests above.
