import { describe, expect, it, vi } from 'vitest'
import { recordBatch, type RecordBatchDeps } from './recordBatch'
import type { RecordReceiptDeps, RecordReceiptOutcome, RecordReceiptArgs } from './recordReceipt'

function makeOkOutcome(args: RecordReceiptArgs): RecordReceiptOutcome {
  return {
    ok: true,
    varianceRs: 0,
    hasVariance: false,
    payment: {
      id: args.paymentId,
      mouId: 'MOU-X',
      schoolName: 'Test',
      programme: 'STEAM',
      instalmentLabel: '1 of 4',
      instalmentSeq: 1,
      totalInstalments: 4,
      description: '',
      dueDateRaw: null,
      dueDateIso: null,
      expectedAmount: 100000,
      receivedAmount: args.receivedAmount,
      receivedDate: args.receivedDate,
      paymentMode: args.paymentMode,
      bankReference: args.bankReference,
      piNumber: null,
      taxInvoiceNumber: null,
      status: 'Paid',
      notes: null,
      piSentDate: null,
      piSentTo: null,
      piGeneratedAt: null,
      studentCountActual: null,
      partialPayments: null,
      auditLog: [],
      bankAmount: args.bankAmount ?? null,
      tdsAmount: args.tdsAmount ?? null,
    },
  }
}

function makeDeps(
  perRow: (args: RecordReceiptArgs) => RecordReceiptOutcome,
): { deps: RecordBatchDeps; calls: RecordReceiptArgs[] } {
  const calls: RecordReceiptArgs[] = []
  const fn = vi.fn(async (args: RecordReceiptArgs) => {
    calls.push(args)
    return perRow(args)
  })
  return {
    deps: {
      recordReceiptFn: fn as unknown as RecordBatchDeps['recordReceiptFn'],
      recordReceiptDeps: {} as RecordReceiptDeps,
    },
    calls,
  }
}

describe('recordBatch', () => {
  it('happy path: 3 rows with bank + TDS each create 3 recordReceipt calls', async () => {
    const { deps, calls } = makeDeps(makeOkOutcome)
    const res = await recordBatch(
      {
        rows: [
          { paymentId: 'MOU-X-i1', bankAmount: 95000, tdsAmount: 5000 },
          { paymentId: 'MOU-X-i2', bankAmount: 95000, tdsAmount: 5000 },
          { paymentId: 'MOU-X-i3', bankAmount: 95000, tdsAmount: 5000 },
        ],
        receivedDate: '2026-05-10',
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-BATCH-1',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.okCount).toBe(3)
    expect(res.failCount).toBe(0)
    expect(res.totalBankAmount).toBe(95000 * 3)
    expect(res.totalTdsAmount).toBe(5000 * 3)
    expect(calls).toHaveLength(3)
    expect(calls[0]?.bankReference).toBe('UTR-BATCH-1')
    expect(calls[0]?.receivedAmount).toBe(100000)
  })

  it('skips rows with both amounts blank (zero total)', async () => {
    const { deps, calls } = makeDeps(makeOkOutcome)
    const res = await recordBatch(
      {
        rows: [
          { paymentId: 'MOU-X-i1', bankAmount: 100000, tdsAmount: 0 },
          { paymentId: 'MOU-X-i2', bankAmount: 0, tdsAmount: 0 },
          { paymentId: 'MOU-X-i3', bankAmount: 100000, tdsAmount: 0 },
        ],
        receivedDate: '2026-05-10',
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-SKIP',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(calls).toHaveLength(2)
    expect(res.okCount).toBe(2)
  })

  it('failure on one row does not block others; outcomes carry per-row status', async () => {
    let i = 0
    const { deps } = makeDeps((args) => {
      i += 1
      if (i === 2) {
        return { ok: false, reason: 'invalid-tds-split' }
      }
      return makeOkOutcome(args)
    })
    const res = await recordBatch(
      {
        rows: [
          { paymentId: 'MOU-X-i1', bankAmount: 100000, tdsAmount: 0 },
          { paymentId: 'MOU-X-i2', bankAmount: 100000, tdsAmount: 0 },
          { paymentId: 'MOU-X-i3', bankAmount: 100000, tdsAmount: 0 },
        ],
        receivedDate: '2026-05-10',
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-PARTIAL-OK',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.okCount).toBe(2)
    expect(res.failCount).toBe(1)
    expect(res.outcomes[1]).toMatchObject({ ok: false, paymentId: 'MOU-X-i2', reason: 'invalid-tds-split' })
  })

  it('returns zero counts when every row is blank', async () => {
    const { deps, calls } = makeDeps(makeOkOutcome)
    const res = await recordBatch(
      {
        rows: [
          { paymentId: 'MOU-X-i1', bankAmount: 0, tdsAmount: 0 },
          { paymentId: 'MOU-X-i2', bankAmount: 0, tdsAmount: 0 },
        ],
        receivedDate: '2026-05-10',
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-EMPTY',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.okCount).toBe(0)
    expect(res.failCount).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('passes bankAmount + tdsAmount to recordReceipt per row', async () => {
    const { deps, calls } = makeDeps(makeOkOutcome)
    await recordBatch(
      {
        rows: [{ paymentId: 'MOU-X-i1', bankAmount: 142500, tdsAmount: 7500 }],
        receivedDate: '2026-05-10',
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-KAVYAPTA',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(calls[0]?.bankAmount).toBe(142500)
    expect(calls[0]?.tdsAmount).toBe(7500)
    expect(calls[0]?.receivedAmount).toBe(150000)
  })
})
