#!/usr/bin/env node
/*
 * Empirical race-test for replace-on-update JSONB arrays.
 *
 * For each (table, jsonb_column) below, this script:
 *   1. Seeds a TEMP fixture row with `column = '[]'::jsonb` (or '{}' for objects).
 *   2. Fires N parallel async sequences, each of which:
 * - SELECTs the current value (read).
 * - Appends a unique marker item locally (modify).
 * - UPDATEs the column with the merged value (write).
 *   3. Re-reads the column and counts surviving markers.
 *
 * If `surviving === N`, the field somehow survives concurrent writes
 * (extremely unlikely without explicit lock - flag for investigation).
 * If `surviving < N`, the race is REAL: the field loses N-surviving
 * concurrent writes silently.
 *
 * This mirrors EXACTLY what the libs do: each lib reads the full row
 * via repo.findById, mutates a field in-memory, then enqueues a
 * full-row update. In postgres mode the bridge dispatches the update
 * via repo.update or repo.updatePartial, both of which UPDATE the
 * whole column - exactly the pattern this test reproduces.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/verify-rmw-races.mjs
 *
 * Exit code: 0 always (this is a survey, not a regression gate).
 * Reads a 1-row-per-field table that the report consumes.
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

function installDnsFallback() {
  const pr = new Resolver()
  pr.setServers(['1.1.1.1', '8.8.8.8'])
  const origLookup = dns.lookup
  dns.lookup = function patched(host, opts, cb) {
    const callback = typeof opts === 'function' ? opts : cb
    const optsObj = typeof opts === 'object' ? opts : {}
    origLookup(host, optsObj, (err, addr, fam) => {
      if (!err) return callback(err, addr, fam)
      pr.resolve4(host)
        .then((addrs) => {
          if (!addrs?.length) return callback(err)
          if (optsObj.all) callback(null, addrs.map((a) => ({ address: a, family: 4 })))
          else callback(null, addrs[0], 4)
        })
        .catch(() => callback(err))
    })
  }
}
installDnsFallback()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
// max: 10 so each parallel "user" gets its own connection. The point
// of this test is to exercise the race; sharing a connection would
// serialise the writes and mask the race.
const sql = postgres(DATABASE_URL, {
  max: 10, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10

function shortId(prefix) {
  return `${prefix}-RMW-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

/**
 * Run one read-modify-write cycle on a JSONB array column.
 * Each cycle pushes one unique marker. Uses its own client to get a
 * separate connection (mimicking N concurrent web requests).
 */
async function rmwAppendArray(table, idCol, idVal, jsonbCol, marker) {
  // The pattern libs follow:
  //   const row = await sql`SELECT * FROM table WHERE id = ${id}`
  //   const newArr = [...(row[col] ?? []), marker]
  //   await sql`UPDATE table SET col = ${newArr}::jsonb WHERE id = ${id}`
  // Two parallel callers both read the same baseline; both compute
  // [marker_A] (or [marker_B]); both UPDATE; the second wins.
  const idClause = Array.isArray(idCol)
    ? sql`${sql(idCol[0])} = ${idVal[0]} AND ${sql(idCol[1])} = ${idVal[1]}`
    : sql`${sql(idCol)} = ${idVal}`
  const cur = await sql`SELECT ${sql(jsonbCol)} AS arr FROM ${sql(table)} WHERE ${idClause}`
  const arr = Array.isArray(cur[0]?.arr) ? cur[0].arr : []
  // Yield to allow other parallel reads to see the same baseline.
  await new Promise((r) => setImmediate(r))
  const next = [...arr, marker]
  await sql`UPDATE ${sql(table)} SET ${sql(jsonbCol)} = ${sql.json(next)}::jsonb WHERE ${idClause}`
}

async function rmwAppendObject(table, idCol, idVal, jsonbCol, key, value) {
  const idClause = Array.isArray(idCol)
    ? sql`${sql(idCol[0])} = ${idVal[0]} AND ${sql(idCol[1])} = ${idVal[1]}`
    : sql`${sql(idCol)} = ${idVal}`
  const cur = await sql`SELECT ${sql(jsonbCol)} AS obj FROM ${sql(table)} WHERE ${idClause}`
  const obj = (cur[0]?.obj && typeof cur[0].obj === 'object') ? cur[0].obj : {}
  await new Promise((r) => setImmediate(r))
  const next = { ...obj, [key]: value }
  await sql`UPDATE ${sql(table)} SET ${sql(jsonbCol)} = ${sql.json(next)}::jsonb WHERE ${idClause}`
}

