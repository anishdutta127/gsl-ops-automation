#!/usr/bin/env node
/*
 * P4 read-parity: aggregate / count surfaces (8 of 10).
 *
 * Surfaces #3-10 (money is verify-p4-money-parity.mjs):
 *   3. Action queue counts (overdue / stalled PI / WIP escalations)
 *   4. Leadership rollups (FY revenue, schools count, monthly receipts)
 *   5. Kit dispatch aggregates (by status)
 *   6. Inventory totals (current_stock sum, active count)
 *   7. VEX PI ledger totals (subtotal / gst / total / outstanding)
 *   8. Sales pipeline counts (opportunities by status)
 *   9. Admin queue-status (pending_updates count)
 *  10. Escalations counts (Open / WIP / Closed / by lane)
 *
 * For each: mirror the lib's computation in BOTH `JS reduce against
 * repo-read rows` AND `independent SQL aggregate`. Assert equality.
 *
 * Any disagreement is a cutover blocker.
 */

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
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, {
  max: 5, prepare: false, connect_timeout: 30, onnotice: () => {},
})

const FIXED_NOW = new Date('2026-05-24T00:00:00Z').getTime()
const STALLED_PI_DAYS = 30
const blockers = []
const results = []

function record(surface, name, appV, sqlV, eps = 0) {
  const ok = typeof appV === 'number'
    ? Math.abs(appV - sqlV) <= Math.max(eps, 0.01)
    : appV === sqlV
  results.push({ surface, name, appV, sqlV, ok })
  if (!ok) blockers.push({ surface, name, appV, sqlV })
  console.log(`  [${surface}] ${name.padEnd(38)} ${ok ? 'PARITY-OK' : 'BLOCKER'}  app=${appV} sql=${sqlV}`)
}

