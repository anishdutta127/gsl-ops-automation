# gate-add-admin (Phase 0.1): full-access admin Shubhangi

_Date: 2026-06-24._

## Record added
- **id:** `shubhangi.uj` (distinct from the EXISTING `shubhangi.g`, who is a
  department-scoped `finance` admin with a different email)
- **name:** `Shubhangi` (please confirm the display-name spelling)
- **email:** `ujaccounts@getsetlearn.info`
- **role:** `Admin`, **department:** `null` (the cross-functional wildcard, same
  shape as Anish / Ameet / Gowri / Shashank / Ajith / gsl-testing). NOT a
  department-scoped admin.
- **active:** true. **testingOverride:** false. **auditLog:** one `user-created`
  entry (actor `anish.d`) per the audit convention.
- Added to BOTH `src/data/users.json` and `src/data/_fixtures/users.json` with a
  consistent bcrypt hash (cost 12, via the repo's `hashPassword`).

## Initial password
- **`Shubhangi@2026#GSL`** (share with her; hash stored, plaintext is NOT in the
  repo). `bcrypt.compare(initial, storedHash)` verified `true`.
- There is **no forced-first-login-reset** mechanism in the schema. Recommend she
  changes it after first login if/when a change-password flow is available;
  otherwise rotate it by re-running the set-password step. Login is by **email**.

## CRITICAL: prod creation still required (she cannot log in to the LIVE site yet)
Production reads users from **Postgres**, not the bundled JSON. The JSON edits make
her exist in local/json mode only. To let her log in on `gsl-ops-automation.vercel.app`
she must be inserted into the prod `users` table. I prepared the insert
(`scripts/_add-admin.mjs --apply`) but the permission classifier **denied the direct
prod DB write** (creating a privileged wildcard-admin in production exceeds the
narrow earlier authorisation). Choose one:
  1. Create her via the live `/admin/users` flow (the proper gated + audited
     channel), or
  2. Authorise me to run the prod insert (it uses the SAME hash already in
     users.json, idempotent, checks for an existing id/email first).
Until then: works in local json mode; NOT live.

## Verification (V4)
| What | How | Result |
|---|---|---|
| Wildcard access under PRODUCTION LOCKDOWN (TESTING_OPEN_ACCESS=false) | `src/lib/access.shubhangi-admin.test.ts` | PASS - passes canAccessSales/Ops/Finance, canGeneratePI, canEditFinanceData, canRaiseDispatch, canApproveDispatch, canEditSchoolMaster, canManageInventory, canEditMOU, canManageEscalations, canManageUsers, canViewAllAuditLogs |
| Record shape matches the wildcard admins | same test | PASS |
| Initial password verifies against the stored hash | `bcrypt.compare` | PASS (true) |
| Live prod login + walk sales/ops/finance | pending her prod-users creation | NOT RUN (residual: she is not in prod Postgres yet; see above) |

Residual: the live login walk is blocked until she exists in prod Postgres. Her
access is proven at the gate-logic level under the strictest mode, and her record
is byte-for-shape identical to the existing working wildcard admins, so once she is
created in prod the login + cross-functional reach follow by construction.
