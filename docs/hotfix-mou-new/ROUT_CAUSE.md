# /mous/new 404: root cause

## Symptom

Pranav (gslclaude testing as `pranav.b@getsetlearn.info`) clicked the "+ New MOU" CTA on `/mous` and landed on the Next.js 404 page.

## Possibility check

The audit-style triage in the brief offered four routes-don't-render patterns:

1. Page exists at a different path. **Not the case.** `src/app/mous/new/page.tsx` exists and the CTA points at `/mous/new`. The paths match.
2. Route was renamed and CTAs still point to old URL. **Not the case.** Same as above.
3. Route never built. **Not the case.** Page file exists and renders for Anish (Admin + null department) in local dev.
4. Build excluded it. **Not the case.** The route appears in the deployed bundle.

The static "does a page file exist at the path" check the brief described would *not* flag this; the file exists. The bug is a different class: the page calls `notFound()` for users who fail an access gate, and the CTA that points at the page is rendered without that same gate.

## Actual root cause

Pranav's user record (`src/data/users.json:135-141`):

```json
{
  "id": "pranav.b",
  "role": "Admin",
  "department": "finance",
  ...
}
```

`/mous/new` page guard (`src/app/mous/new/page.tsx:29-31`):

```ts
const user = await getCurrentUser()
if (!user || !canEditMOU(user)) {
  notFound()
}
```

`canEditMOU` definition (`src/lib/access.ts:166-168`):

```ts
export function canEditMOU(user: User): boolean {
  return editGate(user, ['sales'])
}
```

`editGate` (`src/lib/access.ts:147-161`) returns true for Sales department OR Admin-with-null-department. Pranav is Admin + department=`'finance'`, so he hits the department-scoped branch and `'finance'` is not in `['sales']`. The gate returns false, the page calls `notFound()`, and Next.js renders the 404.

This is the documented behaviour: per CLAUDE.md, "Admin role + `department: 'finance'` means trusted Finance user with MOU drafting gates still enforced." Pranav is not supposed to draft MOUs; the Misba-MM2 pattern applies symmetrically across departments.

The bug is **not** the gate. The bug is that the "+ New MOU" CTAs are rendered without the same gate, so users who cannot draft MOUs still see the button. Clicking it produces a misleading 404 instead of either (a) no button at all or (b) a clear access-denied surface.

## Ungated CTAs found

Five `/mous/new` CTAs across the app:

| Source | File | Notes |
|---|---|---|
| MOUs list header | `src/app/mous/page.tsx:250-257` | Pranav's path. Always rendered. |
| School detail "+ Draft new MOU" | `src/app/schools/[schoolId]/page.tsx:386-392` | Always rendered. |
| Consolidated landing Quick action | `src/components/dashboard/ConsolidatedLanding.tsx:474-480` | Always rendered (whole `QUICK_ACTIONS` list is unconditional). |
| Sales dashboard primary action | `src/app/dashboard/sales/page.tsx:27-31` | Sales-only surface; gate is implicit at the page level. Not a leak. |
| Sales dashboard inline link | `src/app/dashboard/sales/page.tsx:64-67` | Same surface; implicit gate. Not a leak. |

## Fix direction

Surgical: wrap each leaking CTA in a `canEditMOU(user)` gate. Pranav's button disappears for him; Sales users see it as before; Anish (Admin + null dept) sees it as before; the page's existing `notFound()` guard stays untouched as defence in depth.

Out of scope for this hotfix: revisiting whether Pranav should be permitted to draft MOUs. That is an access-policy decision; CLAUDE.md is currently explicit that he should not.

## Why MOU_SYSTEM_PARITY_AUDIT.md missed this

The parity audit checked that the route file and template registry were ported (both true). It did not check that CTAs pointing at the route share the same access gate as the route itself. The route-audit script in Step 3 of this hotfix is a static structural check (does the path exist?) and would also miss this class. The mitigation for *this* class is to gate CTAs at the same level as the page guard, which Step 2 does. A future enhancement could grep for `notFound()` in page files and cross-reference CTAs pointing at them, but that is a more invasive lint than this hotfix scope allows.
