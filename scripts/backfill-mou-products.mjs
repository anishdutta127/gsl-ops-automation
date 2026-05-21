#!/usr/bin/env node
/*
 * Phase 6E Finding 1: backfill mou.productSelection on MOUs that have
 * Cretile dispatches but null/undefined productSelection.
 *
 * The MOU.productSelection field was introduced in Gate 3 Step 1 but
 * never populated for any of the 183 production MOUs - the legacy
 * gsl-mou-system data did not carry a product field, and neither the
 * Phase 5A.8 Pranav refresh nor the Phase 6C Pratik FY 25-26 importer
 * mapped a product column. The wizard / kits-details page DO persist
 * the field for new MOUs, but no historical record has been touched.
 *
 * Symptom: /dispatch/kits/[mouId] for these MOUs shows the amber
 * banner "Product selection not yet captured" and an empty SKU
 * dropdown, blocking Pranav from allocating kits even though
 * dispatch records already exist with Cretile lineItems.
 *
 * This script:
 *   - Scans dispatches.json for records whose lineItems map to a
 *     Cretile or TinkRworks SKU via inventory_items.category (the
 *     canonical SKU-to-product taxonomy used by eligibleSkusForMou).
 *   - Cross-references the parent MOU. If productSelection is null /
 *     undefined, infers 'Cretile' / 'TinkRworks' / 'Both' from the
 *     dispatch evidence and proposes an update.
 *   - Skips MOUs that already have a productSelection set
 *     (idempotent).
 *   - Mixed-product MOUs (both Cretile + TinkRworks in lineItems)
 *     map to 'Both'; the current dataset has zero such cases.
 *
 * Modes:
 *   --dry-run (default): prints planned updates, writes nothing.
 *     Anish reviews; CC pauses for CONFIRM.
 *   --apply: writes productSelection to mous.json. Each touched MOU
 *     gets an audit entry with action='product-selection-backfill-phase-6e'.
 *
 * Out of scope: the other 174 null-productSelection MOUs that have no
 * dispatch evidence. They stay null until the Pranav refresh importer
 * is fixed to map a product column or Pranav sets them manually via
 * /mous/[id]/kits-details.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const MOUS_PATH = path.join(REPO_ROOT, 'src/data/mous.json')
const DISPATCHES_PATH = path.join(REPO_ROOT, 'src/data/dispatches.json')
const INVENTORY_PATH = path.join(REPO_ROOT, 'src/data/inventory_items.json')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY = !APPLY

// Use the canonical inventory.category field as the SKU-to-product
// authority. Regex-on-skuName misclassifies products like
// "Tech A Sketch" / "Smart Lamp" / "Launchpad" which are TinkRworks
// per the inventory taxonomy but do not contain the string "tinkr".
function buildSkuCategoryMap(inventory) {
  const map = new Map()
  for (const item of inventory) {
    if (item.skuName) map.set(item.skuName, item.category)
  }
  return map
}

function classifyDispatch(items, skuCategoryMap) {
  let hasCretile = false
  let hasTinkR = false
  for (const li of items) {
    const cat = skuCategoryMap.get(li.skuName ?? '')
    if (cat === 'Cretile') hasCretile = true
    else if (cat === 'TinkRworks') hasTinkR = true
  }
  if (hasCretile && hasTinkR) return 'Both'
  if (hasCretile) return 'Cretile'
  if (hasTinkR) return 'TinkRworks'
  return null
}

function main() {
  const dispatches = JSON.parse(fs.readFileSync(DISPATCHES_PATH, 'utf-8'))
  const mous = JSON.parse(fs.readFileSync(MOUS_PATH, 'utf-8'))
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf-8'))
  const mouById = new Map(mous.map((m) => [m.id, m]))
  const skuCategoryMap = buildSkuCategoryMap(inventory)

  // Collect per-MOU classification from dispatch evidence.
  const classByMou = new Map()
  for (const d of dispatches) {
    if (!d.mouId) continue
    const cls = classifyDispatch(d.lineItems ?? [], skuCategoryMap)
    if (!cls) continue
    const prev = classByMou.get(d.mouId)
    if (!prev) {
      classByMou.set(d.mouId, cls)
    } else if (prev !== cls) {
      // Conflicting classifications across multiple dispatches -> Both.
      classByMou.set(d.mouId, 'Both')
    }
  }

  const plan = []
  for (const [mouId, inferredProduct] of classByMou) {
    const mou = mouById.get(mouId)
    if (!mou) {
      plan.push({
        mouId,
        action: 'skip-no-mou',
        reason: 'parent MOU not in mous.json (orphan dispatch)',
      })
      continue
    }
    if (mou.productSelection && mou.productSelection !== null) {
      plan.push({
        mouId,
        action: 'skip-already-set',
        existing: mou.productSelection,
      })
      continue
    }
    plan.push({
      mouId,
      schoolName: mou.schoolName,
      programme: mou.programme,
      action: 'update',
      inferredProduct,
      before: { productSelection: mou.productSelection ?? null },
      after: { productSelection: inferredProduct },
    })
  }

  const updates = plan.filter((x) => x.action === 'update')
  const skips = plan.filter((x) => x.action !== 'update')

  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`scan: ${dispatches.length} dispatches, ${mous.length} MOUs`)
  console.log(`targets: MOUs with dispatch evidence of Cretile or TinkRworks SKUs AND productSelection unset`)
  console.log('')
  console.log(`updates planned: ${updates.length}`)
  console.log(`skips: ${skips.length}`)
  if (skips.length > 0) {
    for (const s of skips) console.log(`  - ${s.mouId}: ${s.action}${s.reason ? ` (${s.reason})` : ''}${s.existing ? ` (existing=${s.existing})` : ''}`)
  }
  console.log('')
  console.log('Per-row plan:')
  for (const u of updates) {
    console.log(
      `  ${u.mouId} (${u.schoolName}, ${u.programme})`,
    )
    console.log(
      `    before: productSelection=${u.before.productSelection}`,
    )
    console.log(
      `    after:  productSelection=${u.after.productSelection}  (inferred from dispatch lineItems)`,
    )
  }
  console.log('')

  if (DRY) {
    console.log('DRY-RUN complete. No files written. Re-run with --apply to commit.')
    return
  }

  const ts = new Date().toISOString()
  for (const u of updates) {
    const mou = mouById.get(u.mouId)
    if (!mou) continue
    mou.productSelection = u.after.productSelection
    const audit = {
      timestamp: ts,
      user: 'system',
      action: 'product-selection-backfill-phase-6e',
      before: u.before,
      after: u.after,
      notes: `Phase 6E Finding 1: inferred productSelection=${u.after.productSelection} from existing dispatch lineItems via inventory_items.category mapping.`,
    }
    mou.auditLog = Array.isArray(mou.auditLog) ? [...mou.auditLog, audit] : [audit]
  }
  fs.writeFileSync(MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  console.log(`APPLIED: wrote ${updates.length} productSelection updates to ${MOUS_PATH}`)
}

main()
