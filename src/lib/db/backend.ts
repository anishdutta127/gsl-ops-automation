/*
 * Phase 7 data-layer backend flag.
 *
 * Reads the DATA_BACKEND env var on every call rather than at module
 * load so parity tests can switch backends mid-process without
 * module-reset gymnastics. Production runtime cost is negligible
 * (a single env lookup) and the dynamic read is the only safe shape
 * for the parity test harness.
 *
 * Default is 'json' so production behaviour is unchanged until the
 * explicit cutover (Vercel env: DATA_BACKEND=postgres on production).
 *
 * Repo modules at src/lib/db/repos/ call currentBackend() to switch.
 */

export type DataBackend = 'json' | 'postgres'

export function currentBackend(): DataBackend {
  const v = process.env.DATA_BACKEND
  if (v === 'postgres') return 'postgres'
  return 'json'
}
