/*
 * W4-G.4 decrementInventory.
 *
 * Pure function. Given a Dispatch about to land + the current
 * InventoryItem[] state, returns updated InventoryItem objects (deep-
 * copied with audit appended) plus a summary the caller mirrors onto
 * the parent Dispatch's auditLog. Caller enqueues each updated item.
 *
 * Hard-block scenarios (return { ok: false, reason }):
 *   - sku-not-found           : flat lineItem skuName has no matching
 *                                InventoryItem
 *   - cretile-grade-not-found : per-grade allocation has no matching
 *                                Cretile per-grade InventoryItem
 *   - insufficient-stock      : requested quantity > currentStock
 *   - sku-sunset              : matching InventoryItem has active=false
 *
 * Pre-W4-D safeguard: when `dispatch.raisedFrom === 'pre-w4d'`, the
 * lib returns ok:true with empty arrays. The 22 W4-D.8 backfilled
 * Dispatches use this raisedFrom value because Mastersheet "Current
 * Inventory" already represents post-historical-shipment state.
 *
 * Threshold crossing detection: when `prev > threshold && next <=
 * threshold` (downward) AND threshold is not null, the result's
 * `lowStockTriggers` carries the entry. Caller fires the
 * 'inventory-low-stock' notification fan-out.
 *
 * Idempotency: function is pure; the caller writes. Calling twice
 * with the same input + same baseline state yields identical output.
 * Race conditions (rare in Phase 1 single-tester pattern) resolve
 * to last-write-wins; the audit log captures every event for
 * forensic review.
 *
 * Aggregation: a single SKU may appear in multiple line items of a
 * dispatch (unlikely in practice but valid schema-wise); the lib
 * sums all decrements per InventoryItem before applying.
 */

import type {
  AuditEntry,
  Dispatch,
  DispatchLineItem,
  InventoryItem,
} from '@/lib/types'

export type DecrementFailureReason =
  | 'sku-not-found'
  | 'cretile-grade-not-found'
  | 'insufficient-stock'
  | 'sku-sunset'
  | 'invalid-flat-cretile-line'

export interface DecrementSummary {
  inventoryItemId: string
  skuName: string
  cretileGrade: number | null
  previousStock: number
  newStock: number
  decremented: number
}

export interface DecrementLowStockTrigger {
  inventoryItemId: string
  skuName: string
  cretileGrade: number | null
  currentStock: number
  threshold: number
}

export type DecrementOutcome =
  | {
      ok: true
      /** Updated InventoryItem objects with audit appended; caller enqueues each.
       *  Empty when the dispatch is pre-W4-D (safeguard). */
      updatedItems: InventoryItem[]
      summary: DecrementSummary[]
      lowStockTriggers: DecrementLowStockTrigger[]
    }
  | {
      ok: false
      reason: DecrementFailureReason
      detail: string
      offendingSkuName?: string
      offendingGrade?: number
    }

export interface DecrementArgs {
  dispatch: Pick<Dispatch, 'id' | 'lineItems' | 'raisedFrom'>
  decrementedBy: string
  now?: Date
}

export interface DecrementDeps {
  inventoryItems: InventoryItem[]
}

const PRE_W4D_RAISED_FROM = 'pre-w4d'
const CRETILE_GENERIC_SKU = 'Cretile Grade-band kit'

/**
 * Internal decrement-plan entry; aggregates multiple line-item-side
 * deductions against the same InventoryItem before applying.
 */
interface PlanEntry {
  invId: string
  decrementBy: number
  /** The first matched item in the dependency state; cloned at apply time. */
  item: InventoryItem
}

function findFlat(items: InventoryItem[], skuName: string): InventoryItem | null {
  return items.find((it) => it.skuName === skuName) ?? null
}

function findCretile(
  items: InventoryItem[],
  grade: number,
): InventoryItem | null {
  return items.find(
    (it) => it.category === 'Cretile' && it.cretileGrade === grade,
  ) ?? null
}

function fail(
  reason: DecrementFailureReason,
  detail: string,
  offendingSkuName?: string,
  offendingGrade?: number,
): Extract<DecrementOutcome, { ok: false }> {
  return {
    ok: false,
    reason,
    detail,
    offendingSkuName,
    offendingGrade,
  }
}

