# Phase 6G auth audit + library decision (Phase 6G Part 1)

Ameet wants "Continue with Microsoft" on the login page so Mafatlal staff can sign in with their existing Entra ID. This document inventories the current auth surface, evaluates NextAuth.js (Auth.js v5) vs custom MSAL, and recommends a path. No code changes yet.

---

## 1. Current authentication surface

### 1.1 Files + libraries in play

| File | Purpose | Library |
|---|---|---|
| `src/lib/crypto/jwt.ts` | Issue + verify the staff session JWT. HS256, 7-day TTL, issuer `gsl-ops-automation`, audience `staff`. | `jose` |
| `src/lib/crypto/password.ts` | Hash + verify passwords. bcrypt cost 12. | `bcryptjs` |
| `src/lib/auth/login.ts` | `authenticateLogin({ email, password })`. Looks up `users.json`, verifies hash, returns `{ ok, user }`. | bcryptjs |
| `src/lib/auth/session.ts` | `getCurrentSession()` + `getCurrentUser()`. Reads cookie, verifies JWT, returns the User from `users.json`. | jose |
| `src/lib/auth/permissions.ts` | Action-level `canPerform(user, action)` server-side defence in depth. | (pure code) |
| `src/lib/access.ts` | Department-level VIEW + EDIT gates. Single source of truth for department-aware gating. | (pure code) |
| `src/middleware.ts` | Route guard. Lets through 6 public paths + 2 prefixes; everything else requires a valid session cookie. Implements sliding refresh (re-sign once per day of activity). | jose via verifySessionToken |
| `src/app/api/login/route.ts` | POST handler for `/login`. Form data → `authenticateLogin` → `issueSessionToken` → sets `gsl_ops_session` cookie → 303-redirects. | jose + bcryptjs |
| `src/app/api/logout/route.ts` | Clears the cookie + redirects. | (cookie API) |
| `src/app/login/page.tsx` | The login form. Single email + password + next-redirect-target form. | (server component) |
| `src/data/users.json` | Source of truth for User records. 13 production users, all `role: 'Admin'` post 2026-04-27 promotion. Field `department` ('sales' / 'ops' / 'finance' / null) drives workflow gating. | (JSON file) |

### 1.2 Session storage + cookie/JWT pattern

- Cookie name: `gsl_ops_session`
- Cookie attributes: `httpOnly: true`, `secure: production`, `sameSite: 'strict'`, `path: '/'`, `maxAge: 7 days`
- Token type: JWT signed with HS256
- Token claims: `sub` (user.id), `email`, `name`, `role`, `iat`, `exp`, issuer, audience
- Secret: `GSL_JWT_SECRET` env var. 32-byte hex. Set in Vercel env, sourced from 1Password "GSL Ops JWT Secret".
- Refresh: middleware re-issues the token if more than 1 day has passed since `iat`. Active users keep a rolling 7-day session.
- Verification: `verifySessionToken(token)` in `jose`. Validates issuer + audience + signature + expiry.

### 1.3 User identity

- **No external IdP today.** Every user is in `src/data/users.json` with a bcrypt-hashed password.
- The shape of `User` (from `src/lib/types.ts`):
  - `id` (e.g. `pratik.d`, `misba.m`)
  - `name`, `email`, `role` (`Admin` for everyone in production today)
  - `department` (`sales` | `ops` | `finance` | `null` for cross-functional)
  - `active` boolean
  - `passwordHash` (bcrypt)
  - `auditLog[]` per the canonical AuditEntry shape
- No `azureAdObjectId` field today. SSO will need to either match by `email` or extend the User type.
- 13 users active in production; new users today are added by editing `users.json` and pushing through the GitHub Contents API queue.

### 1.4 Permission model (relevant for SSO)

- **Layer 1** (`src/lib/access.ts`): department-level VIEW + EDIT gates. `Admin` + `department: null` is the wildcard.
- **Layer 2** (`src/lib/auth/permissions.ts`): action-level `canPerform`. Server-side defence in depth.
- New SSO users will need `role` + `department` assigned. Default per the brief: `role: 'User'` (a new value) + `department: null` + `requiresAdminReview: true`. Neither `'User'` nor `requiresAdminReview` exist on the type today; the SSO landing has to extend it.

### 1.5 What's NOT in place

- No NextAuth, no Auth.js, no @auth/core. Zero OAuth providers wired.
- No callback URL plumbing for any external IdP.
- No CSRF token store (NextAuth would manage this; today's username/password flow doesn't need one because the form submits to the same origin via cookie auth).
- No `User.azureAdObjectId` or equivalent stable foreign key for SSO accounts.
- No "claim my account" / "link SSO to existing user" UX surface.

