# Hotfix: /mous/new client-side exception

**Date:** 2026-05-19
**Reporter:** Pranav B.
**Owner:** Anish

## Symptom

Pranav, logged in as Admin role / Finance department, sees "Application error: a client-side exception has occurred" on a white screen at `/mous/new` (or shortly after clicking a template card and landing on `/mous/new/STEAM-v3`).

Reported just after the earlier hotfix that unblocked his canEditMOU gate; once he could finally reach the wizard, it crashed.

## Reproduction

```
# Local prod build, logged in as Pranav
GET /mous/new/STEAM-v3       -> HTTP 500
```

Server log:

```
TypeError: Cannot read properties of undefined (reading 'length')
    at .next/server/app/mous/new/[templateId]/page.js:1:8706
    at Array.filter
  digest: '888500126'
```

## Root cause

`GeneratorWizard.tsx:514`:

```ts
const programmeSalesTeam = salesTeam.filter(
  (sp) => sp.programmes.length === 0 || sp.programmes.some((p) => p === template.programme),
)
```

`sp.programmes` is `undefined` for two SalesPerson records in `src/data/sales_team.json`:

- `sp-brij-singh`
- `sp-kranthi`

Both were "Auto-created from Pranav refresh pranav-refresh-2026-05-13" by `upsertSalesRep` in `src/lib/imports/pranavApply.ts`. That helper builds new records without the `programmes` field, which violates the canonical `SalesPerson` type. The wizard read those partial records and crashed.

Browser sees a 500 RSC payload and surfaces the generic Next.js "client-side exception" message because no `error.tsx` was mounted anywhere in the app.

## Fix

Three commits' worth of work, bundled in one for hotfix speed:

1. **Code resilience** (`src/components/mou-system/GeneratorWizard.tsx`): treat a missing or empty `programmes` list as "rep covers every programme". This matches the existing semantics for an explicitly-empty list and absorbs partial records gracefully.
2. **Data backfill** (`src/data/sales_team.json`): the two broken records get `programmes: []` so production matches the canonical shape.
3. **Schema fix** (`src/lib/imports/pranavApply.ts`): `upsertSalesRep` now sets `programmes: []` on every auto-create, and the loose `salesTeam` type in the apply-input declares the optional field.
4. **Error boundary** (`src/app/global-error.tsx`, `src/app/mous/new/error.tsx`): graceful fallback shows the error digest, a Refresh button, and a return link. Next future hydration / SSR error surfaces an actual diagnostic instead of a white screen.

## Sweep

`canEditMOU` is the gate; the only fragile-array filter pattern in MOU drafting was the one above. The pranavApply upsertSchool variant uses `auditLog ?? []` for the same shape of missing-field defence already. No other `/new` wizard ingests SalesPerson records in this way.

## Verification

```
LOGIN HTTP 200
WIZARD HTTP 200, size 120152
3 Effective date markers, 0 Application error markers
```

Production verification post-deploy: `https://gsl-ops-automation.vercel.app/mous/new/STEAM-v3` renders the wizard form for any user that passes `canEditMOU`. The error boundary covers any future regression at this segment without a white screen.
