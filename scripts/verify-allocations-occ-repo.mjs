#!/usr/bin/env node
/*
 * P2b.X allocations OCC: route-equivalent proof.
 *
 * Mirrors what the route does inside one connection-pool of 10. Calls
 * the SAME SQL pattern as kitDispatchRepo.updateAllocationsOCC, in
 * parallel, and asserts that exactly one writer wins (RETURNING) and
 * the remaining nine get zero-row results (which the route maps to
 * 409 with conflictVersion).
 *
 * Audit invariant: only the winner's audit entry lands. The losers'
 * UPDATEs don't fire the audit_log || jsonb concat because the WHERE
 * version=$1 check fails first.
 *
 * Additional check: a loser-retry path - read the new version, retry
 * with that version, succeed. Proves the recovery loop is correct.
 */
import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

function installDnsFallback() {
  const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8'])
  const orig = dns.lookup
  dns.lookup = function (h, o, cb) {
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

// Mimic the repo method's atomic UPDATE statement exactly.
async function updateAllocationsOCC(id, expectedVersion, allocations, audit) {
  const rows = await sql`
    UPDATE kit_dispatches SET
      allocations = ${sql.json(allocations)}::jsonb,
      sales_approval_status = 'Pending',
      sales_rejection_reason = NULL,
      audit_log = audit_log || ${sql.json([audit])}::jsonb,
      version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion}
    RETURNING version
  `
  if (rows.length === 1) return { ok: true, newVersion: rows[0].version }
  const cur = await sql`SELECT version FROM kit_dispatches WHERE id = ${id}`
  return { ok: false, conflictVersion: cur[0]?.version ?? -1 }
}

const mou = (await sql`
  SELECT id, school_id, school_name FROM mous
  WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1
`)[0]
const id = `KIT-OCC-REPO-${Date.now().toString(36).slice(-6).toUpperCase()}`
await sql`
  INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
    dispatch_status, allocations, audit_log, version)
  VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
    'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, 1)
`
console.log(`[occ-repo] seeded ${id} (version=1)`)
console.log(`[occ-repo] firing ${N} parallel updateAllocationsOCC calls, all with expectedVersion=1 ...`)

try {
  const results = await Promise.all(
    Array.from({ length: N }, (_, idx) => {
      const allocations = [
        { writer: idx, marker: `WRITER-${idx}`, grade: 5,
          students: 10, kitsQty: 10, kitType: 'Reusable', productName: 'TEST-SKU' },
      ]
      const audit = {
        timestamp: new Date(Date.now() + idx).toISOString(),
        user: `writer-${idx}`,
        action: 'update',
        notes: `OCC writer ${idx}`,
      }
      return updateAllocationsOCC(id, 1, allocations, audit)
        .then((r) => ({ idx, ...r }))
    }),
  )

  const winners = results.filter((r) => r.ok)
  const losers = results.filter((r) => !r.ok)

  // What the ROUTE returns for each: 200 vs 409.
  console.log()
  console.log('Per-writer outcome (mirrors route response status):')
  for (const r of results) {
    if (r.ok) {
      console.log(`  writer-${String(r.idx).padStart(2)}: 200 OK         (newVersion=${r.newVersion})`)
    } else {
      console.log(`  writer-${String(r.idx).padStart(2)}: 409 Conflict   (conflictVersion=${r.conflictVersion})`)
    }
  }

  const final = (await sql`
    SELECT version, allocations, jsonb_array_length(audit_log) AS audit_count
    FROM kit_dispatches WHERE id = ${id}
  `)[0]

  const onlyWinnerLanded = (
    winners.length === 1
    && losers.length === N - 1
    && Number(final.version) === 2
    && Number(final.audit_count) === 1
    && Array.isArray(final.allocations) && final.allocations.length === 1
    && final.allocations[0]?.writer === winners[0].idx
  )
  const allLosersGotCleanConflictVersion = losers.every((l) => l.conflictVersion === 2)
  // Critical: no silent overwrite means: the winning allocations are
  // exactly what writer-N submitted, not a mash-up of two writers.
  const losersConfirmCleanConflict = losers.length === N - 1

  console.log()
  console.log('Final state in postgres:')
  console.log('  version:    ', final.version)
  console.log('  audit count:', final.audit_count, '(losers contributed 0 - their audit did NOT land)')
  console.log('  allocations:', JSON.stringify(final.allocations))
  console.log()

  // Loser-retry: simulate writer-X reading the new version and re-submitting.
  console.log('[occ-repo] loser-retry: a loser re-reads version=2 and re-submits ...')
  const retry = await updateAllocationsOCC(id, 2,
    [{ writer: 'retry', marker: 'RETRY', grade: 5, students: 10, kitsQty: 10,
       kitType: 'Reusable', productName: 'TEST-SKU' }],
    { timestamp: new Date().toISOString(), user: 'retry', action: 'update', notes: 'after-conflict retry' },
  )
  const retryOk = retry.ok && retry.newVersion === 3

  console.log(`retry result: ${retryOk ? `200 OK (v=3) - clean recovery from 409` : 'FAIL'}`)
  const overall = (
    onlyWinnerLanded
    && allLosersGotCleanConflictVersion
    && losersConfirmCleanConflict
    && retryOk
  )

  console.log()
  console.log('=== INVARIANTS ===')
  console.log(`only-winner-landed (no silent overwrite): ${onlyWinnerLanded ? 'OK' : 'FAIL'}`)
  console.log(`all-losers-got-clean-conflict-version:    ${allLosersGotCleanConflictVersion ? 'OK' : 'FAIL'}`)
  console.log(`loser-retry-succeeds-with-new-version:    ${retryOk ? 'OK' : 'FAIL'}`)
  console.log()
  console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'}`)
  process.exit(overall ? 0 : 1)
} finally {
  await sql`DELETE FROM kit_dispatches WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