---

## 2. Library decision: NextAuth.js (Auth.js v5) vs custom MSAL

### 2.1 NextAuth.js (Auth.js v5)

**Pros**
- First-party `@auth/core/providers/microsoft-entra-id` provider. Handles the OAuth dance (authorization code → token → userinfo) end to end. Single-tenant configuration is documented; `MICROSOFT_ENTRA_ID_TENANT_ID` constrains which directory can sign in.
- App Router native (v5). Works alongside existing custom middleware and cookie patterns IF we configure `session: { strategy: 'jwt' }` + `cookies: { sessionToken: { name: 'gsl_ops_session', options: {...} } }` so it shares the same cookie name and JWT shape as today.
- CSRF + state + PKCE handled out of the box.
- Provider catalogue (Google, GitHub, Okta, custom) means adding a second IdP later is trivial.

**Cons**
- Introduces a new auth library + opinions. Even with cookie/session config aligned, the verifier path forks: middleware uses `jose` against `GSL_JWT_SECRET`; Auth.js uses its own decoder + `AUTH_SECRET`. Reconciling these is doable but real work.
- Adds dependencies: `next-auth@beta` (v5 is still beta for App Router) + `@auth/core` + `@auth/microsoft-entra-id-adapter` (if we use one). ~50-80kb to the server bundle.
- Username/password flow today does NOT use Auth.js. Keeping both flows means two code paths: legacy `/api/login` + Auth.js callback handlers. Documented but extra surface area.

### 2.2 Custom MSAL (`@azure/msal-node`)

**Pros**
- Direct dependency on Microsoft's official Node SDK. No middleware layer.
- We already issue + verify our own JWTs; MSAL would just complete the OAuth flow, return the userinfo claims, and hand them to our existing `issueSessionToken`. The session cookie + middleware stay unchanged.
- Smaller dep footprint than Auth.js. No `@auth/core` + provider plumbing.

**Cons**
- We hand-code the OAuth state, PKCE, callback handler, token validation, refresh logic. Auth.js gives all of this for free.
- Adding a second IdP later means writing another adapter. Auth.js has a provider for everything.
- No off-the-shelf account-linking UX. We design our own "link this Microsoft account to your existing GSL user" flow.

### 2.3 Recommendation

**Adopt NextAuth.js (Auth.js v5) with the Microsoft Entra ID provider, configured to share the existing `gsl_ops_session` cookie + JWT.** Rationale:

1. The brief explicitly suggests it ("NextAuth.js is the default unless there's a reason not to").
2. We have no Auth.js today, so adopting it adds new code; we have no MSAL today either, so the alternative also adds new code. NextAuth's provider catalogue is the deciding factor: future IdPs (Google for one Sales person who refuses to use their Mafatlal account, say) drop in for free.
3. Aligning the cookie name means **middleware does not change**. Auth.js writes a `gsl_ops_session` cookie with a JWT shape that `verifySessionToken` accepts because we configure both sides with the same secret + algorithm. This is the lowest-blast-radius migration path.
4. The legacy username/password `/api/login` flow stays — Auth.js runs ALONGSIDE, not instead. Both write the same cookie shape; the middleware doesn't care which flow issued it.

### 2.4 Concrete plan for Part 2