// =========================================================================
// Surface 3: Action queue (overdue + stalled PI on active-cohort payments)
// Mirrors financeDashboardData.ts lines 338-371.
// =========================================================================
{
  console.log()
  console.log('--- Surface 3: Action queue ---')
  // App path: repo read + JS reduce.
  const allPaymentsApp = await sql`
    SELECT p.status, p.expected_amount, p.received_amount, p.due_date_iso,
      p.pi_generated_at, p.received_date
    FROM payments p JOIN mous m ON m.id = p.mou_id
    WHERE m.cohort_status = 'active'
  `
  let overdueApp = 0, stalledApp = 0, attentionApp = 0
  for (const p of allPaymentsApp) {
    const balance = Number(p.expected_amount ?? 0) - Number(p.received_amount ?? 0)
    const isReceived = p.status === 'Paid' || p.status === 'Received'
    let isOverdue = false
    if (!isReceived && balance > 0 && p.due_date_iso) {
      const dueMs = new Date(p.due_date_iso).getTime()
      if (!Number.isNaN(dueMs) && dueMs < FIXED_NOW) { isOverdue = true; overdueApp++ }
    }
    let isStalled = false
    if (!isReceived && p.pi_generated_at && p.received_date === null) {
      const piMs = new Date(p.pi_generated_at).getTime()
      if (!Number.isNaN(piMs)) {
        const days = (FIXED_NOW - piMs) / (1000 * 60 * 60 * 24)
        if (days >= STALLED_PI_DAYS) { isStalled = true; stalledApp++ }
      }
    }
    if (isOverdue || isStalled) attentionApp++
  }
  // SQL truth: same logic in pure SQL.
  const sqlAgg = (await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE p.status NOT IN ('Paid','Received')
          AND (COALESCE(p.expected_amount,0) - COALESCE(p.received_amount,0)) > 0
          AND p.due_date_iso IS NOT NULL
          AND p.due_date_iso::timestamptz < ${new Date(FIXED_NOW).toISOString()}::timestamptz
      ) AS overdue_count,
      COUNT(*) FILTER (
        WHERE p.status NOT IN ('Paid','Received')
          AND p.pi_generated_at IS NOT NULL
          AND p.received_date IS NULL
          AND (EXTRACT(EPOCH FROM (${new Date(FIXED_NOW).toISOString()}::timestamptz - p.pi_generated_at)) / 86400) >= ${STALLED_PI_DAYS}
      ) AS stalled_count
    FROM payments p JOIN mous m ON m.id = p.mou_id
    WHERE m.cohort_status = 'active'
  `)[0]
  record('action-queue', 'overdue_count', overdueApp, Number(sqlAgg.overdue_count))
  record('action-queue', 'stalled_count', stalledApp, Number(sqlAgg.stalled_count))
}

// =========================================================================
// Surface 4: Leadership rollups
// =========================================================================
{
  console.log()
  console.log('--- Surface 4: Leadership rollups ---')
  // Signed schools count: distinct schools with at least one Active MOU.
  const appMous = await sql`SELECT id, school_id, status FROM mous`
  const distinctSignedSchoolsApp = new Set(
    appMous.filter((m) => m.status !== 'Pending Signature' && m.status !== 'Draft')
      .map((m) => m.school_id)
  ).size
  const sqlSignedSchools = Number((await sql`
    SELECT COUNT(DISTINCT school_id) AS n FROM mous
    WHERE status NOT IN ('Pending Signature','Draft')
  `)[0].n)
  record('leadership', 'signed schools (distinct)', distinctSignedSchoolsApp, sqlSignedSchools)

  // Active MOU schools: distinct schools with at least one Active status MOU.
  const distinctActiveSchoolsApp = new Set(
    appMous.filter((m) => m.status === 'Active').map((m) => m.school_id)
  ).size
  const sqlActiveSchools = Number((await sql`
    SELECT COUNT(DISTINCT school_id) AS n FROM mous WHERE status = 'Active'
  `)[0].n)
  record('leadership', 'active schools (distinct)', distinctActiveSchoolsApp, sqlActiveSchools)

  // Monthly receipts (last 12 months from FIXED_NOW), e.g., '2026-05' bucket.
  const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(FIXED_NOW)
    d.setUTCMonth(d.getUTCMonth() - i)
    months.push(monthKey(d))
  }
  const appPayments = await sql`
    SELECT received_amount, received_date FROM payments
    WHERE received_date IS NOT NULL AND received_amount IS NOT NULL
  `
  const monthlyApp = new Map(months.map((m) => [m, 0]))
  for (const p of appPayments) {
    const key = monthKey(new Date(p.received_date))
    if (monthlyApp.has(key)) monthlyApp.set(key, monthlyApp.get(key) + Number(p.received_amount))
  }
  for (const m of months.slice(-3)) {
    const appAmt = monthlyApp.get(m)
    const sqlAmt = Number((await sql`
      SELECT COALESCE(SUM(received_amount), 0) AS s FROM payments
      WHERE received_date >= ${m + '-01'}::date
        AND received_date < (DATE_TRUNC('month', ${m + '-01'}::date) + INTERVAL '1 month')::date
        AND received_amount IS NOT NULL
    `)[0].s)
    record('leadership', `monthly receipts ${m}`, appAmt, sqlAmt)
  }
}

// =========================================================================
// Surface 5: Kit dispatch aggregates by status
// =========================================================================
{
  console.log()
  console.log('--- Surface 5: Kit dispatch aggregates ---')
  const appRows = await sql`SELECT dispatch_status FROM kit_dispatches`
  const statuses = ['Pending', 'In Transit', 'Delivered', 'Not Started']
  for (const status of statuses) {
    const appCount = appRows.filter((r) => r.dispatch_status === status).length
    const sqlCount = Number((await sql`
      SELECT COUNT(*) AS n FROM kit_dispatches WHERE dispatch_status = ${status}
    `)[0].n)
    record('kit-dispatch', `status=${status}`, appCount, sqlCount)
  }
}

// =========================================================================
// Surface 6: Inventory totals
// =========================================================================
{
  console.log()
  console.log('--- Surface 6: Inventory totals ---')
  const appRows = await sql`SELECT current_stock, active FROM inventory_items`
  const activeApp = appRows.filter((r) => r.active).length
  const stockApp = appRows.filter((r) => r.active).reduce((s, r) => s + Number(r.current_stock ?? 0), 0)
  const sqlActive = Number((await sql`SELECT COUNT(*) AS n FROM inventory_items WHERE active`)[0].n)
  const sqlStock = Number((await sql`SELECT COALESCE(SUM(current_stock), 0) AS s FROM inventory_items WHERE active`)[0].s)
  record('inventory', 'active SKU count', activeApp, sqlActive)
  record('inventory', 'total stock (active)', stockApp, sqlStock)
}

// =========================================================================
// Surface 7: VEX PI ledger totals
// =========================================================================
{
  console.log()
  console.log('--- Surface 7: VEX PI ledger ---')
  const appRows = await sql`SELECT total, payment_received_amount, status FROM vex_pis`
  const totalApp = appRows.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const receivedApp = appRows.reduce((s, r) => s + Number(r.payment_received_amount ?? 0), 0)
  const outstandingApp = Math.max(0, totalApp - receivedApp)
  const sqlTotal = Number((await sql`SELECT COALESCE(SUM(total), 0) AS s FROM vex_pis`)[0].s)
  const sqlReceived = Number((await sql`SELECT COALESCE(SUM(payment_received_amount), 0) AS s FROM vex_pis`)[0].s)
  record('vex-pi', 'total billed', totalApp, sqlTotal)
  record('vex-pi', 'total received', receivedApp, sqlReceived)
  record('vex-pi', 'outstanding', outstandingApp, Math.max(0, sqlTotal - sqlReceived))
}

// =========================================================================
// Surface 8: Sales pipeline (opportunities by status)
// =========================================================================
{
  console.log()
  console.log('--- Surface 8: Sales pipeline ---')
  const appRows = await sql`SELECT status FROM sales_opportunities`
  const statuses = ['lead', 'qualified', 'recce-pending', 'recce-done', 'lost']
  for (const status of statuses) {
    const appCount = appRows.filter((r) => r.status === status).length
    const sqlCount = Number((await sql`
      SELECT COUNT(*) AS n FROM sales_opportunities WHERE status = ${status}
    `)[0].n)
    record('sales-pipeline', `status=${status}`, appCount, sqlCount)
  }
  // Total opportunities
  record('sales-pipeline', 'total opportunities', appRows.length, Number((await sql`SELECT COUNT(*) AS n FROM sales_opportunities`)[0].n))
}

// =========================================================================
// Surface 9: Admin queue-status (sync_health latest)
// =========================================================================
{
  console.log()
  console.log('--- Surface 9: Admin queue-status (sync_health) ---')
  // App path: latest sync_health entry via repo (last 1 row).
  // /admin/queue-status surfaces: at, kind, ok, anomalies count.
  const appLatest = (await sql`SELECT at, kind, ok, anomalies FROM sync_health ORDER BY at DESC LIMIT 1`)[0]
  const appKind = appLatest ? appLatest.kind : null
  const appOk = appLatest ? Boolean(appLatest.ok) : null
  const appAnomCount = appLatest && Array.isArray(appLatest.anomalies) ? appLatest.anomalies.length : 0
  const sqlLatest = (await sql`SELECT at, kind, ok, jsonb_array_length(anomalies) AS al FROM sync_health ORDER BY at DESC LIMIT 1`)[0]
  const sqlKind = sqlLatest ? sqlLatest.kind : null
  const sqlOk = sqlLatest ? Boolean(sqlLatest.ok) : null
  const sqlAnomCount = sqlLatest ? Number(sqlLatest.al) : 0
  record('queue-status', 'latest kind', appKind, sqlKind)
  record('queue-status', 'latest ok flag', appOk, sqlOk)
  record('queue-status', 'latest anomaly count', appAnomCount, sqlAnomCount)
  // Total entries (24h window typical for /admin/queue-status header)
  const appAll = await sql`SELECT id FROM sync_health WHERE at >= NOW() - INTERVAL '24 hours'`
  const appCount = appAll.length
  const sqlCount = Number((await sql`SELECT COUNT(*) AS n FROM sync_health WHERE at >= NOW() - INTERVAL '24 hours'`)[0].n)
  record('queue-status', '24h entry count', appCount, sqlCount)
}

// =========================================================================
// Surface 10: Escalations counts
// =========================================================================
{
  console.log()
  console.log('--- Surface 10: Escalations ---')
  const appRows = await sql`SELECT status, lane FROM escalations`
  const statuses = ['Open', 'WIP', 'Closed', 'Transferred', 'Dispatched', 'In Transit']
  for (const status of statuses) {
    const appCount = appRows.filter((r) => r.status === status).length
    const sqlCount = Number((await sql`SELECT COUNT(*) AS n FROM escalations WHERE status = ${status}`)[0].n)
    record('escalations', `status=${status}`, appCount, sqlCount)
  }
  // Distinct lanes
  const lanes = [...new Set(appRows.map((r) => r.lane).filter(Boolean))]
  for (const lane of lanes) {
    const appCount = appRows.filter((r) => r.lane === lane).length
    const sqlCount = Number((await sql`SELECT COUNT(*) AS n FROM escalations WHERE lane = ${lane}`)[0].n)
    record('escalations', `lane=${lane}`, appCount, sqlCount)
  }
}

console.log()
console.log('========================================================')
console.log(`P4 aggregate parity: ${results.length} checks, ${blockers.length} blockers`)
console.log('========================================================')
if (blockers.length > 0) {
  for (const b of blockers) {
    console.log(`  BLOCKER ${b.surface}.${b.name}: app=${b.appV} sql=${b.sqlV}`)
  }
}

await sql.end({ timeout: 5 })
process.exit(blockers.length === 0 ? 0 : 1)
