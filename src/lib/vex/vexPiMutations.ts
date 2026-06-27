/*
 * VEX PI corrections (Pass 2): unfreeze a generated VexPi.
 *
 *   - editVexPi: correct a wrong PI (line items / qty / price / school / GST /
 *     billing / freight); totals (subtotal/taxable/GST/total) are re-derived
 *     server-side. Blocked on a voided PI or a qty reduction below what is
 *     already dispatched for that SKU.
 *   - voidVexPi: soft-delete a PI raised in error, WITH a cascade so nothing is
 *     left orphaned:
 *       1. BLOCK if any dispatch is committed (Shipped / Invoiced / Delivered):
 *          goods/tax-invoice already left, voiding would contradict reality.
 *       2. cascade-void pre-ship dispatches (Requested / Request Raised).
 *       3. cascade-void the PI's payment_logs + zero the balance + clear ids.
 *       4. tombstone the PI (voided_at/by/reason).
 *
 * Permission: canEditFinanceData (Finance + Admin) - owner decision 2026-06-27.
 * Soft-delete only (tombstone, never hard-delete; the dispatch FK is RESTRICT).
 */

import type {
  AuditEntry,
  PaymentLog,
  User,
  VexDispatch,
  VexPi,
  VexPiLineItem,
} from '@/lib/types'
import { canEditFinanceData } from '@/lib/access'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { vexDispatchRepo, paymentLogRepo } from '@/lib/db/repos/leafRepos'
import { userRepo } from '@/lib/db/repos/user'

const round2 = (n: number) => Math.round(n * 100) / 100

// A dispatch past these states is real-world committed (goods shipped or a tax
// invoice raised); a PI with one cannot be voided. 'Delivered' lives on the
// held delivery-confirmation branch; included defensively as a string.
const COMMITTED_DISPATCH = new Set<string>(['Invoiced', 'Shipped', 'Delivered'])

/** Sum dispatched qty per SKU across the PI's NON-voided dispatches. */
export function dispatchedQtyByPart(dispatches: VexDispatch[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of dispatches) {
    if (d.voidedAt) continue
    for (const it of d.items ?? []) m.set(it.partNumber, (m.get(it.partNumber) ?? 0) + it.qty)
  }
  return m
}

/** Re-derive a VexPi's monetary totals from its line items + freight + GST %. */
export function deriveVexPiTotals(
  lineItems: VexPiLineItem[],
  freightCharges: number,
  gstPct: number,
): { lineItems: VexPiLineItem[]; subtotal: number; taxableValue: number; gstAmount: number; total: number } {
  const derived = lineItems.map((li) => ({ ...li, total: round2(li.quantity * li.unitPrice) }))
  const subtotal = round2(derived.reduce((s, li) => s + li.total, 0))
  const taxableValue = round2(subtotal + freightCharges)
  const gstAmount = round2(taxableValue * gstPct)
  const total = round2(taxableValue + gstAmount)
  return { lineItems: derived, subtotal, taxableValue, gstAmount, total }
}

// ----------------------------------------------------------------------------

export interface VexPiMutationDeps {
  pis: VexPi[]
  dispatches: VexDispatch[]
  logs: PaymentLog[]
  users: User[]
  updatePi: (pi: VexPi, queuedBy: string) => Promise<void>
  voidPi: (id: string, args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry }) => Promise<void>
  voidDispatch: (id: string, args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry }) => Promise<void>
  voidLog: (id: string, args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry }) => Promise<void>
  now: () => Date
}

async function defaultDeps(): Promise<VexPiMutationDeps> {
  return {
    pis: (await vexPiRepo.findAll()) as VexPi[],
    dispatches: (await vexDispatchRepo.findAll()) as VexDispatch[],
    logs: (await paymentLogRepo.findAll()) as PaymentLog[],
    users: (await userRepo.findAll()) as User[],
    updatePi: (pi, queuedBy) => vexPiRepo.update(pi, { queuedBy }),
    voidPi: (id, args) => vexPiRepo.void(id, args),
    voidDispatch: (id, args) => vexDispatchRepo.void(id, args),
    voidLog: (id, args) => paymentLogRepo.void(id, args),
    now: () => new Date(),
  }
}

