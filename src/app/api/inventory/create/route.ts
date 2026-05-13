/*
 * POST /api/inventory/create (Gate 5A.6 Step 11).
 *
 * Create a new InventoryItem row. SKU id is derived from the skuName +
 * (optional) cretileGrade to keep ids stable and audit-readable.
 *
 * Permission: canManageInventory (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageInventory } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type {
  AuditEntry,
  InventoryCategory,
  InventoryItem,
} from '@/lib/types'
import inventoryItemsJson from '@/data/inventory_items.json'

const allItems = inventoryItemsJson as unknown as InventoryItem[]

const CATEGORIES: ReadonlyArray<InventoryCategory> = [
  'TinkRworks',
  'Cretile',
  'Hardware',
  'Other',
]

function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export async function POST(request: Request) {
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const errorTo = (reason: string) => {
    const url = new URL('/admin/inventory/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageInventory(user)) return errorTo('permission')

  const skuName = String(form.get('skuName') ?? '').trim()
  if (!skuName) return errorTo('missing-sku-name')

  const categoryRaw = String(form.get('category') ?? '')
  if (!CATEGORIES.includes(categoryRaw as InventoryCategory)) {
    return errorTo('missing-category')
  }
  const category = categoryRaw as InventoryCategory

  const gradeRaw = String(form.get('cretileGrade') ?? '').trim()
  let cretileGrade: number | null = null
  if (gradeRaw !== '') {
    const n = Number(gradeRaw)
    if (!Number.isInteger(n) || n < 1 || n > 12) return errorTo('invalid-grade')
    cretileGrade = n
  }

  const stockRaw = String(form.get('currentStock') ?? '').trim()
  const currentStock = Number(stockRaw)
  if (!Number.isInteger(currentStock) || currentStock < 0) {
    return errorTo('invalid-stock')
  }

  const thresholdRaw = String(form.get('reorderThreshold') ?? '').trim()
  let reorderThreshold: number | null = null
  if (thresholdRaw !== '') {
    const n = Number(thresholdRaw)
    if (!Number.isInteger(n) || n < 0) return errorTo('invalid-threshold')
    reorderThreshold = n
  }

  const notesRaw = String(form.get('notes') ?? '').trim()
  const notes = notesRaw === '' ? null : notesRaw
  const active = String(form.get('active') ?? '') === 'true'

  const baseId = cretileGrade !== null
    ? `INV-${slugify(skuName)}-G${cretileGrade}`
    : `INV-${slugify(skuName)}`
  if (allItems.some((i) => i.id === baseId)) return errorTo('duplicate-id')

  const ts = new Date().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'create',
    after: {
      id: baseId,
      skuName,
      category,
      cretileGrade,
      currentStock,
      reorderThreshold,
      active,
    },
    notes: `Inventory item ${baseId} created manually.`,
  }

  const item: InventoryItem = {
    id: baseId,
    skuName,
    category,
    cretileGrade,
    mastersheetSourceName: null,
    currentStock,
    reorderThreshold,
    notes,
    active,
    lastUpdatedAt: ts,
    lastUpdatedBy: user.id,
    auditLog: [auditEntry],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'inventoryItem',
      operation: 'create',
      payload: item as unknown as Record<string, unknown>,
    })
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL('/admin/inventory', request.url)
  url.searchParams.set('created', baseId)
  return NextResponse.redirect(url, { status: 303 })
}
