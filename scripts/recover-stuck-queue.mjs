#!/usr/bin/env node
/*
 * One-time idempotent recovery of the stuck pending_updates.json entries
 * (gate-stuck-data, 2026-06-23). AUTHORISED prod DB write.
 *
 * The drain cron is disabled ("postgres is truth source"), so these writes
 * fell into a dead-letter queue and never reached postgres. This replays them
 * into postgres by NATURAL KEY (never blind-insert; run-twice safe):
 *   - vexProduct.create  -> INSERT ... ON CONFLICT (part_number) DO UPDATE
 *   - inventoryItem.create -> INSERT ... ON CONFLICT (id) DO UPDATE
 *   - mou.update         -> UPDATE mous SET <student-count delta> WHERE id=...
 *
 * Default = DRY RUN (no writes). Pass --apply to write (a timestamped backup
 * of the affected rows is dumped first). Idempotent: targets are fixed values,
 * so a second run is a no-op-equivalent.
 *
 * Usage:
 *   node scripts/recover-stuck-queue.mjs            # dry run
 *   node scripts/recover-stuck-queue.mjs --apply    # backup + apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
// Fixed recovery timestamp (idempotency: a re-run writes the same audit entry).
const RECOVERED_AT = '2026-06-23T00:00:00.000Z'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const queue = JSON.parse(readFileSync('src/data/pending_updates.json', 'utf8'))
console.log(`pending_updates.json: ${queue.length} entries`)

// --- collapse 7 entries into distinct recoveries by natural key ---
const vexByPart = new Map(), invById = new Map(), mouById = new Map()
let unexpected = []
for (const e of queue) {
  const p = e.payload || {}
  if (e.entity === 'vexProduct' && e.operation === 'create') vexByPart.set(p.partNumber, p)
  else if (e.entity === 'inventoryItem' && e.operation === 'create') invById.set(p.id, p)
  else if (e.entity === 'mou' && e.operation === 'update') mouById.set(p.id, p)
  else unexpected.push(`${e.entity}.${e.operation} (${p.partNumber || p.id})`)
}
if (unexpected.length) {
  console.error('UNEXPECTED queue entries (not in the authorised 4-target recovery):', unexpected)
  console.error('STOP: queue shape changed. Re-review before recovering.')
  process.exit(1)
}
console.log(`distinct: ${vexByPart.size} vexProduct, ${invById.size} inventoryItem, ${mouById.size} mou.update`)

const recoveryAudit = (qBy, entityLabel) => ({
  timestamp: RECOVERED_AT, user: 'sync-recovery', action: 'recovered-from-queue',
  notes: `Recovered ${entityLabel} from pending_updates.json (dead-letter; drain cron disabled). Originally queued by ${qBy}.`,
})

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // --- inspect current state + consistency notes ---
  console.log('\n=== current postgres state (before) ===')
  for (const part of vexByPart.keys()) {
    const r = await sql`SELECT part_number, name FROM vex_products WHERE part_number = ${part}`
    console.log(`vex_products ${part}: ${r.length ? 'EXISTS -> will UPDATE' : 'ABSENT -> will INSERT'}`)
  }
  for (const id of invById.keys()) {
    const r = await sql`SELECT id FROM inventory_items WHERE id = ${id}`
    console.log(`inventory_items ${id}: ${r.length ? 'EXISTS -> will UPDATE' : 'ABSENT -> will INSERT'}`)
  }
  for (const [id, p] of mouById) {
    const r = await sql`SELECT id, students_actual, student_count_event_ids FROM mous WHERE id = ${id}`
    if (!r.length) { console.log(`mous ${id}: ABSENT -> will SKIP (cannot update a missing MOU)`); continue }
    console.log(`mous ${id}: students_actual ${r[0].students_actual} -> ${p.studentsActual}; event_ids ${JSON.stringify(r[0].student_count_event_ids)} -> ${JSON.stringify(p.studentCountEventIds)}`)
    for (const sce of (p.studentCountEventIds || [])) {
      const s = await sql`SELECT id FROM student_count_events WHERE id = ${sce}`
      console.log(`   referenced ${sce}: ${s.length ? 'present in student_count_events' : 'MISSING (dangling ref note)'}`)
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete. No writes. Re-run with --apply to back up + apply.')
    process.exit(0)
  }

  // --- backup affected rows ---
  const ts = RECOVERED_AT.replace(/[:.]/g, '-')
  mkdirSync('.recovery-backup', { recursive: true })
  const backup = { at: new Date().toISOString?.() ?? RECOVERED_AT, vex_products: [], inventory_items: [], mous: [] }
  for (const part of vexByPart.keys()) backup.vex_products.push(...(await sql`SELECT * FROM vex_products WHERE part_number = ${part}`))
  for (const id of invById.keys()) backup.inventory_items.push(...(await sql`SELECT * FROM inventory_items WHERE id = ${id}`))
  for (const id of mouById.keys()) backup.mous.push(...(await sql`SELECT * FROM mous WHERE id = ${id}`))
  const backupPath = join('.recovery-backup', `stuck-recovery-${ts}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\nbackup written: ${backupPath} (vex=${backup.vex_products.length} inv=${backup.inventory_items.length} mous=${backup.mous.length})`)

  // --- apply in a transaction ---
  await sql.begin(async (tx) => {
    for (const [part, p] of vexByPart) {
      await tx`
        INSERT INTO vex_products (part_number, name, default_unit_price, active, version)
        VALUES (${p.partNumber}, ${p.name}, ${p.defaultUnitPrice ?? null}, ${!!p.active}, 1)
        ON CONFLICT (part_number) DO UPDATE SET
          name = EXCLUDED.name, default_unit_price = EXCLUDED.default_unit_price, active = EXCLUDED.active
      `
      console.log(`applied vex_products ${part}`)
    }
    for (const [id, p] of invById) {
      const audit = [...(Array.isArray(p.auditLog) ? p.auditLog : []), recoveryAudit(p.lastUpdatedBy ?? 'anita.c', 'inventory item')]
      await tx`
        INSERT INTO inventory_items (id, sku_name, category, cretile_grade, mastersheet_source_name,
          current_stock, reorder_threshold, notes, active, last_updated_at, last_updated_by,
          import_notes, audit_log)
        VALUES (${p.id}, ${p.skuName}, ${p.category}, ${p.cretileGrade ?? null}, ${p.mastersheetSourceName ?? null},
          ${p.currentStock ?? 0}, ${p.reorderThreshold ?? null}, ${p.notes ?? null}, ${!!p.active},
          ${p.lastUpdatedAt || null}, ${p.lastUpdatedBy || null}, ${p.importNotes ?? null},
          ${tx.json(audit)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          sku_name = EXCLUDED.sku_name, category = EXCLUDED.category, current_stock = EXCLUDED.current_stock,
          active = EXCLUDED.active, audit_log = EXCLUDED.audit_log
      `
      console.log(`applied inventory_items ${id}`)
    }
    for (const [id, p] of mouById) {
      const exists = await tx`SELECT 1 FROM mous WHERE id = ${id}`
      if (!exists.length) { console.log(`SKIP mous ${id} (absent)`); continue }
      const audit = [...(Array.isArray(p.auditLog) ? p.auditLog : []), recoveryAudit(p.auditLog?.[1]?.user ?? 'anita.c', 'MOU student-count change')]
      await tx`
        UPDATE mous SET
          students_actual = ${p.studentsActual ?? null},
          student_count_event_ids = ${tx.json(p.studentCountEventIds ?? [])}::jsonb,
          audit_log = ${tx.json(audit)}::jsonb
        WHERE id = ${id}
      `
      console.log(`applied mous ${id}`)
    }
  })
  console.log('\nAPPLY complete (transaction committed).')
} catch (err) {
  console.error('RECOVERY FAILED (rolled back if mid-transaction):', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