export function decrementInventory(
  args: DecrementArgs,
  deps: DecrementDeps,
): DecrementOutcome {
  // 1. Pre-W4-D safeguard: backfilled historical dispatches do not
  //    decrement (Mastersheet Current Inventory already reflects the
  //    post-historical-shipment state).
  if (args.dispatch.raisedFrom === PRE_W4D_RAISED_FROM) {
    return { ok: true, updatedItems: [], summary: [], lowStockTriggers: [] }
  }

  const ts = (args.now ?? new Date()).toISOString()

  // 2. Build the decrement plan by walking lineItems. Aggregate by invId.
  const plan = new Map<string, PlanEntry>()

  function addToPlan(item: InventoryItem, qty: number): void {
    const existing = plan.get(item.id)
    if (existing) {
      existing.decrementBy += qty
    } else {
      plan.set(item.id, { invId: item.id, decrementBy: qty, item })
    }
  }

  for (const li of args.dispatch.lineItems) {
    if (li.kind === 'flat') {
      // Defensive: flat lineItem must NOT use the Cretile generic SKU
      // (Cretile is always per-grade in the schema).
      if (li.skuName === CRETILE_GENERIC_SKU) {
        return fail(
          'invalid-flat-cretile-line',
          `Flat lineItem with skuName='${CRETILE_GENERIC_SKU}' is invalid; Cretile dispatches must use kind='per-grade' with gradeAllocations.`,
          li.skuName,
        )
      }
      const item = findFlat(deps.inventoryItems, li.skuName)
      if (!item) {
        return fail(
          'sku-not-found',
          `No InventoryItem matches flat lineItem skuName='${li.skuName}'. Add the SKU to inventory_items.json or correct the dispatch.`,
          li.skuName,
        )
      }
      if (!item.active) {
        return fail(
          'sku-sunset',
          `Cannot dispatch sunset SKU '${item.skuName}' (id ${item.id}; active=false).`,
          li.skuName,
        )
      }
      addToPlan(item, li.quantity)
    } else if (li.kind === 'per-grade') {
      for (const a of li.gradeAllocations) {
        const item = findCretile(deps.inventoryItems, a.grade)
        if (!item) {
          return fail(
            'cretile-grade-not-found',
            `No Cretile InventoryItem matches grade ${a.grade}. Add INV-CRETILE-G${a.grade} to inventory_items.json or correct the dispatch.`,
            CRETILE_GENERIC_SKU,
            a.grade,
          )
        }
        if (!item.active) {
          return fail(
            'sku-sunset',
            `Cannot dispatch sunset SKU '${item.skuName}' (id ${item.id}, grade ${a.grade}; active=false).`,
            item.skuName,
            a.grade,
          )
        }
        addToPlan(item, a.quantity)
      }
    }
  }

  // 3. Validate aggregate stock before any mutation. This ensures a
  //    single line item with stock=10 + another line item asking for
  //    8 + 5 of the same SKU fails cleanly rather than passing the
  //    individual checks and breaking on the second decrement.
  for (const entry of Array.from(plan.values())) {
    if (entry.decrementBy > entry.item.currentStock) {
      return fail(
        'insufficient-stock',
        `Insufficient stock: ${entry.decrementBy} requested, ${entry.item.currentStock} available for SKU '${entry.item.skuName}' (id ${entry.invId}).`,
        entry.item.skuName,
        entry.item.cretileGrade ?? undefined,
      )
    }
  }

  // 4. Apply: build updated InventoryItem objects with audit entries.
  const updatedItems: InventoryItem[] = []
  const summary: DecrementSummary[] = []
  const lowStockTriggers: DecrementLowStockTrigger[] = []

  for (const entry of Array.from(plan.values())) {
    const previousStock = entry.item.currentStock
    const newStock = previousStock - entry.decrementBy

    const audit: AuditEntry = {
      timestamp: ts,
      user: args.decrementedBy,
      action: 'inventory-decremented-by-dispatch',
      before: { currentStock: previousStock },
      after: { currentStock: newStock, dispatchId: args.dispatch.id },
      notes: `Decremented ${entry.decrementBy} unit(s) of ${entry.item.skuName}${entry.item.cretileGrade ? ` (grade ${entry.item.cretileGrade})` : ''} via ${args.dispatch.id}.`,
    }

    const updated: InventoryItem = {
      ...entry.item,
      currentStock: newStock,
      lastUpdatedAt: ts,
      lastUpdatedBy: args.decrementedBy,
      auditLog: [...entry.item.auditLog, audit],
    }
    updatedItems.push(updated)

    summary.push({
      inventoryItemId: entry.item.id,
      skuName: entry.item.skuName,
      cretileGrade: entry.item.cretileGrade,
      previousStock,
      newStock,
      decremented: entry.decrementBy,
    })

    // Threshold crossing: only when threshold is configured AND we
    // crossed downward across the threshold during this decrement.
    if (
      entry.item.reorderThreshold !== null
      && previousStock > entry.item.reorderThreshold
      && newStock <= entry.item.reorderThreshold
    ) {
      lowStockTriggers.push({
        inventoryItemId: entry.item.id,
        skuName: entry.item.skuName,
        cretileGrade: entry.item.cretileGrade,
        currentStock: newStock,
        threshold: entry.item.reorderThreshold,
      })
    }
  }

  return { ok: true, updatedItems, summary, lowStockTriggers }
}