function resolveUser(deps: VexPiMutationDeps, userId: string): User | null {
  return deps.users.find((u) => u.id === userId) ?? null
}

// ----------------------------------------------------------------------------
// Void (cascade soft-delete)

export interface VoidVexPiArgs {
  piId: string
  reason: string
  recordedBy: string
}

export type VoidVexPiFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'pi-not-found'
  | 'already-voided'
  | 'missing-reason'
  | 'has-committed-dispatch'

export type VoidVexPiResult =
  | { ok: true; pi: VexPi; voidedDispatches: number; voidedLogs: number }
  | { ok: false; reason: VoidVexPiFailureReason; committed?: string[] }

export async function voidVexPi(
  args: VoidVexPiArgs,
  depsOverride?: VexPiMutationDeps,
): Promise<VoidVexPiResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = resolveUser(deps, args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  const pi = deps.pis.find((p) => p.id === args.piId)
  if (!pi) return { ok: false, reason: 'pi-not-found' }
  if (pi.voidedAt) return { ok: false, reason: 'already-voided' }
  const reason = (args.reason ?? '').trim()
  if (reason.length < 10) return { ok: false, reason: 'missing-reason' }

  const piDispatches = deps.dispatches.filter((d) => d.piId === pi.id && !d.voidedAt)
  const committed = piDispatches.filter((d) => COMMITTED_DISPATCH.has(d.status as string))
  if (committed.length > 0) {
    return { ok: false, reason: 'has-committed-dispatch', committed: committed.map((d) => `${d.id} (${d.status})`) }
  }
  const preShip = piDispatches // all remaining are pre-ship (Requested / Request Raised)
  const liveLogs = (pi.paymentLogIds ?? [])
    .map((id) => deps.logs.find((l) => l.id === id))
    .filter((l): l is PaymentLog => !!l && !l.voidedAt)

  const ts = deps.now().toISOString()
  const mkAudit = (notes: string): AuditEntry => ({ timestamp: ts, user: args.recordedBy, action: 'update', notes })

  // 1. cascade-void pre-ship dispatches
  for (const d of preShip) {
    await deps.voidDispatch(d.id, {
      voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason,
      audit: mkAudit(`Dispatch voided: parent PI ${pi.id} voided. Reason: ${reason}`),
    })
  }
  // 2. cascade-void payment_logs
  for (const log of liveLogs) {
    await deps.voidLog(log.id, {
      voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason,
      audit: mkAudit(`Payment log voided: parent VEX PI ${pi.id} voided. Reason: ${reason}`),
    })
  }
  // 3. void the PI (zeroes balance + clears ids + tombstone)
  const piAudit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { paymentReceivedAmount: pi.paymentReceivedAmount, paymentLogIds: pi.paymentLogIds, voidedAt: null },
    after: { paymentReceivedAmount: 0, paymentLogIds: [], voidedAt: ts },
    notes:
      `VEX PI voided. Reason: ${reason}. Cascade: ${preShip.length} pre-ship dispatch(es) + ` +
      `${liveLogs.length} payment log(s) voided; balance zeroed.`,
  }
  await deps.voidPi(pi.id, { voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason, audit: piAudit })

  return {
    ok: true,
    pi: { ...pi, voidedAt: ts, voidedBy: args.recordedBy, voidReason: reason, paymentReceivedAmount: 0, paymentLogIds: [] },
    voidedDispatches: preShip.length,
    voidedLogs: liveLogs.length,
  }
}

// ----------------------------------------------------------------------------
// Edit

export interface EditVexPiArgs {
  piId: string
  schoolName: string
  shippingAddress: string
  billingName: string
  billingAddress: string
  schoolGstNumber: string | null
  contactPerson: string
  contactNo: string
  freightCharges: number
  gstPct: number
  lineItems: Array<{ partNumber: string; productName: string; quantity: number; unitPrice: number }>
  recordedBy: string
}

