#!/usr/bin/env node

/*
 * W4-G.2 Phase 1: Inventory backfill VERIFICATION TABLE.
 *
 * READ-ONLY. No data mutation. Produces a per-row verification table
 * for Anish to review before any InventoryItem records land in
 * `src/data/inventory_items.json`.
 *
 *   Input:
 *     ops-data/Mastersheet-Implementation_-_AnishD.xlsx
 *       - "Current Inventory" sheet
 *       - 17 rows, 10 cols, two adjacent sections:
 *         Cretile (cols B-D) + TinkRworks (cols E-G).
 *
 *   Output (read-only):
 *     scripts/w4g-inventory-import-verification-2026-04-28.json
 *     scripts/w4g-inventory-import-verification-2026-04-28.csv
 *
 * Independence axes vs the prior locked-discipline scripts:
 *   - W4-C.7 used pure-name jaccard against MOU canonical list.
 *   - W4-D.8 used sheet-aware AY heuristic against active 51 + archived 92.
 *   - W4-E.2 used city + location-weighted token match against schools.json.
 *   - W4-E.3 audited cc_rules scope + contexts against SPOC DB top-of-sheet.
 *   - W4-G.2 uses SKU-name normalisation (verbose Mastersheet -> simple
 *     Dispatch-aligned) PLUS Dispatch lineItem cross-reference (count of
 *     existing dispatches that already use the proposed simple skuName).
 *     The Dispatch corroboration is the high-confidence signal: when a
 *     SKU is already in the dispatch vocabulary, the inventory mapping
 *     is operationally proven.
 *
 * Per Anish W4-G.2 spec:
 *   - The "TinkRworks - Reusable Kits 1330" header row at sheet row 4
 *     is NOT a SKU; it is an operator note that does not reconcile
 *     with the column sum. Skipped + flagged in the report's notes
 *     section as a D-033 reference.
 *   - Two placeholder rows added programmatically (Push Pull Pin +
 *     Steam Academy): in the Dispatch vocabulary but absent from
 *     Mastersheet. AUTO-IMPORT with currentStock: 0 + audit note.
 *   - The Dispatch placeholder skuName "Legacy single-line item
 *     (pre-W4-D)" is filtered out of corroboration counts so it does
 *     not artificially inflate any SKU's confidence signal.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const MASTERSHEET_PATH = resolve(REPO_ROOT, 'ops-data/Mastersheet-Implementation_-_AnishD.xlsx')
const DISPATCHES_PATH = resolve(REPO_ROOT, 'src/data/dispatches.json')
const REPORT_JSON = resolve(REPO_ROOT, 'scripts/w4g-inventory-import-verification-2026-04-28.json')
const REPORT_CSV = resolve(REPO_ROOT, 'scripts/w4g-inventory-import-verification-2026-04-28.csv')

// ------------------------------------------------------------------
// Verbose Mastersheet name -> simple Dispatch-aligned skuName mapping.
// Each entry includes the proposed InventoryItem.id (kebab-cased
// suffix) and the category. Cretile per-grade rows are handled
// separately via the section detector.
// ------------------------------------------------------------------
const TINKR_NAME_MAP = [
  {
    pattern: /launch\s*pad/i,
    skuName: 'Launchpad',
    invId: 'INV-LAUNCHPAD',
    category: 'TinkRworks',
  },
  {
    pattern: /tinkrpy\b|tinkr\s*python/i,
    skuName: 'Tinkrpython',
    invId: 'INV-TINKRPYTHON',
    category: 'TinkRworks',
  },
  {
    pattern: /tinkrbot\s*explorer|tinkr\s*explorer/i,
    skuName: 'Tinkrexplorer',
    invId: 'INV-TINKREXPLORER',
    category: 'TinkRworks',
  },
  {
    pattern: /tinkrbot\s*scout/i,
    skuName: 'TinkrBotScout',
    invId: 'INV-TINKRBOTSCOUT',
    category: 'TinkRworks',
  },
  {
    pattern: /pampered\s*plant/i,
    skuName: 'Pampered Plant',
    invId: 'INV-PAMPERED-PLANT',
    category: 'TinkRworks',
  },
  {
    pattern: /smart\s*lamp/i,
    skuName: 'Smart Lamp',
    invId: 'INV-SMART-LAMP',
    category: 'TinkRworks',
  },
  {
    pattern: /tech[\s-]?a[\s-]?sketch/i,
    skuName: 'Tech A Sketch',
    invId: 'INV-TECH-A-SKETCH',
    category: 'TinkRworks',
  },
  {
    pattern: /tinkrsynth\s*mixer\s*pcb/i,
    skuName: 'Tinkrsynth Mixer PCB',
    invId: 'INV-TINKRSYNTH-MIXER-PCB',
    category: 'TinkRworks',
  },
  {
    pattern: /tinkrsynth/i,
    skuName: 'Tinkrsynth',
    invId: 'INV-TINKRSYNTH',
    category: 'TinkRworks',
  },
  {
    pattern: /p3\s*project\s*kit/i,
    skuName: 'P3 Project Kit',
    invId: 'INV-P3-PROJECT-KIT',
    category: 'TinkRworks',
  },
]

const DISPATCH_PLACEHOLDER = 'Legacy single-line item (pre-W4-D)'

// ------------------------------------------------------------------
// Mastersheet xlsx reader (Python child process; mirrors the W4-D.8
// + W4-E.2 pattern).
// ------------------------------------------------------------------
function readInventorySheet() {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(r'${MASTERSHEET_PATH.replace(/\\/g, '/')}', data_only=True)
ws = wb['Current Inventory']

rows = []
notes = []
for r in range(1, ws.max_row + 1):
    rec = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(r, c).value
        if v is not None:
            rec[c] = v
    if not rec: continue
    rows.append({'rowNumber': r, 'cells': rec})

sys.stdout.write(json.dumps({'rows': rows}, ensure_ascii=False, default=str))
`
  const stdout = execFileSync('python', ['-c', py], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  })
  return JSON.parse(stdout).rows
}

// ------------------------------------------------------------------
// Per-row classifier
// ------------------------------------------------------------------
function classifyTinkRRow(name, stock, dispatchCorrobByName, sourcingNotes) {
  // 1. Header row "TinkRworks - Reusable Kits 1330": skipped per Anish W4-G.2 spec.
  if (/tinkrworks\s*-\s*resu/i.test(String(name))) {
    return {
      recommendation: 'SKIP-HEADER',
      reasoning: 'Section header row; not a SKU. The 1330 figure does not reconcile with the column sum (~7243); flagged as D-033 for Misba/Pradeep round-2 clarification.',
      mapping: null,
    }
  }

  // 2. Look up the verbose -> simple SKU mapping.
  const matched = TINKR_NAME_MAP.find((m) => m.pattern.test(String(name)))
  if (!matched) {
    return {
      recommendation: 'QUARANTINE',
      reasoning: `Verbose name "${name}" did not match any TINKR_NAME_MAP pattern. Add a normalisation rule and re-run if Anish recognises this SKU.`,
      mapping: null,
    }
  }

  const mapping = {
    skuName: matched.skuName,
    invId: matched.invId,
    category: matched.category,
    cretileGrade: null,
    mastersheetSourceName: name,
    proposedStock: typeof stock === 'number' ? stock : 0,
  }

  // 3. Dispatch corroboration count.
  const corroboration = dispatchCorrobByName.get(matched.skuName) ?? 0

  // 4. Sunset detection (Mastersheet inline note "we don't have this").
  const isSunset = sourcingNotes.some((n) =>
    /we don.?t have this/i.test(String(n)),
  )

  if (isSunset) {
    return {
      recommendation: 'MANUAL-REVIEW',
      reasoning: `Mastersheet inline note: "we don't have this in our inventory". Anish picks: AUTO-IMPORT with active=false (sunset SKU; preserves audit trail) OR QUARANTINE (drop entirely).`,
      mapping,
      corroboration,
      sunsetCandidate: true,
    }
  }

  if (corroboration === 0) {
    return {
      recommendation: 'MANUAL-REVIEW',
      reasoning: `No Dispatch corroboration: ${matched.skuName} does not appear in any of the 27 existing Dispatch records. Anish picks: AUTO-IMPORT (treat as real SKU; will be used by future dispatches) OR active=false (sunset) OR QUARANTINE.`,
      mapping,
      corroboration,
      sunsetCandidate: false,
    }
  }

  return {
    recommendation: 'AUTO-IMPORT',
    reasoning: `Dispatch corroboration: ${corroboration} existing Dispatch records use skuName "${matched.skuName}". Mastersheet stock ${mapping.proposedStock} units imports cleanly.`,
    mapping,
    corroboration,
    sunsetCandidate: false,
  }
}

function classifyCretileRow(name, grade, stock, reqNote) {
  return {
    recommendation: 'AUTO-IMPORT',
    reasoning: `Cretile per-grade row: Grade ${grade} maps to INV-CRETILE-G${grade} cleanly. Stock ${stock} units. ${reqNote ? `Mastersheet "Req" note "${reqNote}" preserved verbatim in notes field; D-035 captures the question of whether the system should track per-grade demand explicitly.` : 'No Req note.'}`,
    mapping: {
      skuName: 'Cretile Grade-band kit',
      invId: `INV-CRETILE-G${grade}`,
      category: 'Cretile',
      cretileGrade: grade,
      mastersheetSourceName: name,
      proposedStock: typeof stock === 'number' ? stock : 0,
      proposedNotes: reqNote ? `Mastersheet Req note: ${reqNote}` : null,
    },
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function main() {
  const dispatches = JSON.parse(readFileSync(DISPATCHES_PATH, 'utf-8'))
  const dispatchCorrobByName = new Map()
  for (const d of dispatches) {
    for (const li of d.lineItems) {
      const name = li.skuName
      if (name === DISPATCH_PLACEHOLDER) continue // filter out the W4-D.1 placeholder
      dispatchCorrobByName.set(name, (dispatchCorrobByName.get(name) ?? 0) + 1)
    }
  }
  console.log(`Dispatch corroboration map (${dispatchCorrobByName.size} distinct SKUs):`)
  for (const [k, v] of [...dispatchCorrobByName.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(40)} x ${v}`)
  }

  const sheetRows = readInventorySheet()
  console.log(`\nLoaded ${sheetRows.length} non-empty rows from Current Inventory sheet.`)

  // Sourcing context notes (rows 16-17 carry "post april" / "due to chinese leave").
  const sourcingNotes = []
  for (const row of sheetRows) {
    const cells = row.cells
    for (const c of Object.values(cells)) {
      const s = String(c)
      if (/we don.?t have this/i.test(s)) sourcingNotes.push(s)
      if (/post april|chinese leave/i.test(s)) sourcingNotes.push(s)
    }
  }

  // Walk the rows and classify.
  const verifications = []
  for (const row of sheetRows) {
    const cells = row.cells
    // Cretile section: cols B (2) + C (3); col D (4) carries the Req note.
    const cretileName = cells[2]
    const cretileQty = cells[3]
    const cretileReq = cells[4]
    if (typeof cretileName === 'string' && /grade\s+\d+\s+kit/i.test(cretileName)) {
      const m = cretileName.match(/grade\s+(\d+)/i)
      const grade = m ? Number(m[1]) : null
      if (grade !== null) {
        // Filter out cross-section pollution: cells[4] sometimes carries
        // a TinkR-side annotation ("we don't have this in our inventory")
        // when no Cretile Req note exists at that row. Only treat it as
        // a Cretile Req note when it matches the "Grade X-Y" format.
        const cretileReqClean = typeof cretileReq === 'string'
          && /grade\s*\d+[-\s]+\d+/i.test(cretileReq)
          ? cretileReq
          : null
        const cls = classifyCretileRow(cretileName, grade, cretileQty, cretileReqClean)
        verifications.push({
          rowNumber: row.rowNumber,
          section: 'Cretile',
          mastersheetSourceName: cretileName,
          mastersheetStock: typeof cretileQty === 'number' ? cretileQty : 0,
          inlineNote: cretileReqClean,
          ...cls,
        })
      }
    }

    // TinkRworks section: cols E (5) + F (6); col G (7) carries Req for some rows.
    const tinkrName = cells[5]
    const tinkrQty = cells[6]
    const tinkrReq = cells[7]
    if (typeof tinkrName === 'string' && tinkrName.length > 3) {
      // Sourcing notes specific to this row, if the cell content matches.
      const rowSpecificNotes = []
      if (cells[4] && /we don.?t have this/i.test(String(cells[4]))) {
        rowSpecificNotes.push(String(cells[4]))
      }
      const cls = classifyTinkRRow(tinkrName, tinkrQty, dispatchCorrobByName, rowSpecificNotes)
      if (cls.recommendation !== 'SKIP-HEADER') {
        verifications.push({
          rowNumber: row.rowNumber,
          section: 'TinkRworks',
          mastersheetSourceName: tinkrName,
          mastersheetStock: typeof tinkrQty === 'number' ? tinkrQty : 0,
          inlineNote: tinkrReq != null ? String(tinkrReq) : (rowSpecificNotes[0] ?? null),
          ...cls,
        })
      } else {
        verifications.push({
          rowNumber: row.rowNumber,
          section: 'TinkRworks',
          mastersheetSourceName: tinkrName,
          mastersheetStock: typeof tinkrQty === 'number' ? tinkrQty : 0,
          inlineNote: tinkrReq != null ? String(tinkrReq) : null,
          recommendation: 'SKIP-HEADER',
          reasoning: cls.reasoning,
          mapping: null,
        })
      }
    }
  }

  // Programmatic placeholder rows per Anish W4-G recon Q2 decision.
  const placeholderRows = [
    {
      rowNumber: null,
      section: 'Placeholder',
      mastersheetSourceName: null,
      mastersheetStock: 0,
      inlineNote: null,
      recommendation: 'AUTO-IMPORT',
      reasoning: 'Placeholder added per W4-G recon Q2: Push Pull Pin appears in Dispatch lineItems but is absent from Mastersheet Current Inventory. Stock 0 placeholder; round 2 (D-034) sets actual count.',
      mapping: {
        skuName: 'Push Pull Pin',
        invId: 'INV-PUSH-PULL-PIN',
        category: 'Other',
        cretileGrade: null,
        mastersheetSourceName: null,
        proposedStock: 0,
        proposedNotes: 'not in Mastersheet Current Inventory; verified absent at W4-G backfill; stock to be set by Misba/Pradeep at next inventory edit (D-034)',
      },
      corroboration: dispatchCorrobByName.get('Push Pull Pin') ?? 0,
    },
    {
      rowNumber: null,
      section: 'Placeholder',
      mastersheetSourceName: null,
      mastersheetStock: 0,
      inlineNote: null,
      recommendation: 'AUTO-IMPORT',
      reasoning: 'Placeholder added per W4-G recon Q2: Steam Academy appears in Dispatch lineItems but is absent from Mastersheet Current Inventory. Stock 0 placeholder; round 2 (D-034) sets actual count.',
      mapping: {
        skuName: 'Steam Academy',
        invId: 'INV-STEAM-ACADEMY',
        category: 'Other',
        cretileGrade: null,
        mastersheetSourceName: null,
        proposedStock: 0,
        proposedNotes: 'not in Mastersheet Current Inventory; verified absent at W4-G backfill; stock to be set by Misba/Pradeep at next inventory edit (D-034)',
      },
      corroboration: dispatchCorrobByName.get('Steam Academy') ?? 0,
    },
  ]
  for (const p of placeholderRows) verifications.push(p)

  // Counts
  const summary = {
    totalEntries: verifications.length,
    autoImport: verifications.filter((v) => v.recommendation === 'AUTO-IMPORT').length,
    manualReview: verifications.filter((v) => v.recommendation === 'MANUAL-REVIEW').length,
    quarantine: verifications.filter((v) => v.recommendation === 'QUARANTINE').length,
    skipHeader: verifications.filter((v) => v.recommendation === 'SKIP-HEADER').length,
    cretileRows: verifications.filter((v) => v.section === 'Cretile').length,
    tinkrRows: verifications.filter((v) => v.section === 'TinkRworks').length,
    placeholderRows: verifications.filter((v) => v.section === 'Placeholder').length,
    rowsWithDispatchCorroboration: verifications.filter(
      (v) => (v.corroboration ?? 0) > 0,
    ).length,
    rowsWithoutDispatchCorroboration: verifications.filter(
      (v) => v.recommendation !== 'SKIP-HEADER' && v.section !== 'Cretile' && (v.corroboration ?? 0) === 0,
    ).length,
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath: 'ops-data/Mastersheet-Implementation_-_AnishD.xlsx',
    inputSheet: 'Current Inventory',
    independenceAxis:
      'SKU normalisation (verbose Mastersheet -> simple Dispatch-aligned) plus Dispatch lineItem cross-reference. Different code path from W4-C.7, W4-D.8, W4-E.2, W4-E.3.',
    sourcingNotes: Array.from(new Set(sourcingNotes)),
    summary,
    verifications,
    deferredHookups: {
      'D-033': '"TinkRworks - Reusable Kits 1330" header at row 4 does not reconcile with column sum 7243. Skipped during verification; round 2 asks Misba/Pradeep what 1330 represents.',
      'D-034': 'Push Pull Pin + Steam Academy added with stock 0; round 2 sets actual counts.',
      'D-035': 'Cretile "Req" notes ("Grade 5-17") preserved verbatim in InventoryItem.notes; round 2 decides whether to model per-grade demand explicitly.',
    },
  }

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  // CSV
  const headers = [
    'section', 'rowNumber', 'recommendation', 'corroboration',
    'mastersheetSourceName', 'mastersheetStock', 'inlineNote',
    'proposedSkuName', 'proposedInvId', 'proposedCategory',
    'proposedCretileGrade', 'proposedStock', 'proposedNotes',
    'reasoning',
  ]
  const lines = [headers.join(',')]
  for (const v of verifications) {
    const m = v.mapping ?? {}
    lines.push([
      csvCell(v.section),
      csvCell(v.rowNumber),
      csvCell(v.recommendation),
      csvCell(v.corroboration ?? ''),
      csvCell(v.mastersheetSourceName),
      csvCell(v.mastersheetStock),
      csvCell(v.inlineNote),
      csvCell(m.skuName ?? ''),
      csvCell(m.invId ?? ''),
      csvCell(m.category ?? ''),
      csvCell(m.cretileGrade ?? ''),
      csvCell(m.proposedStock ?? ''),
      csvCell(m.proposedNotes ?? ''),
      csvCell(v.reasoning),
    ].join(','))
  }
  writeFileSync(REPORT_CSV, lines.join('\n') + '\n', 'utf-8')

  console.log('')
  console.log('Verification table summary:')
  console.log(`  Total entries:       ${summary.totalEntries}`)
  console.log(`  AUTO-IMPORT:         ${summary.autoImport}`)
  console.log(`  MANUAL-REVIEW:       ${summary.manualReview}`)
  console.log(`  QUARANTINE:          ${summary.quarantine}`)
  console.log(`  SKIP-HEADER:         ${summary.skipHeader}`)
  console.log(`  Sections: Cretile=${summary.cretileRows} TinkR=${summary.tinkrRows} Placeholder=${summary.placeholderRows}`)
  console.log(`  Dispatch corroboration: ${summary.rowsWithDispatchCorroboration} with / ${summary.rowsWithoutDispatchCorroboration} without`)
  console.log('')
  console.log(`Wrote ${REPORT_JSON}`)
  console.log(`Wrote ${REPORT_CSV}`)

  if (summary.manualReview > 0 || summary.quarantine > 0) {
    console.log('')
    console.log('PAUSE FOR ANISH ROW-BY-ROW REVIEW BEFORE W4-G.3 MUTATION RUNS.')
    for (const v of verifications) {
      if (v.recommendation === 'MANUAL-REVIEW' || v.recommendation === 'QUARANTINE') {
        console.log(`  [${v.recommendation}] ${v.section} row ${v.rowNumber}: ${v.mastersheetSourceName ?? '(placeholder)'} -- ${v.reasoning.slice(0, 120)}`)
      }
    }
  }
}

main()