- Install `next-auth@beta` (v5).
- Add `src/app/api/auth/[...nextauth]/route.ts` with the Microsoft Entra ID provider configured for single-tenant + the existing JWT cookie shape (matching `gsl_ops_session` + HS256 + GSL_JWT_SECRET).
- Add `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` to `.env.local.example` as placeholders. (Note: the brief named these `AZURE_AD_*` — Auth.js v5 uses `AUTH_MICROSOFT_ENTRA_ID_*` per their convention; we can alias for back-compat with what Mafatlal IT receives.)
- Add `AUTH_SECRET` (Auth.js's own JWT-encryption secret) — required even when we encode tokens via Auth.js's default JWT strategy. Generated the same way as `GSL_JWT_SECRET` (`openssl rand -hex 32`).
- Extend `User` shape with `azureAdObjectId: string | null` field; back-fill existing 13 users with `null`.
- Add `requiresAdminReview: boolean` field; back-fill existing 13 users with `false`.
- Wire the Auth.js `signIn({ user, account, profile })` callback:
  - Find a User in `users.json` matching `profile.email` (case-insensitive).
  - If found → write `azureAdObjectId = profile.oid` on the user (idempotent; if already set and matches, no-op).
  - If not found → create a new User with `role: 'User'`, `department: null`, `requiresAdminReview: true`, `azureAdObjectId = profile.oid`, `active: true`, `passwordHash: ''` (cannot log in via password).
  - Either way, append an `sso-signin` audit entry with `before.azureAdObjectId` + `after.azureAdObjectId` + `notes: profile.userPrincipalName`.
- Tests: mock the signIn callback's parameters; assert each of (existing user lookup, new user creation, audit entry append) via vitest.

### 2.5 Risks + open questions

1. **`role: 'User'` is a brand-new role.** `UserRole` today is a union of fixed values (Admin, SalesHead, SalesRep, OpsHead, OpsEmployee, TrainerHead, Finance, Leadership). Adding `'User'` cascades through `defaultDepartmentForRole`, `permissions.ts` switch statements, and possibly UI badges. Confirm with Anish: do we want the new role to be `'User'` (literal new value), `'Pending'`, or simply use the existing `Admin` role with `active: false`?
2. **Cookie alignment** between Auth.js v5 and our custom `jose` verifier needs careful config. Worth a small spike to confirm the JWT Auth.js produces is acceptable to `verifySessionToken`. If not, we accept two parallel cookies or move middleware to Auth.js's verifier.
3. **`profile.email` vs `profile.userPrincipalName`** — these usually match but can diverge. The audit entry captures both. The lookup uses email; future hardening could prefer the immutable `oid` (Azure AD object ID).
4. **Single-tenant gate** is configured via Auth.js's `tenantId` param. Personal Microsoft accounts are blocked at the Microsoft endpoint, not in our code; this is fine but worth flagging if Mafatlal IT asks "what's the rejection UX for a personal MS account?" — Microsoft handles that; we never see the user.
5. **The `requiresAdminReview` flag** needs a surface for Anish to act on. Default proposal: a list on `/admin/users` filtered to that flag, with "Approve + set role/department" + "Reject" actions. Out of scope for Part 2; flagging for Part 3 or a future iteration.

---

## 2.6 Decisions recorded (Anish 2026-05-21 GO + follow-up)

1. **Env var naming**: Auth.js convention. `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`, `AUTH_SECRET`. **No `AUTH_MICROSOFT_ENTRA_ID_SECRET`** - Mafatlal IT registered the app as a public client with PKCE. Provider config sets `client.token_endpoint_auth_method: 'none'`.
2. **New-user role**: `OpsEmployee` chosen as the most-restricted existing role. Lowest privilege on Layer 2 `canPerform`: no PI generation, no MOU drafting, no dispatch raising, no audit-route writes; viewing-only at the operations surfaces. Combined with `active: false` + `requiresAdminReview: true`, the auto-created user holds a session but cannot reach any gated surface until Anish flips `active: true` and clears the review flag.
3. **Cookie shared** between Auth.js + legacy flow as `gsl_ops_session`. JWT encode/decode overridden in `ssoConfig.ts` to round-trip through our `jose` helpers; middleware verifies the same shape regardless of origin.
4. **`requiresAdminReview` queue**: deferred. Counter lives on `/admin/queue-status`; first SSO pending review surfaces on the homepage action queue as a Data Quality card.
5. **Allowlist** wired via `AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS` (comma-separated). Empty = no allowlist; relies on single-tenant config alone.
6. **Pre-approved-email override** added per follow-up: 3-branch dispatch in `applySsoSignin`:
   - (a) email domain in allowlist OR allowlist empty -> in-tenant flow.
   - (b) email outside allowlist BUT existing pre-created user in `users.json` -> link the Microsoft identity, preserve role + permissions, NO review gate.
   - (c) email outside allowlist AND no existing user -> reject with "Account not authorised. Contact your GSL administrator for access."

## 3. Status

Reply **GO** with any adjustments to:
- The library decision (NextAuth vs custom MSAL).
- The env var naming convention (`AUTH_MICROSOFT_ENTRA_ID_*` per Auth.js convention OR `AZURE_AD_*` per the brief's wording).
- The new-user role assignment (`'User'` literal vs an existing role + `active: false`).
- Whether the cookie should remain `gsl_ops_session` shared between flows, or whether Auth.js gets its own cookie.

After GO, Part 2 lands as `feat(auth): Microsoft Entra ID SSO provider + user link/create on first signin`, with the `.env.example` placeholders, the callback route, and the tests.
