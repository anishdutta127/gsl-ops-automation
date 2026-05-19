/*
 * Batch payment recording (Phase 4, 2026-05-19).
 *
 * Pranav's typical workflow: a school sends a Rs 4.5L bank transfer
 * to settle three quarterly instalments at once. Pre-Phase-4 this
 * was three round-trips through /finance/payments/new (each with
 * its own UTR re-entry and date re-entry). The batch form pivots
 * the entry to per-school: pick the school, fill bank + TDS per
 * outstanding instalment, submit once, N Payment rows update.
 *
 * The lib is a thin wrapper around `recordReceipt`. Each row in the
 * batch produces a single recordReceipt call; failures on individual
 * rows do not roll back the rows that succeeded (the queue write
 * model is append-only and the in-memory state already reflects the
 * partial success). The result carries per-row outcomes so the UI
 * can render "3 of 4 saved" with the failing row's reason visible.
 */

import type { Payment, PaymentMode, User } from '@/lib/types'
import paymentsJson from '@/data/payments.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  recordReceipt,
  type RecordReceiptArgs,
  type RecordReceiptDeps,
  type RecordReceiptOutcome,
} from './recordReceipt'

export interface BatchRowInput {
  paymentId: string
  bankAmount: number
  tdsAmount: number
}

export interface RecordBatchArgs {
  rows: BatchRowInput[]
  receivedDate: string                  // ISO yyyy-mm-dd; shared across all rows
  paymentMode: PaymentMode              // shared; the bank transfer mode
  bankReference: string | null          // shared (single UTR for the whole batch)
  notes: string | null
  recordedBy: string
}

export type BatchRowOutcome =
  | {
      ok: true
      paymentId: string
      receivedAmount: number
      bankAmount: number
      tdsAmount: number
      hasVariance: boolean
    }
  | { ok: false; paymentId: string; reason: string }

export interface RecordBatchResult {
  outcomes: BatchRowOutcome[]
  okCount: number
  failCount: number
  /** Sum of bank amounts of successful rows; useful for the match-suggestion banner. */
  totalBankAmount: number
  /** Sum of TDS amounts of successful rows. */
  totalTdsAmount: number
}

export interface RecordBatchDeps {
  recordReceiptFn: (args: RecordReceiptArgs, deps?: RecordReceiptDeps) => Promise<RecordReceiptOutcome>
  recordReceiptDeps: RecordReceiptDeps
}

const defaultRecordReceiptDeps: RecordReceiptDeps = {
  payments: paymentsJson as unknown as Payment[],
  users: usersJson as unknown as User[],
  mous: [],
  salesTeam: [],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

const defaultDeps: RecordBatchDeps = {
  recordReceiptFn: recordReceipt,
  recordReceiptDeps: defaultRecordReceiptDeps,
}

export async function recordBatch(
  args: RecordBatchArgs,
  deps: RecordBatchDeps = defaultDeps,
): Promise<RecordBatchResult> {
  const outcomes: BatchRowOutcome[] = []
  let okCount = 0
  let failCount = 0
  let totalBankAmount = 0
  let totalTdsAmount = 0

  for (const row of args.rows) {
    const receivedAmount = (row.bankAmount ?? 0) + (row.tdsAmount ?? 0)
    if (receivedAmount <= 0) {
      // Empty row (operator skipped). Drop silently rather than fail.
      continue
    }

    const outcome = await deps.recordReceiptFn(
      {
        paymentId: row.paymentId,
        receivedDate: args.receivedDate,
        receivedAmount,
        paymentMode: args.paymentMode,
        bankReference: args.bankReference,
        notes: args.notes,
        recordedBy: args.recordedBy,
        bankAmount: row.bankAmount,
        tdsAmount: row.tdsAmount,
      },
      deps.recordReceiptDeps,
    )

    if (outcome.ok) {
      okCount += 1
      totalBankAmount += row.bankAmount
      totalTdsAmount += row.tdsAmount
      outcomes.push({
        ok: true,
        paymentId: row.paymentId,
        receivedAmount,
        bankAmount: row.bankAmount,
        tdsAmount: row.tdsAmount,
        hasVariance: outcome.hasVariance,
      })
    } else {
      failCount += 1
      outcomes.push({
        ok: false,
        paymentId: row.paymentId,
        reason: outcome.reason,
      })
    }
  }

  return { outcomes, okCount, failCount, totalBankAmount, totalTdsAmount }
}