const tests = [
  // --------- ARRAYS (money first) ---------
  {
    table: 'payments', column: 'partial_payments', isMoney: true,
    libs: ['confirmMatch (partial payment recording)', 'importPaymentLogs (bulk reconciliation)'],
    async seed() {
      const id = shortId('PAY')
      const mou = (await sql`SELECT id, school_name, programme FROM mous LIMIT 1`)[0]
      await sql`
        INSERT INTO payments (id, mou_id, school_name, programme, instalment_label,
          instalment_seq, total_instalments, expected_amount, status,
          partial_payments, audit_log)
        VALUES (${id}, ${mou.id}, ${mou.school_name}, ${mou.programme},
          'RMW-test', 1, 1, 100, 'Pending',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM payments WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'kit_dispatches', column: 'allocations',
    libs: ['recordAllocation', 'kit-details save'],
    async seed() {
      const id = shortId('KIT')
      const mou = (await sql`SELECT id, school_id, school_name FROM mous
        WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1`)[0]
      if (!mou) throw new Error('no available mou for kit_dispatches RMW test')
      await sql`
        INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
          dispatch_status, allocations, audit_log)
        VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
          'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM kit_dispatches WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'dispatches', column: 'line_items',
    libs: ['raiseDispatch (initial)', 'editDispatch (operator amendment - hypothetical)'],
    async seed() {
      const id = shortId('DSP')
      const sch = (await sql`SELECT id FROM schools LIMIT 1`)[0]
      await sql`
        INSERT INTO dispatches (id, school_id, stage, line_items, audit_log)
        VALUES (${id}, ${sch.id}, 'PO Raised', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM dispatches WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'vex_pis', column: 'line_items',
    libs: ['generateVexPi', 'editVexPi'],
    async seed() {
      const id = shortId('VPI')
      await sql`
        INSERT INTO vex_pis (id, pi_number, status, line_items, audit_log)
        VALUES (${id}, ${`RMWFIX-${Date.now()}`}, 'draft',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM vex_pis WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'vex_pis', column: 'payment_log_ids',
    libs: ['linkPaymentLogToVexPi (during Finance reconciliation)'],
    async seed() {
      const id = shortId('VPI2')
      await sql`
        INSERT INTO vex_pis (id, pi_number, status, line_items, audit_log)
        VALUES (${id}, ${`RMWFIX2-${Date.now()}`}, 'draft',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM vex_pis WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'cc_rules', column: 'cc_user_ids',
    libs: ['editCcRule (adding/removing cc recipients)'],
    async seed() {
      const id = shortId('CC')
      await sql`
        INSERT INTO cc_rules (id, sheet, scope, scope_value, contexts, cc_user_ids,
          enabled, audit_log)
        VALUES (${id}, 'payments', 'school', 'SCH-RMW',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, TRUE, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM cc_rules WHERE id = ${id}` }
    },
    isArray: true,
  },
  {
    table: 'communication_templates', column: 'default_cc_rules',
    libs: ['editTemplate (cc-rule list edit)'],
    async seed() {
      const id = shortId('CT')
      await sql`
        INSERT INTO communication_templates (id, name, use_case, body_markdown,
          active, audit_log, default_cc_rules, variables)
        VALUES (${id}, 'RMW CT', 'rmw-fixture', 'body', TRUE,
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM communication_templates WHERE id = ${id}` }
    },
    isArray: true,
  },
  // --------- OBJECTS / SINGLE-VALUE JSONB ---------
  {
    table: 'dispatches', column: 'override_event',
    libs: ['overrideDispatchAudit'],
    async seed() {
      const id = shortId('DSP2')
      const sch = (await sql`SELECT id FROM schools LIMIT 1`)[0]
      await sql`
        INSERT INTO dispatches (id, school_id, stage, line_items, audit_log,
          override_event)
        VALUES (${id}, ${sch.id}, 'PO Raised', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb,
          ${sql.json({})}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM dispatches WHERE id = ${id}` }
    },
    isArray: false,
  },
  {
    table: 'kit_dispatches', column: 'dispatch_summary',
    libs: ['updateDispatchSummary'],
    async seed() {
      const id = shortId('KIT2')
      const mou = (await sql`SELECT id, school_id, school_name FROM mous
        WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1`)[0]
      if (!mou) throw new Error('no available mou for kit_dispatches dispatch_summary RMW test')
      await sql`
        INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
          dispatch_status, allocations, audit_log, dispatch_summary)
        VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
          'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb,
          ${sql.json({})}::jsonb)
      `
      return { id, cleanup: () => sql`DELETE FROM kit_dispatches WHERE id = ${id}` }
    },
    isArray: false,
  },
  // --------- mous JSONB cols (sample: payment_schedule) ---------
  {
    table: 'mous', column: 'payment_schedule',
    libs: ['editPaymentSchedule', 'reissuePi (schedule rewrite)'],
    note: 'tests against an existing mou (mou table has FK weight + CHECK constraints)',
    async seed() {
      const m = (await sql`SELECT id, payment_schedule FROM mous LIMIT 1`)[0]
      return {
        id: m.id,
        skipDelete: true,
        original: m.payment_schedule,
        // The cleanup restores the original payment_schedule.
        cleanup: () => sql`UPDATE mous SET payment_schedule = ${sql.json(m.payment_schedule ?? [])}::jsonb WHERE id = ${m.id}`,
      }
    },
    isArray: true,
  },
]

const results = []
for (const t of tests) {
  process.stdout.write(`[${(`${t.table}.${t.column}`).padEnd(40)}] `)
  let seed
  try {
    seed = await t.seed()
  } catch (e) {
    console.log(`SKIP - seed failed: ${e.message}`)
    results.push({ ...t, skip: e.message })
    continue
  }
  try {
    const markers = Array.from({ length: N }, (_, i) => ({
      idx: i, marker: `RMW-${i}-${Date.now()}`,
    }))
    if (t.isArray) {
      await Promise.all(
        markers.map((m) =>
          rmwAppendArray(t.table, 'id', seed.id, t.column, m.marker),
        ),
      )
      const r = await sql`SELECT ${sql(t.column)} AS arr FROM ${sql(t.table)} WHERE id = ${seed.id}`
      const arr = Array.isArray(r[0]?.arr) ? r[0].arr : []
      const survivors = arr.filter((x) =>
        markers.some((m) => x === m.marker || x?.marker === m.marker || JSON.stringify(x).includes(m.marker)),
      ).length
      const tag = survivors === N ? 'SAFE' : (survivors === 1 ? 'RACE (1/10)' : `PARTIAL (${survivors}/10)`)
      const money = t.isMoney ? ' [MONEY]' : ''
      console.log(`${tag} survived${money}`)
      results.push({ ...t, survivors, total: N, raceConfirmed: survivors < N })
    } else {
      await Promise.all(
        markers.map((m) =>
          rmwAppendObject(t.table, 'id', seed.id, t.column, `key${m.idx}`, m.marker),
        ),
      )
      const r = await sql`SELECT ${sql(t.column)} AS obj FROM ${sql(t.table)} WHERE id = ${seed.id}`
      const obj = (r[0]?.obj && typeof r[0].obj === 'object') ? r[0].obj : {}
      const keys = Object.keys(obj).filter((k) => k.startsWith('key'))
      const survivors = keys.length
      const tag = survivors === N ? 'SAFE' : (survivors === 1 ? 'RACE (1/10)' : `PARTIAL (${survivors}/10)`)
      console.log(`${tag} object-key survived`)
      results.push({ ...t, survivors, total: N, raceConfirmed: survivors < N })
    }
  } catch (e) {
    console.log(`ERROR - ${e.message}`)
    results.push({ ...t, error: e.message })
  } finally {
    try { await seed.cleanup() } catch (e) { console.error(`cleanup failed for ${t.table}.${t.column}:`, e.message) }
  }
}

console.log()
console.log('========================================================')
console.log('Replace-on-update RMW race survey (N=10 parallel writers)')
console.log('========================================================')
const races = results.filter((r) => r.raceConfirmed)
const safes = results.filter((r) => r.raceConfirmed === false)
const errs = results.filter((r) => r.error || r.skip)
console.log(`RACE confirmed:  ${races.length}`)
console.log(`SAFE (10/10):    ${safes.length}`)
console.log(`SKIP / ERROR:    ${errs.length}`)
console.log()
if (races.length) {
  console.log('RACE-confirmed fields (need fix or documented non-concurrent-path):')
  for (const r of races) {
    const money = r.isMoney ? ' [MONEY - MUST FIX]' : ''
    console.log(` - ${r.table}.${r.column}: ${r.survivors}/${N} survived${money}`)
    console.log(`      lib paths: ${(r.libs ?? []).join(', ')}`)
  }
}
if (safes.length) {
  console.log()
  console.log('SAFE fields (10/10):')
  for (const r of safes) {
    console.log(` - ${r.table}.${r.column}`)
  }
}

await sql.end({ timeout: 5 })
process.exit(0)
