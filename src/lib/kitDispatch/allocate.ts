/*
 * Gate 3 Step 3: school-level kit allocation.
 *
 * Lib mutator for /api/dispatch/kits/[mouId]/allocate. Validates
 * every row, checks inventory availability, mints the KitDispatch
 * record if it does not yet exist (id minted on first submit per
 * STEP9_QUESTIONS Q2), and enqueues the write.
 *
 * Inventory check: per joint spec section 3 "Inventory Linked
 * Restriction". Sum kitsQty per SKU across allocations, compare
 * against the SKU's currentStock in inventory_items.json. Reject
 * the whole submit if any SKU is over-allocated; the operator sees
 * which SKU and by how much. We DO NOT decrement inventory at this
 * stage; decrement happens at the Step 6 accounts-execute path when
 * the actual dispatched qty is known.
 *
 * Audit lands as `update` on the KitDispatch with before / after
 * capturing the full allocations array, plus a notes line indicating
 * that Sales approval is now pending.
 */

import type {
  AuditEntry,
  InventoryItem,
  KitAllocation,
  KitDispatch,
  MOU,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { mintDispatchId } from './lookup'

export interface AllocateArgs {
  mouId: string
  user: { id: string; name: string }
  allocations: KitAllocation[]
  /**
   * P2b.X OCC (2026-05-24): the version the operator's browser loaded.
   * For UPDATE flows, the repo's OCC method checks `WHERE version=$1`
   * and bumps on success. Mismatch -> 'version-conflict' result; the
   * route returns 409 and the UI shows a reload prompt. For CREATE
   * flows (first allocation, no existing kit_dispatch), version is
   * undefined and the repo INSERTs at version=1 unconditionally.
   */
  expectedVersion?: number
}

export interface AllocateDeps {
  mous: MOU[]
  kitDispatches: KitDispatch[]
  inventory: InventoryItem[]
  enqueue?: typeof enqueueUpdate
  now?: () => Date
  /**
   * P2b.X OCC: override-able OCC update for tests. Defaults to the
   * real repo method which performs an atomic UPDATE with version
   * check. Tests pass a stub that mirrors the success/conflict
   * contract without hitting postgres.
   */
  updateAllocationsOCC?: typeof kitDispatchRepo.updateAllocationsOCC
}

export type AllocateFailureReason =
  | 'mou-not-found'
  | 'mou-not-eligible'
  | 'no-rows'
  | 'invalid-row'
  | 'unknown-sku'
  | 'sku-mismatch-product'
  | 'inventory-insufficient'
  | 'version-conflict'

export type AllocateResult =
  | { ok: true; dispatch: KitDispatch; created: boolean }
  | {
      ok: false
      reason: AllocateFailureReason
      offendingSkuName?: string
      requested?: number
      available?: number
      /** Populated only when reason === 'version-conflict'. */
      conflictVersion?: number
    }

function validateRow(row: KitAllocation): boolean {
  if (!Number.isFinite(row.grade) || row.grade < 1 || row.grade > 12) return false
  if (!Number.isFinite(row.students) || row.students < 0) return false
  if (!Number.isFinite(row.kitsQty) || row.kitsQty <= 0) return false
  if (row.kitType !== 'Reusable' && row.kitType !== 'Consumable') return false
  if (typeof row.productName !== 'string' || row.productName.trim() === '') return false
  return true
}

function aggregateBySku(rows: KitAllocation[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    out.set(r.productName, (out.get(r.productName) ?? 0) + r.kitsQty)
  }
  return out
}

export async function allocateKits(
  args: AllocateArgs,
  deps: AllocateDeps,
): Promise<AllocateResult> {
  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  const eligibleStatuses = new Set(['Active', 'Completed', 'Expired', 'Renewed'])
  if (!eligibleStatuses.has(mou.status)) {
    return { ok: false, reason: 'mou-not-eligible' }
  }

  const rows = args.allocations
  if (rows.length === 0) return { ok: false, reason: 'no-rows' }
  for (const r of rows) {
    if (!validateRow(r)) return { ok: false, reason: 'invalid-row' }
  }

  const productSelection =
    (mou.productSelection as 'TinkRworks' | 'Cretile' | 'Both' | null | undefined) ??
    null

  const inventoryByName = new Map<string, InventoryItem>()
  for (const item of deps.inventory) {
    if (item.active) inventoryByName.set(item.skuName, item)
  }

  for (const r of rows) {
    const sku = inventoryByName.get(r.productName)
    if (!sku) {
      return {
        ok: false,
        reason: 'unknown-sku',
        offendingSkuName: r.productName,
      }
    }
    if (productSelection && productSelection !== 'Both') {
      if (sku.category !== productSelection) {
        return {
          ok: false,
          reason: 'sku-mismatch-product',
          offendingSkuName: r.productName,
        }
      }
    }
  }

  const totalsBySku = aggregateBySku(rows)
  for (const [skuName, totalRequested] of Array.from(totalsBySku.entries())) {
    const sku = inventoryByName.get(skuName)
    if (!sku) {
      return {
        ok: false,
        reason: 'unknown-sku',
        offendingSkuName: skuName,
      }
    }
    if (totalRequested > sku.currentStock) {
      return {
        ok: false,
        reason: 'inventory-insufficient',
        offendingSkuName: skuName,
        requested: totalRequested,
        available: sku.currentStock,
      }
    }
  }

  const existing = deps.kitDispatches.find((kd) => kd.mouId === args.mouId) ?? null
  const created = !existing
  const id = existing?.id ?? mintDispatchId(args.mouId)
  const product = productSelection ?? 'TinkRworks'

  const beforeAllocations = existing?.allocations ?? []
  const audit: AuditEntry = {
    timestamp: now.toISOString(),
    user: args.user.id,
    action: 'update',
    before: { allocations: beforeAllocations as unknown as Record<string, unknown> },
    after: { allocations: rows as unknown as Record<string, unknown> },
    notes:
      'sales-approval-pending; notified sales rep '
      + (mou.salesPersonId ?? 'unassigned'),
  }

  const nextRecord: KitDispatch = existing
    ? {
        ...existing,
        allocations: rows,
        salesApprovalStatus: 'Pending',
        salesRejectionReason: null,
        auditLog: [...existing.auditLog, audit],
      }
    : {
        id,
        mouId: args.mouId,
        schoolId: mou.schoolId,
        schoolName: mou.schoolName,
        productSelected: product,
        dispatchStatus: 'Not Started',
        allocations: rows,
        salesApprovalStatus: 'Pending',
        salesApprovedBy: null,
        salesApprovedAt: null,
        salesRejectionReason: null,
        dispatchSummary: null,
        shipmentTracking: null,
        pod: null,
        auditLog: [
          {
            timestamp: now.toISOString(),
            user: args.user.id,
            action: 'create',
            after: {
              id,
              mouId: args.mouId,
              schoolId: mou.schoolId,
              productSelected: product,
            },
            notes: 'KitDispatch record minted on first allocation submit.',
          },
          audit,
        ],
        createdAt: now.toISOString(),
      }

  if (created) {
    // CREATE path: no version to check. The repo's create method INSERTs
    // at version=1 (column default). Concurrent CREATEs for the same
    // mouId are prevented by the UNIQUE(mou_id) constraint on
    // kit_dispatches; only one of N parallel CREATE attempts will land.
    await enqueue({
      queuedBy: args.user.id,
      entity: 'kitDispatch',
      operation: 'create',
      payload: {
        id,
        mouId: args.mouId,
        record: nextRecord as unknown as Record<string, unknown>,
      },
    })
    return { ok: true, dispatch: { ...nextRecord, version: 1 }, created }
  }

  // UPDATE path: OCC. If the operator's browser loaded version=V and
  // someone else has since saved, the UPDATE's WHERE version=V fails
  // (0 rows affected); we surface a clean 409 to the route so the UI
  // can prompt the operator to reload.
  const expectedVersion = args.expectedVersion ?? existing!.version ?? 1
  const occUpdate = deps.updateAllocationsOCC
    ?? kitDispatchRepo.updateAllocationsOCC.bind(kitDispatchRepo)
  const occResult = await occUpdate(
    id,
    expectedVersion,
    {
      allocations: rows,
      salesApprovalStatus: 'Pending',
      salesRejectionReason: null,
    },
    audit,
    { queuedBy: args.user.id },
  )
  if (!occResult.ok) {
    return {
      ok: false,
      reason: 'version-conflict',
      conflictVersion: occResult.conflictVersion,
    }
  }
  return {
    ok: true,
    dispatch: { ...nextRecord, version: occResult.newVersion },
    created,
  }
}
