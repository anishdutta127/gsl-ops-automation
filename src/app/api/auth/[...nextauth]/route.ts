/*
 * /api/auth/[...nextauth] (Phase 6G Part 2).
 *
 * NextAuth.js v5 route handler. Re-exports the GET + POST handlers
 * from src/lib/auth/ssoConfig.ts. All provider config + signIn
 * callback logic lives there so this file stays minimal.
 *
 * Callback URL for Microsoft (give to Mafatlal IT):
 *   production : https://gsl-ops-automation.vercel.app/api/auth/callback/microsoft-entra-id
 *
 * The legacy username/password /api/login route stays in place; both
 * flows produce interchangeable gsl_ops_session cookies.
 */

import { handlers } from '@/lib/auth/ssoConfig'

export const { GET, POST } = handlers
