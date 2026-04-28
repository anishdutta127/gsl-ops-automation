#!/usr/bin/env node

/*
 * W4-G.3 Phase 2: Inventory backfill MUTATION.
 *
 * Reads scripts/w4g-inventory-import-verification-2026-04-28.json (the
 * Phase 1 read-only output Anish row-by-row signed off on 2026-04-28)
 * and writes InventoryItem records into src/data/inventory_items.json
 * plus the _fixtures mirror. Audit per record:
 * 'inventory-imported-from-mastersheet' with mastersheetSourceName +
 * confidence + reasoning.
 *
 * Anish's resolutions for the 3 MANUAL-REVIEW rows + the 17 AUTO-
 * IMPORT bulk-approvals + 2 placeholder rows + 1 skipped header are
 * encoded in ANISH_RESOLUTIONS below.
 *
 * Output:
 *   - 20 InventoryItem records written
 *   - 1 row skipped (the 1330 header; D-033)
 *   - Breakdown: Cretile 8 / TinkRworks 10 / Other 2
 *   - 18 active + 2 sunset (Tinkrsynth + Tinkrsynth Mixer PCB)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const VERIFICATION_PATH = resolve(REPO_ROOT, 'scripts/w4g-inventory-import-verification-2026-04-28.json')
const ITEMS_PATH = resolve(REPO_ROOT, 'src/data/inventory_items.json')
const FIXTURES_ITEMS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/inventory_items.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4g-inventory-import-mutation-report-2026-04-28.json')
const TS = '2026-04-28T18:00:00.000Z'
const ACTOR = 'system-w4g-import'

// ------------------------------------------------------------------
// Anish row-by-row resolutions (locked sign-off 2026-04-28).
// Keyed by `${section}#${rowNumber}` for sheet rows; placeholder rows
// keyed by `Placeholder#${invId}` since they have no rowNumber.
// ------------------------------------------------------------------
const ANISH_RESOLUTIONS = {
  // P3 Project Kit: AUTO-IMPORT real SKU (active: true).
  'TinkRworks#6': {
    decision: 'IMPORT',
    active: true,
    auditNote: 'Imported from Mastersheet; no Dispatch lineItem corroboration at backfill. First dispatch using this SKU surfaces as new operational pattern.',
    confidence: 'anish-resolved-no-corroboration-real-sku',
  },
  // Tinkrsynth: AUTO-IMPORT with active: false (sunset; D-036).
  'TinkRworks#12': {
    decision: 'IMPORT',
    active: false,
    auditNote: 'Tail-end stock (3 units); sunset SKU pending Misba/Pradeep operational decision on whether to clear remaining stock or write off (D-036).',
    confidence: 'anish-resolved-sunset-tail-end-stock',
  },
  // Tinkrsynth Mixer PCB: AUTO-IMPORT with active: false; preserve
  // verbatim Mastersheet inline note.
  'TinkRworks#13': {
    decision: 'IMPORT',
    active: false,
    overrideNotes: "we don't have this in our inventory",
    auditNote: 'Sunset at W4-G backfill per Mastersheet operator note ("we don\'t have this in our inventory").',
    confidence: 'anish-resolved-sunset-explicit-mastersheet-note',
  },
}

// ------------------------------------------------------------------
// Audit + record builders
// ------------------------------------------------------------------
function buildItem({ verification, decision, ts }) {
  const { mapping } = verification
  if (!mapping) throw new Error(`No mapping on verification entry: ${JSON.stringify(verification)}`)
  const audit = {
    timestamp: ts,
    user: ACTOR,
    action: 'inventory-imported-from-mastersheet',
    after: {
      invId: mapping.invId,
      skuName: mapping.skuName,
      category: mapping.category,
      cretileGrade: mapping.cretileGrade,
      currentStock: mapping.proposedStock,
      mastersheetSourceName: mapping.mastersheetSourceName,
      active: decision.active,
      confidence: decision.confidence ?? verification.recommendation,
    },
    notes: decision.auditNote ?? verification.reasoning,
  }
  const item = {
    id: mapping.invId,
    skuName: mapping.skuName,
    category: mapping.category,
    cretileGrade: mapping.cretileGrade,
    mastersheetSourceName: mapping.mastersheetSourceName,
    currentStock: mapping.proposedStock,
    reorderThreshold: null,
    notes: decision.overrideNotes ?? mapping.proposedNotes ?? null,
    active: decision.active,
    lastUpdatedAt: ts,
    lastUpdatedBy: ACTOR,
    auditLog: [audit],
  }
  return item
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const verification = JSON.parse(readFileSync(VERIFICATION_PATH, 'utf-8'))
  const existing = JSON.parse(readFileSync(ITEMS_PATH, 'utf-8'))
  if (existing.length > 0) {
    throw new Error(
      `inventory_items.json already has ${existing.length} records; W4-G.3 mutation expects empty seed. Bailing to avoid duplicate inserts.`,
    )
  }

  const result = {
    generatedAt: TS,
    purpose: 'W4-G.3 Phase 2 mutation report. Anish-signed verification table drives every decision; ANISH_RESOLUTIONS hardcodes the 3 MANUAL-REVIEW resolutions.',
    created: [],
    skipped: [],
    breakdown: {
      cretile: 0,
      tinkrworks: 0,
      other: 0,
      active: 0,
      sunset: 0,
      withDispatchCorroboration: 0,
    },
  }

  const items = []
  const existingIds = new Set()

  for (const row of verification.verifications) {
    if (row.recommendation === 'SKIP-HEADER') {
      result.skipped.push({
        section: row.section,
        rowNumber: row.rowNumber,
        mastersheetSourceName: row.mastersheetSourceName,
        reason: row.reasoning,
      })
      continue
    }

    const key = row.section === 'Placeholder'
      ? `Placeholder#${row.mapping?.invId ?? '(unknown)'}`
      : `${row.section}#${row.rowNumber}`
    const resolution = ANISH_RESOLUTIONS[key] ?? null

    let decision
    if (resolution) {
      if (resolution.decision === 'QUARANTINE') {
        result.skipped.push({
          section: row.section,
          rowNumber: row.rowNumber,
          mastersheetSourceName: row.mastersheetSourceName,
          reason: resolution.auditNote ?? 'QUARANTINE per Anish resolution',
        })
        continue
      }
      decision = {
        active: resolution.active ?? true,
        auditNote: resolution.auditNote,
        confidence: resolution.confidence,
        overrideNotes: resolution.overrideNotes,
      }
    } else if (row.recommendation === 'AUTO-IMPORT') {
      decision = {
        active: true,
        auditNote: row.reasoning,
        confidence: 'auto-import-implicit-anish-approval',
        overrideNotes: undefined,
      }
    } else {
      // MANUAL-REVIEW with no Anish-resolution should not happen; bail.
      throw new Error(
        `MANUAL-REVIEW row ${key} has no ANISH_RESOLUTIONS entry. Add one before re-running.`,
      )
    }

    const item = buildItem({ verification: row, decision, ts: TS })
    if (existingIds.has(item.id)) {
      throw new Error(
        `Duplicate InventoryItem.id ${item.id}; bailing to avoid clobber.`,
      )
    }
    existingIds.add(item.id)
    items.push(item)

    result.created.push({
      id: item.id,
      skuName: item.skuName,
      category: item.category,
      cretileGrade: item.cretileGrade,
      currentStock: item.currentStock,
      active: item.active,
      mastersheetSourceName: item.mastersheetSourceName,
      corroboration: row.corroboration ?? null,
    })

    // Breakdown counters.
    if (item.category === 'Cretile') result.breakdown.cretile += 1
    else if (item.category === 'TinkRworks') result.breakdown.tinkrworks += 1
    else result.breakdown.other += 1
    if (item.active) result.breakdown.active += 1
    else result.breakdown.sunset += 1
    if ((row.corroboration ?? 0) > 0) result.breakdown.withDispatchCorroboration += 1
  }

  // Sort items by category then id for deterministic output.
  items.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.id.localeCompare(b.id)
  })

  writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_ITEMS_PATH, JSON.stringify(items, null, 2) + '\n', 'utf-8')
  writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')

  console.log('')
  console.log(`[w4g.3.mut] created:    ${result.created.length} InventoryItem records`)
  console.log(`[w4g.3.mut] skipped:    ${result.skipped.length}`)
  console.log(`[w4g.3.mut] breakdown:`)
  console.log(`  Cretile:                   ${result.breakdown.cretile}`)
  console.log(`  TinkRworks:                ${result.breakdown.tinkrworks}`)
  console.log(`  Other:                     ${result.breakdown.other}`)
  console.log(`  Active:                    ${result.breakdown.active}`)
  console.log(`  Sunset:                    ${result.breakdown.sunset}`)
  console.log(`  With Dispatch corroboration: ${result.breakdown.withDispatchCorroboration}`)
  console.log(`[w4g.3.mut] report: ${REPORT_PATH}`)
}

main()