export type EditVexPiFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'pi-not-found'
  | 'voided'
  | 'no-line-items'
  | 'invalid-line-item'
  | 'invalid-gst'
  | 'qty-below-dispatched'

export type EditVexPiResult =
  | { ok: true; pi: VexPi }
  | { ok: false; reason: EditVexPiFailureReason; detail?: string }

export async function editVexPi(
  args: EditVexPiArgs,
  depsOverride?: VexPiMutationDeps,
): Promise<EditVexPiResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const user = resolveUser(deps, args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditFinanceData(user)) return { ok: false, reason: 'permission' }
  const pi = deps.pis.find((p) => p.id === args.piId)
  if (!pi) return { ok: false, reason: 'pi-not-found' }
  if (pi.voidedAt) return { ok: false, reason: 'voided' }

  if (!Array.isArray(args.lineItems) || args.lineItems.length === 0) {
    return { ok: false, reason: 'no-line-items' }
  }
  for (const li of args.lineItems) {
    if (!li.partNumber?.trim() || !li.productName?.trim()) return { ok: false, reason: 'invalid-line-item', detail: 'name and part number required' }
    if (!Number.isFinite(li.quantity) || li.quantity < 0) return { ok: false, reason: 'invalid-line-item', detail: `bad qty for ${li.partNumber}` }
    if (!Number.isFinite(li.unitPrice) || li.unitPrice < 0) return { ok: false, reason: 'invalid-line-item', detail: `bad price for ${li.partNumber}` }
  }
  if (!Number.isFinite(args.gstPct) || args.gstPct < 0 || args.gstPct > 1) return { ok: false, reason: 'invalid-gst' }
  const freight = Number.isFinite(args.freightCharges) && args.freightCharges >= 0 ? args.freightCharges : 0

  // Guard: a SKU's new qty cannot drop below what is already dispatched.
  const dispatched = dispatchedQtyByPart(deps.dispatches.filter((d) => d.piId === pi.id))
  const newQtyByPart = new Map<string, number>()
  for (const li of args.lineItems) newQtyByPart.set(li.partNumber, (newQtyByPart.get(li.partNumber) ?? 0) + li.quantity)
  for (const [part, sent] of dispatched) {
    if ((newQtyByPart.get(part) ?? 0) < sent) {
      return { ok: false, reason: 'qty-below-dispatched', detail: `${part}: ${sent} already dispatched` }
    }
  }

  const derived = deriveVexPiTotals(
    args.lineItems.map((li) => ({ partNumber: li.partNumber.trim(), productName: li.productName.trim(), quantity: li.quantity, unitPrice: li.unitPrice, total: 0 })),
    freight,
    args.gstPct,
  )

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'update',
    before: { lineItemCount: pi.lineItems.length, total: pi.total, subtotal: pi.subtotal, freightCharges: pi.freightCharges },
    after: { lineItemCount: derived.lineItems.length, total: derived.total, subtotal: derived.subtotal, freightCharges: freight },
    notes: `VEX PI edited; totals re-derived (total Rs ${pi.total} -> Rs ${derived.total}).`,
  }
  const next: VexPi = {
    ...pi,
    schoolName: args.schoolName.trim() || pi.schoolName,
    shippingAddress: args.shippingAddress.trim(),
    billingName: args.billingName.trim() || pi.billingName,
    billingAddress: args.billingAddress.trim(),
    schoolGstNumber: (args.schoolGstNumber ?? '').trim() || null,
    contactPerson: args.contactPerson.trim(),
    contactNo: args.contactNo.trim(),
    freightCharges: freight,
    gstPct: args.gstPct,
    lineItems: derived.lineItems,
    subtotal: derived.subtotal,
    taxableValue: derived.taxableValue,
    gstAmount: derived.gstAmount,
    total: derived.total,
    auditLog: [...(pi.auditLog ?? []), audit],
  }
  await deps.updatePi(next, args.recordedBy)
  return { ok: true, pi: next }
}
