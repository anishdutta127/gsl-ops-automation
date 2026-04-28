/*
 * W4-G.5 editInventoryItem.
 *
 * Per-item edit lib for the four mutable fields:
 *   - currentStock      manual cycle-count or correction
 *   - reorderThreshold  set / clear; null suppresses low-stock alert
 *   - notes             free-text
 *   - active            sunset / reactivate toggle
 *
 * Immutable here: id, skuName, category, cretileGrade, mastersheetSourceName.
 * Renaming a SKU or moving categories means a new InventoryItem (the
 * old id stays for audit continuity; round-2 may add a 'merge' op).
 *
 * Audit: the lib emits one of two action codes per call,
 *   - 'inventory-stock-edited'      when only currentStock changed
 *   - 'inventory-threshold-edited'  when only reorderThreshold changed
 *   - 'inventory-stock-edited'      when both stock + other fields changed
 *                                    (notes/active) but NOT threshold
 *   - 'inventory-threshold-edited'  when only threshold + other fields
 *                                    changed (rare path)
 *   - 'inventory-stock-edited'      mixed (catch-all) when more than one
 *                                    of stock/threshold change in the
 *                                    same call (rare; the form posts the
 *                                    full bag).
 * The before/after diff captures every field that changed regardless
 * of which action code was picked, so audit consumers can reconstruct
 * the full edit either way.
 *
 * Permission: 'inventory:edit' (Admin + OpsHead per permissions.ts).
 *
 * Validation:
 *   - currentStock     integer >= 0
 *   - reorderThreshold null OR integer >= 0
 *   - notes            null OR trimmed string (empty string is rejected
 *                       at the route layer; lib accepts to support
 *                       explicit clear via null)
 */

import type {
  AuditEntry,
  AuditAction,
  InventoryItem,
  User,
} from '@/lib/types'
import inventoryItemsJson from '@/data/inventory_items.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

export interface EditInventoryItemArgs {
  itemId: string
  editedBy: string
  patch: {
    currentStock?: number
    reorderThreshold?: number | null
    notes?: string | null
    active?: boolean
  }
  notesForAudit?: string
}

export type EditInventoryItemFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'item-not-found'
  | 'invalid-stock'
  | 'invalid-threshold'
  | 'no-change'

export type EditInventoryItemResult =
  | { ok: true; item: InventoryItem; auditAction: AuditAction }
  | { ok: false; reason: EditInventoryItemFailureReason }

export interface EditInventoryItemDeps {
  inventoryItems: InventoryItem[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: EditInventoryItemDeps = {
  inventoryItems: inventoryItemsJson as unknown as InventoryItem[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0
}

export async function editInventoryItem(
  args: EditInventoryItemArgs,
  deps: EditInventoryItemDeps = defaultDeps,
): Promise<EditInventoryItemResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'inventory:edit')) {
    return { ok: false, reason: 'permission' }
  }

  const item = deps.inventoryItems.find((it) => it.id === args.itemId)
  if (!item) return { ok: false, reason: 'item-not-found' }

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const next: InventoryItem = { ...item }

  let stockChanged = false
  let thresholdChanged = false

  if (args.patch.currentStock !== undefined) {
    if (!isNonNegativeInt(args.patch.currentStock)) {
      return { ok: false, reason: 'invalid-stock' }
    }
    if (args.patch.currentStock !== item.currentStock) {
      before.currentStock = item.currentStock
      after.currentStock = args.patch.currentStock
      next.currentStock = args.patch.currentStock
      stockChanged = true
    }
  }

  if (args.patch.reorderThreshold !== undefined) {
    const t = args.patch.reorderThreshold
    if (t !== null && !isNonNegativeInt(t)) {
      return { ok: false, reason: 'invalid-threshold' }
    }
    if (t !== item.reorderThreshold) {
      before.reorderThreshold = item.reorderThreshold
      after.reorderThreshold = t
      next.reorderThreshold = t
      thresholdChanged = true
    }
  }

  if (args.patch.notes !== undefined) {
    const normalised = args.patch.notes === null
      ? null
      : args.patch.notes.trim() === ''
        ? null
        : args.patch.notes.trim()
    if (normalised !== item.notes) {
      before.notes = item.notes
      after.notes = normalised
      next.notes = normalised
    }
  }

  if (args.patch.active !== undefined) {
    if (args.patch.active !== item.active) {
      before.active = item.active
      after.active = args.patch.active
      next.active = args.patch.active
    }
  }

  if (Object.keys(after).length === 0) {
    return { ok: false, reason: 'no-change' }
  }

  // Pick the audit action code: threshold-only changes get the
  // threshold action; everything else (stock-only, mixed, notes-only,
  // active-only) gets stock-edited as the umbrella code.
  const auditAction: AuditAction =
    thresholdChanged && !stockChanged && Object.keys(after).length === 1
      ? 'inventory-threshold-edited'
      : 'inventory-stock-edited'

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: auditAction,
    before,
    after,
    notes: args.notesForAudit,
  }
  next.lastUpdatedAt = ts
  next.lastUpdatedBy = args.editedBy
  next.auditLog = [...item.auditLog, auditEntry]

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'inventoryItem',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  return { ok: true, item: next, auditAction }
}
