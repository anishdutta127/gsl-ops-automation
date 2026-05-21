# Template-loading route audit (Phase 6E Finding 3)

Every API route that reads a `.docx` from `public/` at runtime needs an entry in `next.config.mjs:experimental.outputFileTracingIncludes` so Vercel bundles the asset alongside the serverless function. Missing entries surface as `ENOENT` → `template-missing` toast in production (file is present in the repo but not in the deployed bundle).

## Pre-sweep state (Phase 6A residue)

`next.config.mjs:15-20` carried only 2 entries:

```js
experimental.outputFileTracingIncludes: {
  '/api/pi/generate':       ['./public/ops-templates/**/*'],
  '/api/mou/generate-docx': ['./public/mou-templates/**/*'],
}
```

## Audit: every route that loads a template

| Route | Asset path | Loader code path | Pre-sweep include status |
|---|---|---|---|
| `/api/pi/generate` | `public/ops-templates/pi-template.docx` | `src/lib/pi/generatePi.ts:124` (`readFile` via `defaultLoadTemplate`) | PRESENT |
| `/api/mou/generate-docx` | `public/mou-templates/{STEAM,YP,HBPE}-v2.1.docx` | `src/app/api/mou/generate-docx/route.ts:124` (`readFile`) | PRESENT |
| `/api/dispatch/[id]/dispatch-note` | `public/ops-templates/dispatch-template.docx` | `src/app/api/dispatch/[id]/dispatch-note/route.ts:56` (`readFile`) | **MISSING** |
| `/api/dispatch/[id]/handover-worksheet` | `public/ops-templates/handover-template.docx` | calls `generateHandoverWorksheet` in `src/lib/dispatch/generateHandoverWorksheet.ts`, which `readFile`s `handoverTemplates.HANDOVER_TEMPLATE.file` | **MISSING** |
| `/api/dispatch/generate` | `public/ops-templates/dispatch-template.docx` | calls `raiseDispatch` in `src/lib/dispatch/raiseDispatch.ts`, which uses `DISPATCH_TEMPLATE.file` via `readFile` | **MISSING** |
| `/api/delivery-ack/template` | `public/ops-templates/delivery-ack-template.docx` | calls `generateDeliveryAck` in `src/lib/deliveryAck/generateDeliveryAck.ts`, which uses `DELIVERY_ACK_TEMPLATE.file` via `readFile` | **MISSING** |
| `/api/finance/pi/[paymentId]/download` | `public/ops-templates/pi-template.docx` | calls `renderPi` in `src/lib/pi/generatePi.ts:320` which `readFile`s `PI_TEMPLATE.file` | **MISSING** |

## Post-sweep `next.config.mjs`

```js
experimental.outputFileTracingIncludes: {
  '/api/pi/generate':                            ['./public/ops-templates/**/*'],
  '/api/mou/generate-docx':                      ['./public/mou-templates/**/*'],
  '/api/dispatch/[id]/dispatch-note':            ['./public/ops-templates/**/*'],
  '/api/dispatch/[id]/handover-worksheet':       ['./public/ops-templates/**/*'],
  '/api/dispatch/generate':                      ['./public/ops-templates/**/*'],
  '/api/delivery-ack/template':                  ['./public/ops-templates/**/*'],
  '/api/finance/pi/[paymentId]/download':        ['./public/ops-templates/**/*'],
  // Diagnostic smoke route added during Phase 6E Finding 3 to confirm
  // the YP-v2.1.docx is bundled correctly. Removed after verification.
  '/api/admin/template-smoke':                   ['./public/mou-templates/**/*', './public/ops-templates/**/*'],
}
```

The trailing diagnostic entry is removed once the smoke route confirms the YP wizard toast root cause; see Phase 6E final report for the verification result.

## Notes

- The wildcard `./public/ops-templates/**/*` is what every ops-template entry needs; the wizard's mou-templates entry stays scoped to `./public/mou-templates/**/*` because no ops route reads from there.
- Next 14.2.x silent-strips `outputFileTracingIncludes` when placed at the top level; it MUST be nested under `experimental`. Existing config already did this; the sweep adds entries inside the same `experimental` block.
