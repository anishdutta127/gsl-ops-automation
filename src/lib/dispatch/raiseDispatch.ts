/*
 * Dispatch raise (Phase D2 simplified flow).
 *
 * Phase 1 simplified state machine: this lib advances a Dispatch
 * from `pending` (or non-existent) to `po-raised`, renders the
 * dispatch note .docx, and writes the audit trail. Intermediate
 * states (`dispatched`, `in-transit`) are deferred to Phase 1.1
 * when courier integration lands. State `delivered` is set by D4
 * (delivery acknowledgement upload).
 *
 * Gate predicate (per overrideAudit lib): `installment1Paid ||
 * overrideEvent !== null`. installment1Paid is resolved from the
 * Payment record for the (mouId, instalmentSeq) tuple at lib
 * invocation time. If neither condition holds, the lib returns
 * 'gate-locked' without writing anything; Leadership pre-creates
 * a pending Dispatch with overrideEvent via writeOverrideAudit
 * before re-trying the raise.
 *
 * Idempotency: if a Dispatch exists with stage past `pending`, the
 * lib re-renders the docx without advancing state or writing.
 * Operators can re-download a previously-raised dispatch note via
 * the same endpoint without polluting the audit log.
 *
 * Idempotency divergence vs generatePi: this lib re-renders the
 * same dispatch document idempotently (returns wasAlreadyRaised:
 * true). generatePi.ts intentionally differs (counter advances
 * every call) because dispatch state has internal significance
 * only; PI numbers have external GST-filing significance. See
 * RUNBOOK section 10 "PI vs Dispatch idempotency divergence".
 *
 * Failure modes:
 *  - permission             not Admin or OpsHead
 *  - unknown-user           session.sub not in users.json
 *  - mou-not-found
 *  - school-not-found
 *  - wrong-status           MOU is not Active or Pending Signature (W4-I.4 MM1:
 *                           Sales-approved dispatch on Pending Signature MOUs is
 *                           valid; only Draft / Completed / Expired / Renewed
 *                           are rejected)
 *  - gate-locked            no payment + no override
 *  - template-missing       caller surfaces DispatchTemplateMissingError
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import type {
  AuditEntry,
  Dispatch,
  DispatchLineItem,
  DispatchStage,
  InventoryItem,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import companyJson from '../../../config/company.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import { isGateUnblocked } from './overrideAudit'
import { formatDate } from '@/lib/format'
import { DISPATCH_TEMPLATE, DispatchTemplateMissingError } from './templates'
import {
  decrementInventory,
  type DecrementFailureReason,
} from '@/lib/inventory/decrementInventory'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'

export interface CompanyConfig {
  legalEntity: string
  gstin: string
  address: string[]
}

const STAGES_BEYOND_PENDING: ReadonlyArray<DispatchStage> = [
  'po-raised',
  'dispatched',
  'in-transit',
  'delivered',
  'acknowledged',
]

const PAID_STATUSES = new Set(['Received', 'Paid'])

export interface RaiseDispatchArgs {
  mouId: string
  installmentSeq: number
  raisedBy: string
}

export type RaiseDispatchFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'school-not-found'
  | 'wrong-status'
  | 'inventory-decrement-failed'
  | 'gate-locked'
  | 'template-missing'

export type RaiseDispatchResult =
  | {
      ok: true
      dispatch: Dispatch
      docxBytes: Uint8Array
      wasAlreadyRaised: boolean
    }
  | {
      ok: false
      reason: RaiseDispatchFailureReason
      templateError?: DispatchTemplateMissingError
      /** When reason='inventory-decrement-failed': echoes the
       * inner reason from decrementInventory plus the offending
       * SKU name (so the caller can render an actionable message). */
      decrementFailureReason?: DecrementFailureReason
      decrementDetail?: string
      offendingSkuName?: string
    }

export interface RaiseDispatchDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
  dispatches: Dispatch[]
  payments: Payment[]
  inventoryItems: InventoryItem[]
  company: CompanyConfig
  enqueue: typeof enqueueUpdate
  loadTemplate: (templatePath: string) => Promise<Uint8Array>
  now: () => Date
}

const defaultLoadTemplate = async (templatePath: string): Promise<Uint8Array> => {
  const fullPath = path.join(process.cwd(), templatePath)
  try {
    return await readFile(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DispatchTemplateMissingError(DISPATCH_TEMPLATE.id, DISPATCH_TEMPLATE.file)
    }
    throw err
  }
}

