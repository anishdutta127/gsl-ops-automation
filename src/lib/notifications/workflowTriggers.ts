/*
 * Workflow notification triggers (Gate 4 Step 2).
 *
 * Wrappers around broadcastNotification that compose the right
 * recipient list + payload for the three new lifecycle moments
 * introduced by Misba's 7-step workflow doc:
 *
 *   1. mou-uploaded                Ops + Finance fan-out on import.
 *   2. kits-allocated-for-approval Sales fan-out when Ops finishes
 *                                  allocating kits and the dispatch
 *                                  awaits Sales sign-off.
 *   3. dispatch-executed           Ops + Sales fan-out when Tally
 *                                  Delivery Challan is uploaded.
 *   4. pod-uploaded                Finance + Sales fan-out when POD
 *                                  is uploaded.
 *
 * Each helper takes the entity payload it needs, looks up the
 * department fan-out from the active user list, dedups + self-excludes
 * via the central createNotification helper. Callers are responsible
 * for calling these AFTER the canonical entity write succeeds.
 *
 * Each call is best-effort: a fan-out failure does not roll back the
 * entity write. The createNotification helper logs skip reasons that
 * trigger-wiring tests assert against.
 */

import usersJson from '@/data/users.json'
import type { User } from '@/lib/types'
import {
  broadcastNotification,
  recipientsByRole,
} from './createNotification'
import { getStageResponsibility } from '@/lib/stageResponsibility'
import type { LifecycleStage } from '@/lib/statusTracker'

const allUsers = usersJson as unknown as User[]

const OPS_ROLES: User['role'][] = ['OpsHead', 'OpsEmployee']
const SALES_ROLES: User['role'][] = ['SalesHead', 'SalesRep']
const FINANCE_ROLES: User['role'][] = ['Finance']

/**
 * Gate 4.9 Step 6: when stage responsibility has a `responsibleUserId`
 * override for the given stage, narrow notification fan-out to that
 * single user. When no override is set, fall back to the department
 * broadcast computed by the caller. Returns the final recipient list
 * with the override user (if any) deduped at the head.
 */
function applyStageOverride(
  stage: LifecycleStage,
  baseRecipients: string[],
): string[] {
  const responsibility = getStageResponsibility(stage)
  const override = responsibility.responsibleUserId
  if (!override) return baseRecipients
  // Confirm the override user is still active. If they have been
  // deactivated, silently fall back to the department broadcast so the
  // signal does not vanish.
  const user = allUsers.find((u) => u.id === override)
  if (!user || !user.active) return baseRecipients
  // Narrow to the single user. We include the user FIRST so the
  // createNotification dedup keeps their delivery even if the
  // department broadcast also includes them.
  return [override]
}

export interface EmitMouUploadedArgs {
  mouId: string
  schoolName: string
  programme: string
  contractValue: number
  importedFrom: 'sheet-import' | 'manual'
  senderUserId: string
}

export async function emitMouUploaded(args: EmitMouUploadedArgs): Promise<void> {
  const baseRecipients = recipientsByRole(allUsers, [...OPS_ROLES, ...FINANCE_ROLES])
  const recipients = applyStageOverride('mou-uploaded', baseRecipients)
  if (recipients.length === 0) return
  await broadcastNotification({
    recipientUserIds: recipients,
    senderUserId: args.senderUserId,
    kind: 'mou-uploaded',
    title: `MOU uploaded: ${args.schoolName}`,
    body: `${args.programme} programme, ${args.mouId}`,
    actionUrl: `/mous/${args.mouId}`,
    payload: {
      mouId: args.mouId,
      schoolName: args.schoolName,
      programme: args.programme,
      contractValue: args.contractValue,
      importedFrom: args.importedFrom,
    },
    relatedEntityId: args.mouId,
  })
}

export interface EmitKitsAllocatedArgs {
  kitDispatchId: string
  mouId: string
  schoolName: string
  allocationCount: number
  totalKits: number
  senderUserId: string
}

export async function emitKitsAllocatedForApproval(
  args: EmitKitsAllocatedArgs,
): Promise<void> {
  const baseRecipients = recipientsByRole(allUsers, SALES_ROLES)
  const recipients = applyStageOverride('dispatch-requested', baseRecipients)
  if (recipients.length === 0) return
  await broadcastNotification({
    recipientUserIds: recipients,
    senderUserId: args.senderUserId,
    kind: 'kits-allocated-for-approval',
    title: `Kits allocated: ${args.schoolName}`,
    body: `${args.totalKits} kits across ${args.allocationCount} grades; Sales approval needed`,
    actionUrl: `/dispatch/kits/${args.mouId}`,
    payload: {
      kitDispatchId: args.kitDispatchId,
      mouId: args.mouId,
      schoolName: args.schoolName,
      allocationCount: args.allocationCount,
      totalKits: args.totalKits,
    },
    relatedEntityId: args.kitDispatchId,
  })
}

export interface EmitDispatchExecutedArgs {
  kitDispatchId: string
  mouId: string
  schoolName: string
  taxInvoiceNumber: string | null
  taxInvoiceDate: string | null
  senderUserId: string
}

export async function emitDispatchExecuted(args: EmitDispatchExecutedArgs): Promise<void> {
  const baseRecipients = recipientsByRole(allUsers, [...OPS_ROLES, ...SALES_ROLES])
  const recipients = applyStageOverride('shipment-in-progress', baseRecipients)
  if (recipients.length === 0) return
  await broadcastNotification({
    recipientUserIds: recipients,
    senderUserId: args.senderUserId,
    kind: 'dispatch-executed',
    title: `Dispatch executed: ${args.schoolName}`,
    body: args.taxInvoiceNumber
      ? `Tax invoice ${args.taxInvoiceNumber} issued; shipment in flight`
      : `Shipment in flight; tax invoice details pending`,
    actionUrl: `/dispatch/kits/${args.mouId}`,
    payload: {
      kitDispatchId: args.kitDispatchId,
      mouId: args.mouId,
      schoolName: args.schoolName,
      taxInvoiceNumber: args.taxInvoiceNumber,
      taxInvoiceDate: args.taxInvoiceDate,
    },
    relatedEntityId: args.kitDispatchId,
  })
}

export interface EmitPodUploadedArgs {
  kitDispatchId: string
  mouId: string
  schoolName: string
  deliveredOn: string
  senderUserId: string
}

export async function emitPodUploaded(args: EmitPodUploadedArgs): Promise<void> {
  const baseRecipients = recipientsByRole(allUsers, [...FINANCE_ROLES, ...SALES_ROLES])
  const recipients = applyStageOverride('delivered', baseRecipients)
  if (recipients.length === 0) return
  await broadcastNotification({
    recipientUserIds: recipients,
    senderUserId: args.senderUserId,
    kind: 'pod-uploaded',
    title: `POD uploaded: ${args.schoolName}`,
    body: `Delivered on ${args.deliveredOn}; Finance to raise tax invoice`,
    actionUrl: `/dispatch/kits/${args.mouId}`,
    payload: {
      kitDispatchId: args.kitDispatchId,
      mouId: args.mouId,
      schoolName: args.schoolName,
      deliveredOn: args.deliveredOn,
    },
    relatedEntityId: args.kitDispatchId,
  })
}
