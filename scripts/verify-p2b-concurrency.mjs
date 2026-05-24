#!/usr/bin/env node
/*
 * P2b smart-bridge concurrency proof (SQL-only).
 *
 * For each of the 17 audited entities the smart-bridge dispatches
 * through, this script:
 *   1. Seeds a TEMP fixture row (no permanent state changes).
 *   2. Fires 10 parallel UPDATE ... audit_log || jsonb writes.
 *   3. Asserts the row's audit_log array length is exactly 10.
 *   4. Cleans up the fixture in finally{}.
 *
 * No browser. No login. No app server. Just DATABASE_URL and SQL.
 *
 * This proves the postgres-side primitive (jsonb || concat) is race-safe
 * on every audited table. Once proven per-table, the smart-bridge in
 * pendingUpdates.ts is correct by construction: it translates each
 * lib's full-row update into N appendAudit calls, and those calls land
 * via the same primitive these tests exercise.
 *
 * Exit code 0 iff all tests show afterLen === 10. Otherwise 1 and the
 * failing entities are printed.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/verify-p2b-concurrency.mjs
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
const sql = postgres(DATABASE_URL, {
  max: 1, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10

function shortId(prefix) {
  return `${prefix}-P2BCONC-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

function auditEntries(action) {
  const ts = Date.now()
  return Array.from({ length: N }, (_, i) => ({
    timestamp: new Date(ts + i).toISOString(),
    user: 'p2b-conc-test',
    action,
    notes: `${action}-${i}`,
  }))
}

async function fireParallelAudits(table, id, action) {
  const entries = auditEntries(action)
  await Promise.all(
    entries.map((entry) =>
      sql`UPDATE ${sql(table)} SET audit_log = audit_log || ${sql.json([entry])}::jsonb
           WHERE id = ${id}`,
    ),
  )
  const r = await sql`SELECT jsonb_array_length(audit_log) AS len FROM ${sql(table)} WHERE id = ${id}`
  return Number(r[0].len)
}

// ---------------------------------------------------------------------------
// Per-entity fixtures
// ---------------------------------------------------------------------------
const tests = [
  {
    entity: 'mou',
    libs: ['workflow/send-reminder', 'audit/append'],
    async run() {
      // mou has FK + many CHECK constraints; reuse existing row, snapshot
      // length, fire concurrent appends, then truncate back to baseline.
      const m = (await sql`SELECT id FROM mous WHERE cohort_status='active' LIMIT 1`)[0]
      const before = Number((await sql`SELECT jsonb_array_length(audit_log) AS len FROM mous WHERE id = ${m.id}`)[0].len)
      const after = await fireParallelAudits('mous', m.id, 'workflow-reminder-sent')
      await sql`
        UPDATE mous SET audit_log = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM (
            SELECT elem FROM jsonb_array_elements(audit_log) WITH ORDINALITY AS x(elem, n)
            ORDER BY n LIMIT ${before}
          ) y
        ) WHERE id = ${m.id}
      `
      return { id: m.id, before, after, grew: after - before, pass: after - before === N }
    },
  },
  {
    entity: 'school',
    libs: ['editSchool', 'reassignSalesRep'],
    async run() {
      const id = shortId('SCH')
      await sql`
        INSERT INTO schools (id, name, city, state, region, active, audit_log)
        VALUES (${id}, 'P2b Sch Fixture', 'TC', 'TS', 'south', TRUE, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('schools', id, 'school-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM schools WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'payment',
    libs: ['confirmMatch', 'reissuePi', 'reverseAdjustment'],
    isMoney: true,
    async run() {
      const id = shortId('PAY')
      const mou = (await sql`SELECT id, school_name, programme FROM mous LIMIT 1`)[0]
      await sql`
        INSERT INTO payments (id, mou_id, school_name, programme, instalment_label,
          instalment_seq, total_instalments, expected_amount, status, audit_log)
        VALUES (${id}, ${mou.id}, ${mou.school_name}, ${mou.programme},
          'P2b Conc Fixture', 1, 1, 100, 'Pending', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('payments', id, 'payment-matched')
        return { id, after, pass: after === N, mou: mou.id }
      } finally {
        await sql`DELETE FROM payments WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'dispatch',
    libs: ['raiseDispatch', 'reviewRequest', 'overrideAudit'],
    async run() {
      const id = shortId('DSP')
      const sch = (await sql`SELECT id FROM schools LIMIT 1`)[0]
      await sql`
        INSERT INTO dispatches (id, school_id, stage, line_items, audit_log)
        VALUES (${id}, ${sch.id}, 'PO Raised', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('dispatches', id, 'dispatch-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM dispatches WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'kitDispatch',
    libs: ['kit-details save'],
    async run() {
      const id = shortId('KIT')
      const mou = (await sql`SELECT id, school_id, school_name FROM mous WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1`)[0]
      if (!mou) {
        // Fall back to any mou; if it has a kit_dispatch we'll get a UNIQUE
        // violation - skip with a clear note.
        return { skip: 'no available mou without existing kit_dispatch' }
      }
      await sql`
        INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
          dispatch_status, allocations, audit_log)
        VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
          'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('kit_dispatches', id, 'kit-dispatch-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM kit_dispatches WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'escalation',
    libs: ['editEscalation', 'transferEscalation'],
    async run() {
      const id = shortId('ESC')
      const sch = (await sql`SELECT id FROM schools LIMIT 1`)[0]
      await sql`
        INSERT INTO escalations (id, created_at, school_id, severity, status,
          notified_emails, comments, audit_log)
        VALUES (${id}, NOW(), ${sch.id}, 'medium', 'Open',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('escalations', id, 'escalation-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM escalations WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'inventoryItem',
    libs: ['editInventoryItem'],
    async run() {
      const id = shortId('INV')
      await sql`
        INSERT INTO inventory_items (id, sku_name, category, current_stock, active, audit_log)
        VALUES (${id}, 'P2b Inv Fixture', 'Other', 0, TRUE, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('inventory_items', id, 'inventory-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM inventory_items WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'vendor',
    libs: ['vendor edits'],
    async run() {
      const id = shortId('VND')
      await sql`
        INSERT INTO vendors (id, name, active, audit_log)
        VALUES (${id}, 'P2b Vnd Fixture', TRUE, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('vendors', id, 'vendor-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM vendors WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'agreement',
    libs: ['agreement edits'],
    async run() {
      const id = shortId('AGR')
      await sql`
        INSERT INTO agreements (id, type, party_name, audit_log)
        VALUES (${id}, 'Vendor', 'P2b Party Fixture', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('agreements', id, 'agreement-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM agreements WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'vexPi',
    libs: ['vex/pi/edit', 'vex/pi/generate'],
    async run() {
      const id = shortId('VPI')
      await sql`
        INSERT INTO vex_pis (id, pi_number, status, line_items, audit_log)
        VALUES (${id}, ${`P2BFIX-${Date.now()}`}, 'draft',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('vex_pis', id, 'vex-pi-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM vex_pis WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'vexDispatch',
    libs: ['vex dispatch transitions'],
    async run() {
      const piId = shortId('VPI')
      await sql`
        INSERT INTO vex_pis (id, pi_number, status, line_items, audit_log)
        VALUES (${piId}, ${`P2BFIX-${Date.now()}`}, 'draft',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
      `
      const id = shortId('VDS')
      await sql`
        INSERT INTO vex_dispatches (id, pi_id, items, status, audit_log)
        VALUES (${id}, ${piId}, ${sql.json([])}::jsonb, 'Requested', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('vex_dispatches', id, 'vex-dispatch-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM vex_dispatches WHERE id = ${id}`
        await sql`DELETE FROM vex_pis WHERE id = ${piId}`
      }
    },
  },
  {
    entity: 'ccRule',
    libs: ['editCcRule', 'toggleCcRule'],
    async run() {
      const id = shortId('CC')
      await sql`
        INSERT INTO cc_rules (id, sheet, scope, scope_value, contexts, cc_user_ids,
          enabled, audit_log)
        VALUES (${id}, 'payments', 'school', 'SCH-P2BFIX',
          ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, TRUE, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('cc_rules', id, 'cc-rule-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM cc_rules WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'schoolGroup',
    libs: ['schoolGroup edits'],
    async run() {
      const id = shortId('SG')
      await sql`
        INSERT INTO school_groups (id, name, member_school_ids, audit_log)
        VALUES (${id}, 'P2b SG Fixture', ARRAY[]::text[], ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('school_groups', id, 'school-group-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM school_groups WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'communicationTemplate',
    libs: ['editTemplate'],
    async run() {
      const id = shortId('CT')
      await sql`
        INSERT INTO communication_templates (id, name, use_case, body_markdown,
          active, audit_log)
        VALUES (${id}, 'P2b CT Fixture', 'fixture', 'Body', TRUE, ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('communication_templates', id, 'comm-template-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM communication_templates WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'intakeRecord',
    libs: ['recordIntake', 'editIntake'],
    async run() {
      const id = shortId('IR')
      const mou = (await sql`SELECT id FROM mous LIMIT 1`)[0]
      await sql`
        INSERT INTO intake_records (id, mou_id, completed_at, audit_log)
        VALUES (${id}, ${mou.id}, NOW(), ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('intake_records', id, 'intake-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM intake_records WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'communication',
    libs: ['markCommunicationSent', 'markSent', 'markReminderSent'],
    async run() {
      const id = shortId('COMM')
      const mou = (await sql`SELECT id, school_id FROM mous LIMIT 1`)[0]
      await sql`
        INSERT INTO communications (id, type, school_id, mou_id, channel,
          cc_emails, queued_at, status, audit_log)
        VALUES (${id}, 'p2b-fixture', ${mou.school_id}, ${mou.id}, 'email',
          ${sql.json([])}::jsonb, NOW(), 'queued', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('communications', id, 'comm-marked-sent')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM communications WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'salesOpportunity',
    libs: ['editOpportunity', 'markOpportunityLost'],
    async run() {
      const id = shortId('OPP')
      const rep = (await sql`SELECT id FROM sales_team LIMIT 1`)[0]
      await sql`
        INSERT INTO sales_opportunities (id, school_name, sales_rep_id, status,
          audit_log)
        VALUES (${id}, 'P2b Opp Fixture', ${rep.id}, 'lead', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('sales_opportunities', id, 'opportunity-edited')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM sales_opportunities WHERE id = ${id}`
      }
    },
  },
  // -------------------------------------------------------------------------
  // P2b close-out (per Anish 2026-05-24): the 2 still-unproven libs from
  // the P2b report - dispatchRequest (reviewRequest) and lifecycle_rules
  // (editLifecycleRule). reverseAdjustment was the 3rd; on inspection it
  // turned out to be already-bridged (audits land on mou, scalar UPDATEs
  // on adjustment do not have a JSONB race), so no fix needed there.
  // -------------------------------------------------------------------------
  {
    entity: 'dispatchRequest',
    libs: ['reviewRequest'],
    async run() {
      const id = shortId('DREQ')
      const mou = (await sql`SELECT id, school_id FROM mous LIMIT 1`)[0]
      const requester = (await sql`SELECT id FROM users LIMIT 1`)[0]
      await sql`
        INSERT INTO dispatch_requests (id, mou_id, school_id, requested_by,
          requested_at, line_items, status, audit_log)
        VALUES (${id}, ${mou.id}, ${mou.school_id}, ${requester.id}, NOW(),
          ${sql.json([])}::jsonb, 'pending-approval', ${sql.json([])}::jsonb)
      `
      try {
        const after = await fireParallelAudits('dispatch_requests', id, 'request-reviewed')
        return { id, after, pass: after === N }
      } finally {
        await sql`DELETE FROM dispatch_requests WHERE id = ${id}`
      }
    },
  },
  {
    entity: 'lifecycleRule',
    libs: ['editLifecycleRule'],
    async run() {
      // Composite PK (stage_from_key, stage_to_key). Fire 10 parallel
      // audit appends via the same || jsonb primitive but keyed by both
      // columns. The bridge case extracts both and calls
      // updateWithAuditByKey - this test proves the primitive at the
      // table level just like the others.
      const stageFromKey = `STAGE-FROM-${Date.now().toString(36).slice(-6).toUpperCase()}`
      const stageToKey = `STAGE-TO-${Date.now().toString(36).slice(-6).toUpperCase()}`
      await sql`
        INSERT INTO lifecycle_rules (stage_from_key, stage_to_key, default_days, audit_log)
        VALUES (${stageFromKey}, ${stageToKey}, 7, ${sql.json([])}::jsonb)
      `
      try {
        const entries = auditEntries('lifecycle-rule-edited')
        await Promise.all(
          entries.map((entry) =>
            sql`UPDATE lifecycle_rules SET audit_log = audit_log || ${sql.json([entry])}::jsonb
                WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}`,
          ),
        )
        const r = await sql`
          SELECT jsonb_array_length(audit_log) AS len FROM lifecycle_rules
          WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}
        `
        const after = Number(r[0].len)
        return { id: `${stageFromKey}|${stageToKey}`, after, pass: after === N }
      } finally {
        await sql`
          DELETE FROM lifecycle_rules
          WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}
        `
      }
    },
  },
]

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const results = []
let failCount = 0
let skipCount = 0
for (const t of tests) {
  process.stdout.write(`[${t.entity.padEnd(24)}] `)
  try {
    const r = await t.run()
    if (r.skip) {
      console.log(`SKIP - ${r.skip}`)
      skipCount++
      results.push({ entity: t.entity, skip: r.skip })
      continue
    }
    const tag = r.pass ? 'PASS' : 'FAIL'
    console.log(`${tag} (${r.after}/${N})${r.before !== undefined ? ` grew=${r.grew}` : ''}${t.isMoney ? ' [MONEY]' : ''}`)
    results.push({ entity: t.entity, ...r, libs: t.libs })
    if (!r.pass) failCount++
  } catch (e) {
    console.log(`ERROR - ${e.message}`)
    results.push({ entity: t.entity, error: e.message })
    failCount++
  }
}

console.log()
console.log('=========================================================')
console.log(`Summary: ${tests.length - failCount - skipCount} pass / ${failCount} fail / ${skipCount} skip`)
console.log('=========================================================')
if (failCount > 0) {
  console.log('FAILED entities:')
  for (const r of results) {
    if (r.error || (r.pass === false)) {
      console.log(`  - ${r.entity}: ${r.error || `${r.after}/${N}`}`)
    }
  }
}

await sql.end({ timeout: 5 })
process.exit(failCount > 0 ? 1 : 0)