const defaultDeps: RaiseDispatchDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  dispatches: dispatchesJson as unknown as Dispatch[],
  payments: paymentsJson as unknown as Payment[],
  inventoryItems: inventoryItemsJson as unknown as InventoryItem[],
  company: companyJson as CompanyConfig,
  enqueue: enqueueUpdate,
  loadTemplate: defaultLoadTemplate,
  now: () => new Date(),
}

interface KitItem {
  description: string
  quantity: number
  grades: string
}

function totalInstallments(paymentSchedule: string): number {
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

function buildKitItems(mou: MOU): { items: KitItem[]; total: number } {
  // Phase 1 simplified: one kit row per programme. Quantity equals
  // the actual student count (or MOU count if actuals not yet
  // confirmed). Grade band is left as a free-form string for the
  // dispatch coordinator to refine.
  const quantity = mou.studentsActual ?? mou.studentsMou
  const subtype = mou.programmeSubType ? ` (${mou.programmeSubType})` : ''
  return {
    items: [
      {
        description: `${mou.programme}${subtype} kit set`,
        quantity,
        grades: 'Per programme rollout plan',
      },
    ],
    total: quantity,
  }
}

function dispatchIdFor(mouId: string, installmentSeq: number): string {
  return `DSP-${mouId}-i${installmentSeq}`
}

function buildDispatchNotes(dispatch: Dispatch): string {
  const parts: string[] = []
  if (dispatch.notes && dispatch.notes.trim() !== '') parts.push(dispatch.notes.trim())
  if (dispatch.overrideEvent) {
    parts.push(
      `Pre-payment dispatch authorised by ${dispatch.overrideEvent.overriddenBy} on ${formatDate(dispatch.overrideEvent.overriddenAt)}: ${dispatch.overrideEvent.reason}`,
    )
  }
  return parts.join(' ')
}

/**
 * Render the dispatch-note .docx from a fully-built placeholder bag.
 * Exported so re-render flows (W4-H.3 GET /api/dispatch/[id]/dispatch-note)
 * can reuse the same template + render path that the raise flow uses.
 */
export async function renderDispatchDocx(
  bag: Record<string, unknown>,
  loadTemplate: RaiseDispatchDeps['loadTemplate'],
): Promise<Uint8Array> {
  const templateBytes = await loadTemplate(DISPATCH_TEMPLATE.file)
  const zip = new PizZip(templateBytes)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(bag)
  const out = doc.getZip().generate({ type: 'uint8array' })
  return out as unknown as Uint8Array
}

export async function raiseDispatch(
  args: RaiseDispatchArgs,
  deps: RaiseDispatchDeps = defaultDeps,
): Promise<RaiseDispatchResult> {
  const user = deps.users.find((u) => u.id === args.raisedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:raise-dispatch')) {
    return { ok: false, reason: 'permission' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  if (mou.status !== 'Active' && mou.status !== 'Pending Signature') {
    return { ok: false, reason: 'wrong-status' }
  }

  const school = deps.schools.find((s) => s.id === mou.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  const existing = deps.dispatches.find(
    (d) => d.mouId === args.mouId && d.installmentSeq === args.installmentSeq,
  )

  const ts = deps.now().toISOString()
  const dispatchId = existing?.id ?? dispatchIdFor(args.mouId, args.installmentSeq)

  // Idempotent re-render path: stage past `pending` -> render docx
  // from the existing dispatch + return without writing.
  if (existing && STAGES_BEYOND_PENDING.includes(existing.stage)) {
    try {
      const bag = buildPlaceholderBag({
        dispatch: existing,
        mou,
        school,
        company: deps.company,
        raisedByName: user.name,
        ts,
      })
      const docxBytes = await renderDispatchDocx(bag, deps.loadTemplate)
      return { ok: true, dispatch: existing, docxBytes, wasAlreadyRaised: true }
    } catch (err) {
      if (err instanceof DispatchTemplateMissingError) {
        return { ok: false, reason: 'template-missing', templateError: err }
      }
      throw err
    }
  }

  // Resolve gate. installment1Paid comes from the matching Payment
  // record (`<mouId>-i<seq>`) when its status is 'Received' or 'Paid'.
  const paymentId = `${args.mouId}-i${args.installmentSeq}`
  const payment = deps.payments.find((p) => p.id === paymentId)
  const installment1Paid = payment ? PAID_STATUSES.has(payment.status) : false

  const lineItemsForFreshDispatch: DispatchLineItem[] = (() => {
    const { items } = buildKitItems(mou)
    return items.map((k) => ({ kind: 'flat', skuName: k.description, quantity: k.quantity }))
  })()

  const baseDispatch: Dispatch = existing ?? {
    id: dispatchId,
    mouId: args.mouId,
    schoolId: school.id,
    installmentSeq: args.installmentSeq,
    stage: 'pending',
    installment1Paid,
    overrideEvent: null,
    poRaisedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes: null,
    lineItems: lineItemsForFreshDispatch,
    requestId: null,
    raisedBy: args.raisedBy,
    raisedFrom: 'ops-direct',
    auditLog: [],
  }

  const dispatchForGateCheck: Dispatch = {
    ...baseDispatch,
    installment1Paid,
  }
  if (!isGateUnblocked(dispatchForGateCheck)) {
    return { ok: false, reason: 'gate-locked' }
  }

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.raisedBy,
    action: 'dispatch-raised',
    before: { stage: baseDispatch.stage },
    after: { stage: 'po-raised' },
    notes: existing
      ? 'Advanced from pending to po-raised'
      : 'Created and raised in single step (simplified Phase 1 flow)',
  }

  const updatedDispatch: Dispatch = {
    ...dispatchForGateCheck,
    stage: 'po-raised',
    poRaisedAt: ts,
    auditLog: [...baseDispatch.auditLog, auditEntry],
  }

  let docxBytes: Uint8Array
  try {
    const bag = buildPlaceholderBag({
      dispatch: updatedDispatch,
      mou,
      school,
      company: deps.company,
      raisedByName: user.name,
      ts,
    })
    docxBytes = await renderDispatchDocx(bag, deps.loadTemplate)
  } catch (err) {
    if (err instanceof DispatchTemplateMissingError) {
      return { ok: false, reason: 'template-missing', templateError: err }
    }
    throw err
  }

  const mouAuditEntry: AuditEntry = {
    timestamp: ts,
    user: args.raisedBy,
    action: 'dispatch-raised',
    after: { dispatchId: updatedDispatch.id, instalmentSeq: args.installmentSeq },
    notes: `Raised dispatch ${updatedDispatch.id} for instalment ${args.installmentSeq}.`,
  }
  const updatedMou: MOU = { ...mou, auditLog: [...mou.auditLog, mouAuditEntry] }

  // W4-G.4: decrement inventory BEFORE enqueueing the Dispatch. If
  // the decrement fails (insufficient stock, sunset SKU, missing
  // record), abort the raise; the operator adjusts line items or
  // restocks before retrying. The decrement is a hard gate.
  const decrement = decrementInventory(
    {
      dispatch: {
        id: updatedDispatch.id,
        lineItems: updatedDispatch.lineItems,
        raisedFrom: updatedDispatch.raisedFrom,
      },
      decrementedBy: args.raisedBy,
      now: deps.now(),
    },
    { inventoryItems: deps.inventoryItems },
  )
  if (!decrement.ok) {
    return {
      ok: false,
      reason: 'inventory-decrement-failed',
      decrementFailureReason: decrement.reason,
      decrementDetail: decrement.detail,
      offendingSkuName: decrement.offendingSkuName,
    }
  }

  // Mirror a single rolled-up audit entry on the Dispatch so the
  // detail page can show "Inventory decremented: X SKUs" without
  // joining against InventoryItem.auditLog.
  if (decrement.summary.length > 0) {
    const dispatchInventoryAudit: AuditEntry = {
      timestamp: ts,
      user: args.raisedBy,
      action: 'inventory-decremented-by-dispatch',
      after: {
        skuCount: decrement.summary.length,
        decrements: decrement.summary,
      },
      notes: `Decremented inventory for ${decrement.summary.length} SKU(s).`,
    }
    updatedDispatch.auditLog = [...updatedDispatch.auditLog, dispatchInventoryAudit]
  }

  await deps.enqueue({
    queuedBy: args.raisedBy,
    entity: 'dispatch',
    operation: existing ? 'update' : 'create',
    payload: updatedDispatch as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.raisedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  // Enqueue every updated InventoryItem.
  for (const item of decrement.updatedItems) {
    await deps.enqueue({
      queuedBy: args.raisedBy,
      entity: 'inventoryItem',
      operation: 'update',
      payload: item as unknown as Record<string, unknown>,
    })
  }

  // Fire low-stock notifications (best-effort; failures do NOT roll
  // the dispatch back). The hook checks reorderThreshold !== null
  // already inside decrementInventory.
  for (const trigger of decrement.lowStockTriggers) {
    await broadcastNotification({
      recipientUserIds: recipientsByRole(deps.users, ['Admin', 'OpsHead']),
      senderUserId: 'system',
      kind: 'inventory-low-stock',
      title: `Low stock: ${trigger.skuName}${trigger.cretileGrade ? ` (Grade ${trigger.cretileGrade})` : ''}`,
      body: `Stock dropped to ${trigger.currentStock} units (threshold ${trigger.threshold}) after dispatch ${updatedDispatch.id}.`,
      actionUrl: `/admin/inventory/${encodeURIComponent(trigger.inventoryItemId)}`,
      payload: {
        inventoryItemId: trigger.inventoryItemId,
        skuName: trigger.skuName,
        currentStock: trigger.currentStock,
        threshold: trigger.threshold,
        dispatchId: updatedDispatch.id,
      },
      relatedEntityId: trigger.inventoryItemId,
    }).catch((err) => {
      console.error('[raiseDispatch] inventory-low-stock fan-out failed', err)
    })
  }

  return { ok: true, dispatch: updatedDispatch, docxBytes, wasAlreadyRaised: false }
}

export interface PlaceholderBagInput {
  dispatch: Dispatch
  mou: MOU
  school: School
  company: CompanyConfig
  raisedByName: string
  ts: string
}

/**
 * W4-D.5 docx bag builder: derives the conditional-section data from
 * dispatch.lineItems. Three rendering shapes:
 *   (i)   flat-only      hasFlatItems true,  hasPerGradeItems false
 *   (ii)  per-grade-only hasFlatItems false, hasPerGradeItems true
 *   (iii) mixed          both true; both sections render
 *
 * perGradeRows flattens the discriminated union so the .docx template
 * can render one table row per (sku, grade) pair via a single loop.
 *
 * Exported (W4-H.3) so the dispatch-note re-download route can build
 * the same bag the raise flow uses, ensuring the printed document is
 * byte-identical when state has not changed.
 */
export function buildPlaceholderBag(input: PlaceholderBagInput): Record<string, unknown> {
  const { dispatch, mou, school, company, raisedByName, ts } = input
  const totalInsts = totalInstallments(mou.paymentSchedule)

  const flatItems: Array<{ skuName: string; quantity: string }> = []
  const perGradeRows: Array<{ skuName: string; grade: string; quantity: string }> = []
  let totalQuantity = 0
  for (const item of dispatch.lineItems) {
    if (item.kind === 'flat') {
      flatItems.push({ skuName: item.skuName, quantity: String(item.quantity) })
      totalQuantity += item.quantity
    } else {
      for (const a of item.gradeAllocations) {
        perGradeRows.push({
          skuName: item.skuName,
          grade: String(a.grade),
          quantity: String(a.quantity),
        })
        totalQuantity += a.quantity
      }
    }
  }

  return {
    DISPATCH_NUMBER: dispatch.id,
    DISPATCH_DATE: formatDate(ts),
    MOU_ID: mou.id,
    SCHOOL_NAME: school.name,
    SCHOOL_ADDRESS: [
      school.legalEntity ?? school.name,
      `${school.city}, ${school.state}`,
      school.pinCode ?? '',
    ].filter((s) => s !== '').join('\n'),
    GSL_LEGAL_ENTITY: company.legalEntity,
    GSL_GSTIN: company.gstin,
    GSL_ADDRESS: company.address.join('\n'),
    PROGRAMME: mou.programme,
    PROGRAMME_SUB_TYPE: mou.programmeSubType ?? '',
    INSTALLMENT_LABEL: `Instalment ${dispatch.installmentSeq} of ${totalInsts}`,
    flatItems,
    perGradeRows,
    hasFlatItems: flatItems.length > 0,
    hasPerGradeItems: perGradeRows.length > 0,
    TOTAL_QUANTITY: String(totalQuantity),
    NOTES: buildDispatchNotes(dispatch),
    AUTHORISED_BY: raisedByName,
  }
}
