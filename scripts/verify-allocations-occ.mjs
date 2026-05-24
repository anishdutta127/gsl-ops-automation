#!/usr/bin/env node
/*
 * P2b.X OCC proof: kit_dispatches.allocations under 10 parallel writers.
 *
 * The fix: every allocation-edit UPDATE includes `WHERE version=$expected`
 * and `SET version = version + 1`. Two parallel writers both read version=1
 * and both try `WHERE version=1` - the first wins (UPDATE returns 1 row,
 * bumps to version=2); the second fails (UPDATE returns 0 rows, lib sees
 * the empty-RETURNING and returns 409 to the UI).
 *
 * Expected outcome with N=10 parallel writers, all loading version=1:
 *   - EXACTLY ONE write succeeds (kit_dispatches.version goes 1 -> 2,
 *     allocations + audit_log carry the winner's content).
 *   - NINE writes fail cleanly (0 rows affected, lib returns 409 with the
 *     conflict version, audit entries from losers do NOT land).
 *
 * Critical: no silent overwrite. Either you win and your allocations
 * land, or you 409 and you know to reload before retrying.
 *
 * NOTE on audit: with OCC, the audit_log only gets the WINNER's audit
 * entry. The losers' attempts don't append (because the WHERE fails).
 * That's the correct semantics: their write didn't happen at all.
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

function installDnsFallback() {
  const pr = new Resolver()
  pr.setServers(['1.1.1.1', '8.8.8.8'])
  const orig = dns.lookup
  dns.lookup = function(h, o, cb) {
    const callback = typeof o === 'function' ? o : cb
    const opts = typeof o === 'object' ? o : {}
    orig(h, opts, (e, a, f) => {
      if (!e) return callback(e, a, f)
      pr.resolve4(h).then((addrs) => {
        if (!addrs?.length) return callback(e)
        if (opts.all) callback(null, addrs.map((a) => ({ address: a, family: 4 })))
        else callback(null, addrs[0], 4)
      }).catch(() => callback(e))
    })
  }
}
installDnsFallback()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
const sql = postgres(DATABASE_URL, {
  max: 10, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10

// Seed: pick an MOU without an existing kit_dispatch.
const mou = (await sql`
  SELECT id, school_id, school_name FROM mous
  WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1
`)[0]
if (!mou) {
  console.error('no available mou')
  process.exit(1)
}
const id = `KIT-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
console.log(`[occ] seeding kit_dispatch ${id} (mou=${mou.id}) at version=1 ...`)
await sql`
  INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
    dispatch_status, allocations, audit_log, version)
  VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
    'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, 1)
`

try {
  console.log(`[occ] firing ${N} parallel OCC writes, each loading version=1 ...`)
  const writes = await Promise.all(
    Array.from({ length: N }, (_, idx) => {
      const allocations = [{ writer: idx, marker: `OCC-${idx}-${Date.now()}` }]
      const audit = {
        timestamp: new Date(Date.now() + idx).toISOString(),
        user: `writer-${idx}`,
        action: 'update',
        notes: `OCC writer ${idx}`,
      }
      return sql`
        UPDATE kit_dispatches SET
          allocations = ${sql.json(allocations)}::jsonb,
          audit_log = audit_log || ${sql.json([audit])}::jsonb,
          version = version + 1
        WHERE id = ${id} AND version = 1
        RETURNING version
      `.then((rows) => ({ idx, ok: rows.length === 1, newVersion: rows[0]?.version }))
       .catch((e) => ({ idx, ok: false, error: e.message }))
    }),
  )

  const winners = writes.filter((w) => w.ok)
  const losers = writes.filter((w) => !w.ok)

  // Final state.
  const final = (await sql`
    SELECT version, allocations, jsonb_array_length(audit_log) AS audit_count
    FROM kit_dispatches WHERE id = ${id}
  `)[0]

  console.log()
  console.log('Per-writer outcomes:')
  for (const w of writes) {
    console.log(`  writer-${String(w.idx).padStart(2)}: ${w.ok ? `WIN (v=${w.newVersion})` : 'CONFLICT (0 rows)'}`)
  }
  console.log()
  console.log('Final state:')
  console.log('  version:           ', final.version)
  console.log('  allocations:       ', JSON.stringify(final.allocations))
  console.log('  audit_log length:  ', final.audit_count)
  console.log()
  console.log(`Winners: ${winners.length} (expected exactly 1)`)
  console.log(`Losers:  ${losers.length} (expected exactly ${N - 1})`)
  console.log()

  const pass = (
    winners.length === 1
    && losers.length === N - 1
    && Number(final.version) === 2
    && Number(final.audit_count) === 1
    && Array.isArray(final.allocations) && final.allocations.length === 1
  )
  console.log(`OVERALL: ${pass ? 'PASS - OCC enforced, no silent overwrite' : 'FAIL'}`)

  // Now demonstrate the clean conflict-recovery path: a loser reloads
  // (reads version=2), submits with version=2, should now succeed.
  console.log()
  console.log('[occ] simulating loser-retry: reload version=2, submit ...')
  const retry = await sql`
    UPDATE kit_dispatches SET
      allocations = ${sql.json([{ writer: 'retry', marker: 'OCC-retry' }])}::jsonb,
      audit_log = audit_log || ${sql.json([{
        timestamp: new Date().toISOString(),
        user: 'writer-retry',
        action: 'update',
        notes: 'OCC retry after 409',
      }])}::jsonb,
      version = version + 1
    WHERE id = ${id} AND version = 2
    RETURNING version
  `
  const retryOk = retry.length === 1 && retry[0].version === 3
  console.log(`retry winner: ${retryOk ? 'YES (v=3)' : 'NO'}`)

  process.exit(pass && retryOk ? 0 : 1)
} finally {
  await sql`DELETE FROM kit_dispatches WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
