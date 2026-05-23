/*
 * Phase 7 Postgres client (postgres.js).
 *
 * Lazy-initialised single instance per server lifecycle. Calling
 * getSql() with DATABASE_URL unset throws loudly so a misconfigured
 * deploy fails on the first DB read instead of silently degrading.
 *
 * The DNS fallback (Node ISP-resolver-can't-find-Neon-hostnames)
 * lives here as a process-wide patch on dns.lookup. Vercel's
 * runtime resolves the host natively so the patch is a no-op
 * in production; locally and in CI it routes around the issue.
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

// ---------------------------------------------------------------------------
// DNS fallback: local resolver may refuse Neon hostnames; patch
// dns.lookup to fall back to 1.1.1.1 / 8.8.8.8 when the OS errors.
// ---------------------------------------------------------------------------
let dnsFallbackInstalled = false
function installDnsFallback() {
  if (dnsFallbackInstalled) return
  dnsFallbackInstalled = true
  const publicResolver = new Resolver()
  publicResolver.setServers(['1.1.1.1', '8.8.8.8'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalLookup = dns.lookup as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(dns as any).lookup = function patched(hostname: string, opts: unknown, cb?: unknown): void {
    let optsObj: { family?: number; all?: boolean } = {}
    let callback: (
      err: NodeJS.ErrnoException | null,
      address?: string | { address: string; family: number }[],
      family?: number,
    ) => void
    if (typeof opts === 'function') {
      callback = opts as typeof callback
      optsObj = {}
    } else {
      callback = cb as typeof callback
      if (typeof opts === 'number') optsObj = { family: opts }
      else if (opts && typeof opts === 'object') optsObj = opts as typeof optsObj
    }
    originalLookup(
      hostname,
      optsObj,
      (err: NodeJS.ErrnoException | null, addr?: string, fam?: number) => {
        if (!err) return callback(err, addr, fam)
        publicResolver
          .resolve4(hostname)
          .then((addrs) => {
            if (!addrs || addrs.length === 0) return callback(err)
            if (optsObj.all) {
              callback(null, addrs.map((a) => ({ address: a, family: 4 })))
            } else {
              callback(null, addrs[0], 4)
            }
          })
          .catch(() => callback(err))
      },
    )
  }
}

let cached: ReturnType<typeof postgres> | null = null

/**
 * Returns the shared postgres.js client. Initialises on first call.
 * Throws if DATABASE_URL is unset.
 */
export function getSql(): ReturnType<typeof postgres> {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Required when DATA_BACKEND=postgres.',
    )
  }
  installDnsFallback()
  cached = postgres(url, {
    onnotice: () => {},
  })
  return cached
}

/**
 * Closes the shared client. Call from server-side process shutdown
 * hooks if you want to release the connection pool eagerly. Tests
 * should call this in afterAll.
 */
export async function closeSql(): Promise<void> {
  if (!cached) return
  await cached.end({ timeout: 5 })
  cached = null
}
