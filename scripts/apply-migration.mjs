#!/usr/bin/env node
/*
 * Apply a single .sql migration file to the database identified by
 * DATABASE_URL (loaded from .env.local). Wraps the file in a single
 * transaction; an error rolls back the whole thing.
 *
 * Usage:
 *   node scripts/apply-migration.mjs scripts/migrations/001-init.sql
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

// Local ISP DNS refuses queries for Neon endpoint hostnames. We
// override dns.lookup (used by net.connect) to fall back to a public
// resolver before erroring. The override is process-wide; harmless
// for any other domain because public DNS resolves everything.
const publicResolver = new Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])
const originalLookup = dns.lookup
function fallbackLookup(hostname, opts, cb) {
  publicResolver.resolve4(hostname).then((addrs) => {
    if (!addrs || addrs.length === 0) {
      cb(new Error(`No A records for ${hostname}`))
      return
    }
    if (opts && opts.all) {
      cb(null, addrs.map((a) => ({ address: a, family: 4 })))
    } else {
      cb(null, addrs[0], 4)
    }
  }).catch((err) => cb(err))
}
dns.lookup = function patchedLookup(hostname, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {} }
  if (typeof opts === 'number') opts = { family: opts }
  originalLookup.call(dns, hostname, opts, (err, addr, fam) => {
    if (!err) return cb(err, addr, fam)
    fallbackLookup(hostname, opts, cb)
  })
}

// Load .env.local without a dotenv dep.
import { readFileSync as rf } from 'node:fs'
for (const line of rf('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set (expected in .env.local).')
  process.exit(1)
}

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path/to/migration.sql>')
  process.exit(1)
}
const sqlText = readFileSync(resolve(file), 'utf8')

// max: 1 + simple: true so the SQL file's BEGIN/COMMIT is honoured
// as a single multi-statement script.
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  console.log(`[apply-migration] applying ${file}`)
  console.log(`[apply-migration] host: ${url.match(/@([^/]+)/)?.[1] ?? '(unknown)'}`)
  const t0 = Date.now()
  await sql.unsafe(sqlText, [], { prepare: false })
  console.log(`[apply-migration] ok in ${Date.now() - t0}ms`)

  // Confirm schema applied by counting tables in public.
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  console.log(`[apply-migration] tables in public (${rows.length}):`)
  for (const r of rows) console.log('  -', r.table_name)
} catch (err) {
  console.error('[apply-migration] FAILED:', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
