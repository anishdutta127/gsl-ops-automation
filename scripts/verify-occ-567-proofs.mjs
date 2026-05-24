#!/usr/bin/env node
/*
 * P3 OCC proofs #5 (vex_products), #6 (stage_responsibility),
 * #7 (mou_import_review NULL-check).
 *
 * Each: seed temp row, fire 10 parallel writers, assert exactly one
 * wins and the rest get a clean conflict.
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

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

const sql = postgres(process.env.DATABASE_URL, {
  max: 10, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10
const results = {}

// =========================================================================
// OCC #5: vex_products.version
// =========================================================================
{
  const partNumber = `VPX-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
  await sql`
    INSERT INTO vex_products (part_number, name, default_unit_price, active, version)
    VALUES (${partNumber}, 'OCC Test Product', 100, TRUE, 1)
  `
  try {
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const newPrice = 100 + idx
        return sql`
          UPDATE vex_products SET
            default_unit_price = ${newPrice},
            version = version + 1
          WHERE part_number = ${partNumber} AND version = 1
          RETURNING version
        `.then((rows) => ({ idx, ok: rows.length === 1, newVersion: rows[0]?.version }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`SELECT version, default_unit_price FROM vex_products WHERE part_number = ${partNumber}`)[0]
    console.log('--- OCC #5: vex_products.default_unit_price ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.version=${final.version} default_unit_price=${final.default_unit_price}`)
    const pass = winners.length === 1 && losers.length === N - 1 && Number(final.version) === 2
    results.vexProduct = pass

    // Loser-retry at v=2.
    const retry = await sql`
      UPDATE vex_products SET default_unit_price = 999, version = version + 1
      WHERE part_number = ${partNumber} AND version = 2
      RETURNING version
    `
    const retryOk = retry.length === 1 && retry[0].version === 3
    console.log(`retry: ${retryOk ? 'WIN (v=3)' : 'FAIL'}`)
    results.vexProductRetry = retryOk
    console.log(`OCC #5: ${pass && retryOk ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM vex_products WHERE part_number = ${partNumber}`
  }
}

// =========================================================================
// OCC #6: stage_responsibility.version
// =========================================================================
{
  const stage = `stage-occ-${Date.now().toString(36).slice(-6).toUpperCase()}`
  await sql`
    INSERT INTO stage_responsibility (stage, responsible_department, escalation_department,
      notes, updated_at, updated_by, audit, version)
    VALUES (${stage}, 'sales', 'leadership', 'OCC test',
      NOW(), 'seed', ${sql.json([])}::jsonb, 1)
  `
  try {
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const audit = {
          timestamp: new Date(Date.now() + idx).toISOString(),
          user: `leadership-${idx}`, action: 'update',
          notes: `OCC writer ${idx}`,
        }
        const newDept = ['sales', 'ops', 'finance', 'leadership', 'admin'][idx % 5]
        return sql`
          UPDATE stage_responsibility SET
            responsible_department = ${newDept},
            audit = audit || ${sql.json([audit])}::jsonb,
            version = version + 1
          WHERE stage = ${stage} AND version = 1
          RETURNING version
        `.then((rows) => ({ idx, ok: rows.length === 1, newVersion: rows[0]?.version }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`SELECT version, responsible_department, jsonb_array_length(audit) AS al FROM stage_responsibility WHERE stage = ${stage}`)[0]
    console.log('--- OCC #6: stage_responsibility.responsible_department ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.version=${final.version} responsible_department=${final.responsible_department} audit=${final.al}`)
    const pass = winners.length === 1 && losers.length === N - 1 && Number(final.version) === 2 && Number(final.al) === 1
    results.stageResp = pass

    // Loser-retry at v=2.
    const retry = await sql`
      UPDATE stage_responsibility SET responsible_department = 'admin', version = version + 1
      WHERE stage = ${stage} AND version = 2
      RETURNING version
    `
    const retryOk = retry.length === 1 && retry[0].version === 3
    console.log(`retry: ${retryOk ? 'WIN (v=3)' : 'FAIL'}`)
    results.stageRespRetry = retryOk
    console.log(`OCC #6: ${pass && retryOk ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM stage_responsibility WHERE stage = ${stage}`
  }
}

// =========================================================================
// OCC #7: mou_import_review NULL-check on (resolution, resolved_at)
// =========================================================================
{
  const queuedAt = new Date().toISOString()
  const fakeId = `MIR-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
  await sql`
    INSERT INTO mou_import_review (queued_at, raw_record, validation_failed)
    VALUES (${queuedAt}, ${sql.json({ id: fakeId, schoolName: 'OCC Test' })}::jsonb, 'occ-test')
  `
  try {
    // Two concurrent admins both pass the in-memory check (resolution is null),
    // both try to resolve. NULL-check data guard should let exactly one through.
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const resolution = (idx % 3 === 0) ? 'imported' : (idx % 3 === 1) ? 'rejected' : 'approved-as-single'
        return sql`
          UPDATE mou_import_review SET
            resolution = ${resolution},
            resolved_at = NOW(),
            resolved_by = ${`admin-${idx}`},
            rejection_reason = ${resolution === 'rejected' ? 'duplicate' : null},
            rejection_notes = ${resolution === 'rejected' ? `OCC writer ${idx}` : null}
          WHERE queued_at = ${queuedAt}
            AND raw_record->>'id' = ${fakeId}
            AND resolution IS NULL
            AND resolved_at IS NULL
          RETURNING id
        `.then((rows) => ({ idx, resolution, ok: rows.length === 1 }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`
      SELECT resolution, resolved_by FROM mou_import_review
      WHERE queued_at = ${queuedAt} AND raw_record->>'id' = ${fakeId}
    `)[0]
    console.log('--- OCC #7 (set): mou_import_review NULL-check ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.resolution=${final.resolution} final.resolved_by=${final.resolved_by}`)
    const pass = winners.length === 1 && losers.length === N - 1 && final.resolution !== null
    results.mouImportReview = pass

    // Loser-retry: now the row is resolved, a retry should fail.
    const retry = await sql`
      UPDATE mou_import_review SET
        resolution = 'rejected',
        resolved_at = NOW(),
        resolved_by = 'admin-retry'
      WHERE queued_at = ${queuedAt}
        AND raw_record->>'id' = ${fakeId}
        AND resolution IS NULL
        AND resolved_at IS NULL
      RETURNING id
    `
    const retryConflict = retry.length === 0
    console.log(`retry-after-resolved: ${retryConflict ? 'CORRECTLY CONFLICTS (0 rows, idempotent)' : 'FAIL (should not have re-resolved)'}`)
    results.mouImportReviewIdempotent = retryConflict
    console.log(`OCC #7: ${pass && retryConflict ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM mou_import_review WHERE queued_at = ${queuedAt}`
  }
}

console.log()
console.log('========================================================')
console.log('OCC #5/#6/#7 SUMMARY')
console.log('========================================================')
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k.padEnd(28)} ${v ? 'PASS' : 'FAIL'}`)
}
const allPass = Object.values(results).every((v) => v === true)
console.log()
console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`)

await sql.end({ timeout: 5 })
process.exit(allPass ? 0 : 1)
