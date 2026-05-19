# Hotfix: Pranav cannot see "New MOU" button

**Date:** 2026-05-19
**Reporter:** Pranav B. (Finance lead, test user)
**Owner:** Anish

## Symptom

Pranav opens `/mous` during the round-2 testing window. The "+ New MOU" button does not render. Anish (Admin role, `department: null`) sees the button on the same page.

## Diagnosis

### 1. Pranav's user record

`src/data/users.json` (the `pranav.b` entry):

- `role`: `"Admin"` (promoted 2026-04-29 from `"Finance"` per role-decisions.md trusted-core-team pattern)
- `department`: `"finance"`
- `active`: `true`

The record is correct per the Gate 1 Step 2 department-scoped Admin pattern: Pranav is the trusted Finance lead, so his role lifts the cc-rule / audit-route / dispatch-request scoping, but his department keeps the Misba MM2 style write-side scoping on PI generation. This is by design and is not the bug.

### 2. Button gating on `/mous`

`src/app/mous/page.tsx:253` renders the "+ New MOU" link conditionally:

```tsx
{user && canEditMOU(user) ? (
  <Link href="/mous/new" ...>+ New MOU</Link>
) : null}
```

`/mous/new/page.tsx:29` mirrors the same gate with `notFound()` for users that fail `canEditMOU`. Same logic, same outcome.

### 3. `canEditMOU` logic in `access.ts`

`src/lib/access.ts:166`:

```ts
export function canEditMOU(user: User): boolean {
  return editGate(user, ['sales'])
}
```

`editGate` (line 147):

```ts
function editGate(
  user: User,
  allowedDepartments: Array<Exclude<Department, null>>,
): boolean {
  if (!activeOrFalse(user)) return false
  const dept = getDepartment(user)
  if (user.role === 'Admin' && dept === null) return true
  return dept !== null && allowedDepartments.includes(dept)
}
```

Pranav: `role: 'Admin'`, `department: 'finance'`.
- `activeOrFalse(user)`: true.
- `user.role === 'Admin' && dept === null`: false (department is `'finance'`).
- `allowedDepartments.includes('finance')` where `allowedDepartments = ['sales']`: false.
- Returns false.

So the button is hidden, by design, under the current `editGate` semantics: a department-scoped Admin only edits within their own department.

## Why this is wrong now

Anish's standing direction for the testing window: every test user should behave like Admin for both VIEW and EDIT until cutover. The current implementation honours `TESTING_OPEN_ACCESS=true` only on VIEW gates; EDIT gates stay department-scoped. That mismatch is the bug.

The original rationale (in `access.ts` jsdoc) was: "EDIT gates stay strict because role / department correctness is what the pilot is actually testing for". That rationale loses to pilot reality: testers like Pranav, Misba, Shubhangi and Anita need to walk every flow end-to-end to internalise the system. A department-scoped Admin who cannot click "New MOU" cannot dogfood the MOU flow.

The Misba MM2 acceptance criterion (Ops user must not generate a PI) is a production-mode invariant; in production, `TESTING_OPEN_ACCESS=false` will re-enable strict EDIT gating and Misba's PI button will hide as designed.

## Fix

`editGate` should honour `isTestingOpenAccess()` exactly like `viewGate` does: when testing mode is on, return true for any active user. The two-layer access model in CLAUDE.md still holds: Layer 2 (`canPerform` in `permissions.ts`) is the server-side defence in depth and stays in force. All current test users carry `role: 'Admin'` which already passes the Layer-2 ADMIN_WILDCARD, so the testing-window writes succeed.

Production lockdown stays a one-line env flip: `TESTING_OPEN_ACCESS=false`. The strict semantics return at every gate.

## Sweep

After the fix, every test user in `src/data/users.json` (Anish, Ameet, Pratik, Vishwanath, Misba, Pradeep, Swati, Shubhangi, Pranav, Shashank, Gowri, Anita, Ajith) reaches every Phase-1 surface during the testing window:

- `/mous/new`: gated on `canEditMOU` → opens in testing mode.
- `/finance/payments` edit affordances: gated on `canEditFinanceData` → opens in testing mode.
- `/dispatch/request` raise + `/admin/dispatch-requests` review: gated on `canRaiseDispatch` / `canPerform('dispatch-request:create')` → both layers open for Admin testers.
- `/admin/*` surfaces: gated on `canManageUsers` / `canManageEscalations` / `canViewAllAuditLogs`; all already pass for `role: 'Admin'`.

UI labels in the user picker still read "Pranav (Finance)" because labels are derived from `department`, not from the gate result. Identity stays correct; permissions open.
