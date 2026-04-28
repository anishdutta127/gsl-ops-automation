/*
 * W4-E.5 Notification payload contracts.
 *
 * Single source of truth for what fields each NotificationKind's
 * `payload: Record<string, unknown>` carries. Used by:
 *   - createNotification.ts: runtime validator on every write
 *   - W4-E.6 NotificationBell + /notifications page: render-time
 *     access to payload fields without re-fetching the source entity
 *   - Future maintainers: grep this file for the per-kind spec rather
 *     than chasing through call sites
 *
 * Design choice: per-kind union types rather than a single fat
 * interface. Each kind names exactly the fields it ships with so a
 * dropdown row can render `payload.schoolName` without optional-
 * chaining everywhere.
 *
 * If a future kind needs additional fields, extend the matching
 * interface here AND update createNotification's validator AND
 * (if applicable) the rendering code in W4-E.6. Don't smuggle new
 * fields through the loose Record<string, unknown> escape hatch.
 */

import type { NotificationKind } from '@/lib/types'

// ----------------------------------------------------------------------------
// Per-kind payload interfaces
// ----------------------------------------------------------------------------

export interface DispatchRequestCreatedPayload {
  requestId: string
  requesterName: string
  mouId: string
  schoolName: string
  installmentSeq: number
  lineItemCount: number
  totalQuantity: number
}

export interface DispatchRequestApprovedPayload {
  requestId: string
  reviewerName: string
  mouId: string
  schoolName: string
  conversionDispatchId: string
}

export interface DispatchRequestRejectedPayload {
  requestId: string
  reviewerName: string
  mouId: string
  schoolName: string
  rejectionReason: string
}

export interface DispatchRequestCancelledPayload {
  requestId: string
  cancellerName: string
  mouId: string
  schoolName: string
}

export interface IntakeCompletedPayload {
  intakeRecordId: string
  mouId: string
  schoolName: string
  completedByName: string
  studentsAtIntake: number
  hasVariance: boolean
}

export interface PaymentRecordedPayload {
  paymentId: string
  mouId: string
  schoolName: string
  installmentSeq: number
  recorderName: string
  receivedAmount: number
  hasVariance: boolean
}

export interface EscalationAssignedPayload {
  escalationId: string
  mouId: string | null
  schoolName: string | null
  lane: string
  level: string
  severity: string
  description: string
}

export interface ReminderDuePayload {
  communicationId: string
  reminderKind: string
  mouId: string | null
  schoolName: string
  composerName: string
  daysOverdue: number
}

export interface InventoryLowStockPayload {
  inventoryItemId: string
  skuName: string
  currentStock: number
  threshold: number
  /** The dispatch whose decrement crossed the threshold; null when the
   * crossing fired from a manual stock-edit downward. */
  dispatchId: string | null
}

// ----------------------------------------------------------------------------
// Discriminated union (informational; createNotification accepts loose payload
// and validates field-by-field using the validators below).
// ----------------------------------------------------------------------------

export type NotificationPayloadByKind = {
  'dispatch-request-created': DispatchRequestCreatedPayload
  'dispatch-request-approved': DispatchRequestApprovedPayload
  'dispatch-request-rejected': DispatchRequestRejectedPayload
  'dispatch-request-cancelled': DispatchRequestCancelledPayload
  'intake-completed': IntakeCompletedPayload
  'payment-recorded': PaymentRecordedPayload
  'escalation-assigned': EscalationAssignedPayload
  'reminder-due': ReminderDuePayload
  'inventory-low-stock': InventoryLowStockPayload
}

// ----------------------------------------------------------------------------
// Runtime validators
// ----------------------------------------------------------------------------

function isString(x: unknown): x is string {
  return typeof x === 'string'
}
function isNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}
function isBool(x: unknown): x is boolean {
  return typeof x === 'boolean'
}
function isStringOrNull(x: unknown): x is string | null {
  return x === null || typeof x === 'string'
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; missing: string[]; wrongType: string[] }

function check(
  payload: Record<string, unknown>,
  required: Record<string, (v: unknown) => boolean>,
): ValidationResult {
  const missing: string[] = []
  const wrongType: string[] = []
  for (const [key, predicate] of Object.entries(required)) {
    if (!(key in payload)) {
      missing.push(key)
    } else if (!predicate(payload[key])) {
      wrongType.push(key)
    }
  }
  if (missing.length === 0 && wrongType.length === 0) return { ok: true }
  return { ok: false, missing, wrongType }
}

export const PAYLOAD_VALIDATORS: Record<
  NotificationKind,
  (payload: Record<string, unknown>) => ValidationResult
> = {
  'dispatch-request-created': (p) =>
    check(p, {
      requestId: isString,
      requesterName: isString,
      mouId: isString,
      schoolName: isString,
      installmentSeq: isNumber,
      lineItemCount: isNumber,
      totalQuantity: isNumber,
    }),
  'dispatch-request-approved': (p) =>
    check(p, {
      requestId: isString,
      reviewerName: isString,
      mouId: isString,
      schoolName: isString,
      conversionDispatchId: isString,
    }),
  'dispatch-request-rejected': (p) =>
    check(p, {
      requestId: isString,
      reviewerName: isString,
      mouId: isString,
      schoolName: isString,
      rejectionReason: isString,
    }),
  'dispatch-request-cancelled': (p) =>
    check(p, {
      requestId: isString,
      cancellerName: isString,
      mouId: isString,
      schoolName: isString,
    }),
  'intake-completed': (p) =>
    check(p, {
      intakeRecordId: isString,
      mouId: isString,
      schoolName: isString,
      completedByName: isString,
      studentsAtIntake: isNumber,
      hasVariance: isBool,
    }),
  'payment-recorded': (p) =>
    check(p, {
      paymentId: isString,
      mouId: isString,
      schoolName: isString,
      installmentSeq: isNumber,
      recorderName: isString,
      receivedAmount: isNumber,
      hasVariance: isBool,
    }),
  'escalation-assigned': (p) =>
    check(p, {
      escalationId: isString,
      mouId: isStringOrNull,
      schoolName: isStringOrNull,
      lane: isString,
      level: isString,
      severity: isString,
      description: isString,
    }),
  'reminder-due': (p) =>
    check(p, {
      communicationId: isString,
      reminderKind: isString,
      mouId: isStringOrNull,
      schoolName: isString,
      composerName: isString,
      daysOverdue: isNumber,
    }),
  'inventory-low-stock': (p) =>
    check(p, {
      inventoryItemId: isString,
      skuName: isString,
      currentStock: isNumber,
      threshold: isNumber,
      dispatchId: isStringOrNull,
    }),
}
