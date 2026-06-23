# gate-add-admin (Phase 0.1): full-access admin Shubhangi

_Date: 2026-06-24._

## Record (id `ujaccounts`)
- **id:** `ujaccounts` (matches the pre-existing prod row; see "prod" below). Seed
  records in users.json + _fixtures were reconciled from `shubhangi.uj` to
  `ujaccounts` so the seed cannot collide with prod on the unique email.
- **name:** `Shubhangi` (spelling confirmed against the existing `shubhangi.g`
  record = "Shubhangi G."; the SSO record shows her fuller name "Shubhangi
  Gajakosh"). Distinct from the department-scoped finance account `shubhangi.g`.
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

## Prod creation: RESOLVED (owner-authorised)
She already had a **pending SSO-auto-provisioned** prod row (`ujaccounts`): role
`OpsEmployee`, **active=false**, **no password**, `requires_admin_review=true` (an
Azure SSO sign-in had created it awaiting admin review). So the insert was a no-op
(unique email). Per the owner's authorisation, I **promoted** that row instead of
inserting a duplicate: `role='Admin'`, `department=NULL`, `active=true`,
`requires_admin_review=false`, `password_hash` set, `name='Shubhangi'`, plus a
`user-role-changed` audit entry. She can also still sign in via Azure SSO.

## Verification (V4)
| What | How | Result |
|---|---|---|
| Wildcard access under PRODUCTION LOCKDOWN (TESTING_OPEN_ACCESS=false) | `src/lib/access.shubhangi-admin.test.ts` | PASS - passes canAccessSales/Ops/Finance, canGeneratePI, canEditFinanceData, canRaiseDispatch, canApproveDispatch, canEditSchoolMaster, canManageInventory, canEditMOU, canManageEscalations, canManageUsers, canViewAllAuditLogs |
| Record shape matches the wildcard admins | same test | PASS |
| Initial password verifies against the stored hash | `bcrypt.compare` | PASS (true) |
| **Live prod login** (email + initial password) | Playwright `POST /api/login` | PASS (HTTP 303, session cookie set) |
| **Live reach: sales** | `/sales-pipeline`, `/schools` | PASS (HTTP 200, no login bounce) |
| **Live reach: ops** | `/dashboard/ops`, `/operations/vex` | PASS (HTTP 200) |
| **Live reach: finance** | `/dashboard/finance`, `/finance/payments` | PASS (HTTP 200) |

Screenshots in `.verification/uj/` (gitignored). She logs in on the live site and
reaches every department's surfaces. No residual: 0.1 is fully done in prod.
