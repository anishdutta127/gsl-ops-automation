/*
 * Microsoft Entra ID SSO config (Phase 6G Part 2).
 *
 * Wires Auth.js v5 (NextAuth) to share the existing gsl_ops_session
 * cookie + JWT shape with the legacy username/password flow. The two
 * flows produce interchangeable tokens; middleware does not need to
 * detect provenance.
 *
 * The session-cookie + JWT shape is preserved via:
 *   - cookies.sessionToken.name = 'gsl_ops_session'
 *   - jwt.encode = issueSessionToken (jose, HS256, GSL_JWT_SECRET)
 *   - jwt.decode = verifySessionToken (matching jose verifier)
 *
 * The signIn callback enforces domain allowlist + lookup-or-create
 * on users.json. New users land with role='OpsEmployee', active=false,
 * requiresAdminReview=true so they hold a session but cannot touch
 * any gated surface until Anish promotes them.
 *
 * Most-restricted default role choice (Anish 2026-05-21 GO):
 *   - The brief asked for the role that maps to "logged in but can do
 *     nothing yet". OpsEmployee is the lowest-privilege existing role:
 *     no PI generation, no MOU drafting, no dispatch raising, can only
 *     view + add comments at the operations surfaces. Combined with
 *     active=false, the user cannot reach any of those surfaces yet
 *     either; the role only matters once Anish flips active=true.
 *
 * Env vars (set in Vercel post Mafatlal IT reply):
 *   AUTH_MICROSOFT_ENTRA_ID_ID        - app registration Client ID
 *   AUTH_MICROSOFT_ENTRA_ID_SECRET    - app registration Client Secret
 *   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID - Mafatlal tenant ID (single-tenant gate)
 *   AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS - optional, comma-separated
 *                                              email-domain allowlist
 *                                              ('getsetlearn.info,mafatlal.com').
 *                                              Empty = no allowlist; defence
 *                                              relies on single-tenant config
 *                                              alone.
 *   AUTH_SECRET                       - self-generated (openssl rand -hex 32);
 *                                       used by Auth.js internally even when
 *                                       we override JWT encode/decode.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import {
  issueSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/crypto/jwt'
import { applySsoSignin } from './applySsoSignin'
import { buildEntraProviderConfig, isMicrosoftEntraIdConfigured } from './ssoEnv'

export { isEmailDomainAllowed, isMicrosoftEntraIdConfigured } from './ssoEnv'

export const ssoConfig: NextAuthConfig = {
  // Providers are added lazily so a missing-env state does not crash
  // the route at import time; the /login page can render with a
  // greyed-out button and the route handlers safely 4xx on attempted
  // sign-ins.
  providers: isMicrosoftEntraIdConfigured()
    ? [
        // Phase 6G.3 (2026-05-24): the provider config is built by
        // buildEntraProviderConfig() in ssoEnv.ts so the dual-mode
        // (confidential vs PKCE-public) selection is testable. See the
        // helper's docstring for the rationale (Microsoft's /token
        // endpoint returned invalid_client on the first Anish
        // click-test under the public-client config, signalling the
        // Azure app registration is "Web" platform type and expects a
        // secret on token exchange).
        MicrosoftEntraID(buildEntraProviderConfig()),
      ]
    : [],
  session: { strategy: 'jwt' },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME, // 'gsl_ops_session' - shared with legacy flow
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      },
    },
  },
  // Override Auth.js's default JWE-encoded token with our HS256 JWS so
  // middleware's `verifySessionToken` accepts the same cookie issued
  // from either flow.
  jwt: {
    encode: async ({ token }) => {
      if (!token || !token.sub) return ''
      // The lookup-or-create callback below has already ensured the
      // user record exists; emit a session JWT with the canonical
      // claim set (sub, email, name, role) matching the legacy flow.
      return issueSessionToken({
        sub: token.sub,
        email: String(token.email ?? ''),
        name: String(token.name ?? ''),
        role: (token.role as Parameters<typeof issueSessionToken>[0]['role']) ?? 'OpsEmployee',
      })
    },
    decode: async ({ token }) => {
      if (!token) return null
      const claims = await verifySessionToken(token)
      if (!claims) return null
      // jose returns extended claims; Auth.js's JWT type is a record.
      // Cast through unknown to satisfy both sides.
      return claims as unknown as Record<string, unknown>
    },
  },
  callbacks: {
    /**
     * Gate the sign-in BEFORE issuing a session. Steps:
     *   1. Reject if profile lacks an email.
     *   2. Reject if email domain is not in the allowlist (when set).
     *   3. Lookup-or-create in users.json (writes via enqueueUpdate).
     *   4. On success, set token.role so the JWT carries the role.
     */
    async signIn({ user, account, profile }) {
      const email = (user?.email ?? (profile?.email as string | undefined) ?? '').toLowerCase()
      if (!email) return '/login?error=sso-no-email'
      // Domain allowlist + pre-approved-email override branch logic
      // lives in applySsoSignin (Anish 2026-05-21 follow-up GO). The
      // 3-branch result drives whether to issue a session or reject.
      const oid = (profile?.oid as string | undefined) ?? account?.providerAccountId ?? null
      const upn = (profile?.preferred_username as string | undefined) ?? email
      const displayName = user?.name ?? (profile?.name as string | undefined) ?? email
      const result = await applySsoSignin({
        email,
        azureAdObjectId: oid,
        userPrincipalName: upn,
        displayName,
      })
      if (result.outcome === 'external-rejected') {
        return '/login?error=sso-not-authorised'
      }
      // Attach the user.id so the jwt callback sees it on `user`.
      if (user && result.userId) {
        user.id = result.userId
        ;(user as { role?: string }).role = result.role ?? 'OpsEmployee'
      }
      return true
    },
    /**
     * Populate the role claim on the JWT so the encoded token carries
     * everything middleware + getCurrentUser need. Auth.js calls this
     * AFTER signIn, with the user record from the callback above.
     */
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub
        token.email = user.email ?? token.email
        token.name = user.name ?? token.name
        ;(token as { role?: string }).role =
          (user as { role?: string }).role ?? (token as { role?: string }).role ?? 'OpsEmployee'
      }
      return token
    },
  },
}

export const { handlers, signIn, signOut, auth } = NextAuth(ssoConfig)
