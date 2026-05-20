# Salesperson reassignment audit

**Gate:** Phase 2 quick wins (2026-05-19).
**Trigger:** Pranav review item #6: "How Can I Change the Salesperson
for an existing school?"

## Schema state today

| Entity | Sales-rep field | Notes |
|---|---|---|
| `MOU` (`src/lib/types.ts:504`) | `salesPersonId: string \| null` | Per-MOU snapshot of the rep at creation time. Sales picks it on the wizard; the wizard defaults to `''` (empty). |
| `School` (`src/lib/types.ts:372`) | **none** | No sales-rep field. Schools today learn their "current rep" only via the MOU history. |
| `SalesOpportunity` (`src/lib/types.ts:680`) | `salesRepId: string` | Pre-MOU pipeline; separate from MOU lifecycle. Out of scope. |

The brief asked us to confirm where reassignment makes sense. **Decision: keep the change derivation-only on School (audit log).** A new `School.currentSalesPersonId` field would be cleanest, but every existing MOU and the wizard already work without it; adding the field forces a migration, a wizard rewrite, and a longer test pass than this gate allows.

## "Current sales rep" derivation

```
getCurrentSalesRepForSchool(school, schoolMous):
  1. Walk school.auditLog newest-first; if any entry has
     action === 'sales-rep-reassigned', return entry.after.salesPersonId.
  2. Otherwise pick the most-recent MOU at this school (by createdAt /
     id descending) and return its salesPersonId.
  3. If neither exists, return null (no rep on file).
```

The audit-log entry written by the reassignment flow is the durable record. Existing MOUs do not need to carry a backfill; they retain their historical rep, which is the brief's preference.

## Reassignment scope decision matrix

The brief named two scopes. Mapped to this codebase:

| Scope | What changes | Who keeps original rep |
|---|---|---|
| **Future-only** (default) | School.auditLog gets `sales-rep-reassigned` entry. Existing MOUs untouched. The next MOU draft against this school sees the new rep as "current". | All existing MOUs at this school. |
| **All MOUs at this school** | School.auditLog gets `sales-rep-reassigned`. Every existing MOU at this school gets its `salesPersonId` rewritten + a `sales-rep-reassigned` audit entry of its own. | None. Historical signal is preserved only in the audit log per MOU. |

Future-only is the default in the UI. The "all MOUs" button is the destructive one.

## Permissions

The brief said "canEditMOU OR canEditFinanceData". The matched action grant is `'mou:assign-sales-rep'`, which both Sales and Finance carry. Admin has the wildcard. Department-scoped Admins (Misba MM2 case): `canEditMOU` or `canEditFinanceData` returning true unblocks them in testing mode and gates them in production lockdown, which is the same posture Pranav has on the rest of his lifecycle work.

## Permissions: practical wiring

`reassignSalesRep` will call `canPerform(user, 'mou:assign-sales-rep')` at Layer 2 (defence in depth). The CTA on the school detail page is gated by `canEditMOU(user) || canEditFinanceData(user)` at Layer 1 so users who would 403 do not see the button. Both layers agree on the same set of users.

## In-scope changes

1. New helper `src/lib/schools/currentSalesRep.ts`: derivation function + unit tests.
2. New library `src/lib/schools/reassignSalesRep.ts`: write path; enqueues School + optional MOU updates.
3. New form page `src/app/schools/[schoolId]/reassign-sales-rep/page.tsx`.
4. New API route `src/app/api/schools/[schoolId]/reassign-sales-rep/route.ts`.
5. `src/app/schools/[schoolId]/page.tsx` header card: show "Sales rep" + "Reassign" button.

## Explicitly out of scope (follow-up tracked separately)

| Item | Why deferred |
|---|---|
| Wizard pre-fill from `getCurrentSalesRepForSchool` | The wizard's school selector + sales-rep dropdown are decoupled today. Wiring the helper requires a state-change handler + a regression pass on the draft / save / generate paths. Quick-win scope keeps the helper available; wizard wiring is a one-day follow-up after Pranav confirms the reassignment flow lands as intended. |
| Notifications to incoming + outgoing reps | Requires a new `NotificationKind` ('sales-rep-reassigned'), a payload validator in `notifications/payload_contracts.ts`, and wiring at the call site. Audit log captures the change for now. |
| "Apply from" effective date | Defaulted to "immediately" (the reassignment timestamp). A future-dated effective date would need a scheduled job; not in this gate. |
| Toast on the school page after success | The reassign API redirects to `/schools/[id]?notice=sales-rep-reassigned`; the existing NOTICE_COPY map renders the toast. (Confirmed in scope; this is part of item 5.) |
| Bulk reassign across multiple schools | Pranav asked about one school. Per-school flow is the right interaction; bulk is a different design. |

## Tests

- `src/lib/schools/currentSalesRep.test.ts`: derivation for: empty audit, single reassignment, multiple reassignments (latest wins), no MOUs at school + no audit (null), audit + MOUs (audit wins), no audit + multiple MOUs (most-recent MOU wins).
- `src/lib/schools/reassignSalesRep.test.ts`: happy path future-only, happy path all-mous, permission denied, unknown school, unknown new rep, no-op when new rep equals current.
- `src/app/api/schools/[schoolId]/reassign-sales-rep/route.test.ts`: 303 redirect with notice param on success, 303 with error param on failure.

## Decision summary

Reassignment lives at SCHOOL level (audit-only state). Two scopes: future-only (default) and all-MOUs. Notifications + wizard pre-fill are explicit follow-ups. Existing MOUs' historical rep is preserved in audit logs.
