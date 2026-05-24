#!/usr/bin/env node
/*
 * P2b.X OCC proofs #1 (cc_rules), #2 (communication_templates), #3
 * (override_event NULL-check).
 *
 * Each test: seed temp row(s), fire 10 parallel writers, assert
 *   exactly one wins and the rest get a clean conflict result.
 * Cleanup in finally.
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
// OCC #1: cc_rules.version
// =========================================================================
{
  const id = `CC-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
  await sql`
    INSERT INTO cc_rules (id, sheet, scope, scope_value, contexts, cc_user_ids,
      enabled, audit_log, version)
    VALUES (${id}, 'derived', 'school', 'SCH-OCC',
      ${sql.json([])}::jsonb, ${sql.json(['u-original'])}::jsonb, TRUE,
      ${sql.json([])}::jsonb, 1)
  `
  try {
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const newCcUsers = [`u-writer-${idx}`]
        const audit = { timestamp: new Date(Date.now() + idx).toISOString(),
          user: `admin-${idx}`, action: 'update', notes: `OCC writer ${idx}` }
        return sql`
          UPDATE cc_rules SET
            cc_user_ids = ${sql.json(newCcUsers)}::jsonb,
            audit_log = audit_log || ${sql.json([audit])}::jsonb,
            version = version + 1
          WHERE id = ${id} AND version = 1
          RETURNING version
        `.then((rows) => ({ idx, ok: rows.length === 1, newVersion: rows[0]?.version }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`SELECT version, cc_user_ids, jsonb_array_length(audit_log) AS al FROM cc_rules WHERE id = ${id}`)[0]
    console.log('--- OCC #1: cc_rules.cc_user_ids ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.version=${final.version} cc_user_ids=${JSON.stringify(final.cc_user_ids)} audit_count=${final.al}`)
    const pass = winners.length === 1 && losers.length === N - 1 && Number(final.version) === 2 && Number(final.al) === 1
    results.ccRules = pass
    console.log(`OCC #1: ${pass ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM cc_rules WHERE id = ${id}`
  }
}

// =========================================================================
// OCC #2: communication_templates.version
// =========================================================================
{
  const id = `CT-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
  await sql`
    INSERT INTO communication_templates (id, name, use_case, body_markdown,
      active, audit_log, default_cc_rules, variables, version)
    VALUES (${id}, 'OCC Template', 'occ-fixture', 'body',
      TRUE, ${sql.json([])}::jsonb,
      ${sql.json(['original-ctx'])}::jsonb, ${sql.json([])}::jsonb, 1)
  `
  try {
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const newCc = [`ctx-writer-${idx}`]
        const audit = { timestamp: new Date(Date.now() + idx).toISOString(),
          user: `admin-${idx}`, action: 'template-edited', notes: `OCC writer ${idx}` }
        return sql`
          UPDATE communication_templates SET
            default_cc_rules = ${sql.json(newCc)}::jsonb,
            audit_log = audit_log || ${sql.json([audit])}::jsonb,
            version = version + 1
          WHERE id = ${id} AND version = 1
          RETURNING version
        `.then((rows) => ({ idx, ok: rows.length === 1, newVersion: rows[0]?.version }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`SELECT version, default_cc_rules, jsonb_array_length(audit_log) AS al FROM communication_templates WHERE id = ${id}`)[0]
    console.log('--- OCC #2: communication_templates.default_cc_rules ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.version=${final.version} default_cc_rules=${JSON.stringify(final.default_cc_rules)} audit_count=${final.al}`)
    const pass = winners.length === 1 && losers.length === N - 1 && Number(final.version) === 2 && Number(final.al) === 1
    results.commTemplate = pass
    console.log(`OCC #2: ${pass ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM communication_templates WHERE id = ${id}`
  }
}

// =========================================================================
// OCC #3: dispatches.override_event NULL-check
// =========================================================================
{
  const id = `DSP-OCC-${Date.now().toString(36).slice(-6).toUpperCase()}`
  const sch = (await sql`SELECT id FROM schools LIMIT 1`)[0]
  await sql`
    INSERT INTO dispatches (id, school_id, stage, line_items, audit_log,
      override_event, installment1_paid)
    VALUES (${id}, ${sch.id}, 'pending', ${sql.json([])}::jsonb,
      ${sql.json([])}::jsonb, NULL, FALSE)
  `
  try {
    const writes = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const override = {
          overriddenBy: `leadership-${idx}`,
          overriddenAt: new Date(Date.now() + idx).toISOString(),
          reason: `OCC test writer ${idx}`,
          acknowledgedBy: null,
          acknowledgedAt: null,
        }
        const audit = {
          timestamp: new Date(Date.now() + idx).toISOString(),
          user: `leadership-${idx}`,
          action: 'p2-override',
          notes: `OCC writer ${idx}`,
        }
        return sql`
          UPDATE dispatches SET
            override_event = ${sql.json(override)}::jsonb,
            audit_log = audit_log || ${sql.json([audit])}::jsonb
          WHERE id = ${id} AND override_event IS NULL
          RETURNING id
        `.then((rows) => ({ idx, ok: rows.length === 1 }))
      }),
    )
    const winners = writes.filter((w) => w.ok)
    const losers = writes.filter((w) => !w.ok)
    const final = (await sql`SELECT override_event, jsonb_array_length(audit_log) AS al FROM dispatches WHERE id = ${id}`)[0]
    console.log('--- OCC #3 (set): dispatches.override_event NULL-check ---')
    console.log(`winners=${winners.length} losers=${losers.length} final.override.overriddenBy=${final.override_event?.overriddenBy} audit_count=${final.al}`)
    const setPass = winners.length === 1 && losers.length === N - 1 && Number(final.al) === 1 && final.override_event !== null
    results.overrideSet = setPass
    console.log(`OCC #3 (set): ${setPass ? 'PASS' : 'FAIL'}`)

    // Now acknowledgement: 10 parallel ack attempts, 1 should win.
    console.log()
    const acks = await Promise.all(
      Array.from({ length: N }, (_, idx) => {
        const ackedOverride = {
          ...final.override_event,
          acknowledgedBy: `finance-${idx}`,
          acknowledgedAt: new Date(Date.now() + 100 + idx).toISOString(),
        }
        const audit = {
          timestamp: new Date(Date.now() + 100 + idx).toISOString(),
          user: `finance-${idx}`,
          action: 'p2-override-acknowledged',
          notes: `OCC ack writer ${idx}`,
        }
        return sql`
          UPDATE dispatches SET
            override_event = ${sql.json(ackedOverride)}::jsonb,
            audit_log = audit_log || ${sql.json([audit])}::jsonb
          WHERE id = ${id}
            AND override_event IS NOT NULL
            AND override_event->>'acknowledgedBy' IS NULL
          RETURNING id
        `.then((rows) => ({ idx, ok: rows.length === 1 }))
      }),
    )
    const ackWinners = acks.filter((w) => w.ok)
    const ackLosers = acks.filter((w) => !w.ok)
    const final2 = (await sql`SELECT override_event, jsonb_array_length(audit_log) AS al FROM dispatches WHERE id = ${id}`)[0]
    console.log('--- OCC #3 (ack): override_event JSONB-key NULL-check ---')
    console.log(`winners=${ackWinners.length} losers=${ackLosers.length} ackedBy=${final2.override_event?.acknowledgedBy} audit_count=${final2.al}`)
    const ackPass = ackWinners.length === 1 && ackLosers.length === N - 1
      && Number(final2.al) === 2 && final2.override_event.acknowledgedBy != null
    results.overrideAck = ackPass
    console.log(`OCC #3 (ack): ${ackPass ? 'PASS' : 'FAIL'}`)
  } finally {
    await sql`DELETE FROM dispatches WHERE id = ${id}`
  }
}

console.log()
console.log('========================================================')
console.log('OCC #1/#2/#3 SUMMARY')
console.log('========================================================')
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k.padEnd(20)} ${v ? 'PASS' : 'FAIL'}`)
}
const allPass = Object.values(results).every((v) => v === true)
console.log()
console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`)

await sql.end({ timeout: 5 })
process.exit(allPass ? 0 : 1)
