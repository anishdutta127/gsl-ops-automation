/*
 * Phase 6C PI backfill apply layer.
 *
 * Applies a single payment's PI backfill:
 *   - Either auto-mints a fresh PI number from the FY-aware counter
 *     (entity derived from the parent MOU's programme via
 *     programmeRouting; FY derived from the MOU's academicYear).
 *   - Or accepts a Pranav-supplied manual PI number (string passes
 *     through unchanged so historic numbers from his Excel can be
 *     written verbatim).
 *
 * Writes:
 *   - Update Payment with piNumber + piSentDate + piGeneratedAt set
 *     to the apply timestamp. Adds 'pi-backfill-applied' audit entry.
 *   - Update MOU auditLog with a matching 'pi-backfill-applied' entry
 *     so the change is traceable from MOU detail.
 *
 * Discipline: each apply is atomic at the queue level (one payment +
 * one MOU update enqueued per row). The page batches multiple rows
 * sequentially.
 */

import type { AuditEntry, MOU, Payment } from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  fyFromAcademicYear,
  getEntityForProgramme,
} from '@/lib/mouSystem/company'
import { issuePiNumberAtomic } from '@/lib/mouSystem/piCounterAtomic'

export interface ApplyBackfillArgs {
  payment: Payment
  mou: MOU | null
  /** When set, the PI number is used verbatim. When null, the system mints a fresh one. */
  manualPiNumber: string | null
  appliedBy: string
  /** Trace string for the audit entry (which Pratik candidate, etc.). */
  matchNotes: string
  enqueue?: typeof enqueueUpdate
  issueCounter?: typeof issuePiNumberAtomic
  now?: () => Date
}

export type ApplyBackfillResult =
  | { ok: true; piNumber: string }
  | { ok: false; reason: 'mou-missing' | 'mou-academic-year-unparseable' | 'enqueue-failed'; message: string }

export async function applyBackfillRow(
  args: ApplyBackfillArgs,
): Promise<ApplyBackfillResult> {
  const enqueue = args.enqueue ?? enqueueUpdate
  const issueCounter = args.issueCounter ?? issuePiNumberAtomic
  const now = args.now ?? (() => new Date())
  const ts = now().toISOString()
  const manual = args.manualPiNumber?.trim() ?? null

  let piNumber: string
  if (manual !== null && manual !== '') {
    piNumber = manual
  } else {
    if (!args.mou) {
      return {
        ok: false,
        reason: 'mou-missing',
        message: `Cannot auto-mint PI: payment ${args.payment.id} references mouId ${args.payment.mouId} which is not in mous.json (orphan). Provide a manual PI number.`,
      }
    }
    let fyDisplay: string
    try {
      fyDisplay = fyFromAcademicYear(args.mou.academicYear).display
    } catch {
      return {
        ok: false,
        reason: 'mou-academic-year-unparseable',
        message: `Cannot derive PI fiscal year: MOU.academicYear='${args.mou.academicYear}' did not parse.`,
      }
    }
    const entityKey = getEntityForProgramme(args.mou.programme)
    const issued = await issueCounter(entityKey, fyDisplay)
    piNumber = issued.piNumber
  }

  // Build updated Payment.
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.appliedBy,
    action: 'pi-backfill-applied',
    before: { piNumber: null },
    after: { piNumber },
    notes: args.matchNotes,
  }
  const updatedPayment: Payment = {
    ...args.payment,
    piNumber,
    piSentDate: args.payment.piSentDate ?? ts,
    piGeneratedAt: args.payment.piGeneratedAt ?? ts,
    auditLog: [...(args.payment.auditLog ?? []), auditEntry],
  }

  try {
    await enqueue({
      queuedBy: args.appliedBy,
      entity: 'payment',
      operation: 'update',
      payload: updatedPayment as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return {
      ok: false,
      reason: 'enqueue-failed',
      message: e instanceof Error ? e.message : String(e),
    }
  }

  if (args.mou) {
    const mouAudit: AuditEntry = {
      timestamp: ts,
      user: args.appliedBy,
      action: 'pi-backfill-applied',
      after: { paymentId: args.payment.id, piNumber },
      notes: args.matchNotes,
    }
    const updatedMou: MOU = {
      ...args.mou,
      auditLog: [...args.mou.auditLog, mouAudit],
    }
    try {
      await enqueue({
        queuedBy: args.appliedBy,
        entity: 'mou',
        operation: 'update',
        payload: updatedMou as unknown as Record<string, unknown>,
      })
    } catch (e) {
      // Payment already enqueued; MOU audit failure is logged but not
      // fatal. The page surfaces the warning.
      return {
        ok: false,
        reason: 'enqueue-failed',
        message: `MOU audit enqueue failed after payment ${args.payment.id} was updated: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  return { ok: true, piNumber }
}
