#!/usr/bin/env node
/*
 * Minimal connectivity test against the database identified by
 * DATABASE_URL. Runs SELECT 1, prints the host + a row count from
 * one of the empty tables, returns exit code 0 on success.
 *
 * Mirrors what `src/lib/db/client.ts` will do at app boot once Part 4
 * lands.
 */

import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const publicResolver = new Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])
const originalLookup = dns.lookup
dns.lookup = function patchedLookup(hostname, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {} }
  if (typeof opts === 'number') opts = { family: opts }
  originalLookup.call(dns, hostname, opts, (err, addr, fam) => {
    if (!err) return cb(err, addr, fam)
    publicResolver.resolve4(hostname).then((addrs) => {
      if (!addrs?.length) return cb(err)
      if (opts && opts.all) cb(null, addrs.map((a) => ({ address: a, family: 4 })))
      else cb(null, addrs[0], 4)
    }).catch(() => cb(err))
  })
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  const host = url.match(/@([^/]+)/)?.[1] ?? '(unknown)'
  console.log(`[db-ping] host: ${host}`)
  const t0 = Date.now()
  const r = await sql`SELECT 1 AS ok`
  console.log(`[db-ping] SELECT 1 -> ${JSON.stringify(r[0])} in ${Date.now() - t0}ms`)
  const counts = await sql`
    SELECT table_name, (xpath('/row/c/text()', xml_count))[1]::text::int AS row_count
    FROM (
      SELECT table_name,
             query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, false, '') AS xml_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    ) t
    ORDER BY table_name
  `
  console.log(`[db-ping] row counts:`)
  let nonEmpty = 0
  for (const r of counts) {
    if (r.row_count > 0) nonEmpty++
    console.log(`  ${r.table_name}: ${r.row_count}`)
  }
  console.log(`[db-ping] ${counts.length} tables, ${nonEmpty} non-empty (expected 0, schema only, no seed yet)`)
} catch (err) {
  console.error('[db-ping] FAILED:', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
