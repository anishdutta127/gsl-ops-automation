import { describe, expect, it } from 'vitest'
import type { PaymentLog, User, VexPi } from '@/lib/types'
import {
  editPaymentLog,
  voidPaymentLog,
  type PaymentLogMutationDeps,
} from './paymentLogMutations'

const NOW = '2026-06-27T10:00:00.000Z'

function makeUser(): User {
  return {
    id: 'fin1', name: 'Fin', email: 'fin@x.io', role: 'Admin', department: null,
    testingOverride: false, active: true, passwordHash: '', createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  } as User
}

function makeLog(over: Partial<PaymentLog> = {}): PaymentLog {
  return {
    id: 'PL-1', date: '2026-05-01', amount: 50000, mode: 'Bank Transfer',
    reference: 'NEFT-123', narration: null, salesPersonId: null,
    matchedInstallmentIds: [], unmatched: true, loggedBy: 'fin1', loggedAt: NOW,
    notes: null, auditLog: [], ...over,
  } as PaymentLog
}

function makeDeps(logs: PaymentLog[], vexPis: VexPi[] = []): {
  deps: PaymentLogMutationDeps
  logWrites: PaymentLog[]
  voids: string[]
} {
  const logWrites: PaymentLog[] = []
  const voids: string[] = []
  const deps: PaymentLogMutationDeps = {
    logs,
    users: [makeUser()],
    vexPis,
    updateLog: async (l) => { logWrites.push(l) },
    voidLog: async (id) => { voids.push(id) },
    now: () => new Date(NOW),
  }
  return { deps, logWrites, voids }
}

describe('voidPaymentLog (parked-log soft-delete)', () => {
  it('tombstones a parked, unmatched, non-VEX log', async () => {
    const { deps, voids } = makeDeps([makeLog()])
    const res = await voidPaymentLog({ logId: 'PL-1', reason: 'mis-logged twice by mistake', recordedBy: 'fin1' }, deps)
    expect(res.ok).toBe(true)
    expect(voids).toEqual(['PL-1'])
  })

  it('refuses a log still matched to an instalment (unmatch first)', async () => {
    const { deps, voids } = makeDeps([makeLog({ matchedInstallmentIds: ['PAY-9'], unmatched: false })])
    const res = await voidPaymentLog({ logId: 'PL-1', reason: 'long enough reason here', recordedBy: 'fin1' }, deps)
    expect(res).toEqual({ ok: false, reason: 'still-matched' })
    expect(voids).toHaveLength(0)
  })

  it('refuses a log feeding a VexPi (use the VEX action)', async () => {
    const vexPi = { id: 'VEXPI-1', paymentLogIds: ['PL-1'] } as unknown as VexPi
    const { deps, voids } = makeDeps([makeLog({ unmatched: false })], [vexPi])
    const res = await voidPaymentLog({ logId: 'PL-1', reason: 'long enough reason here', recordedBy: 'fin1' }, deps)
    expect(res).toEqual({ ok: false, reason: 'vex-payment' })
    expect(voids).toHaveLength(0)
  })

  it('refuses an already-voided log', async () => {
    const { deps } = makeDeps([makeLog({ voidedAt: NOW })])
    const res = await voidPaymentLog({ logId: 'PL-1', reason: 'long enough reason here', recordedBy: 'fin1' }, deps)
    expect(res).toEqual({ ok: false, reason: 'already-voided' })
  })

  it('requires a reason of at least 10 characters', async () => {
    const { deps, voids } = makeDeps([makeLog()])
    const res = await voidPaymentLog({ logId: 'PL-1', reason: 'nope', recordedBy: 'fin1' }, deps)
    expect(res).toEqual({ ok: false, reason: 'missing-reason' })
    expect(voids).toHaveLength(0)
  })
})

describe('editPaymentLog (parked-log edit)', () => {
  it('edits a parked log', async () => {
    const { deps, logWrites } = makeDeps([makeLog()])
    const res = await editPaymentLog(
      { logId: 'PL-1', amount: 60000, date: '2026-05-02', mode: 'UPI', reference: 'NEW-REF', narration: 'corrected', recordedBy: 'fin1' },
      deps,
    )
    expect(res.ok).toBe(true)
    expect(logWrites[0]!.amount).toBe(60000)
    expect(logWrites[0]!.mode).toBe('UPI')
    expect(logWrites[0]!.reference).toBe('NEW-REF')
  })

  it('refuses an edit that would duplicate another live receipt', async () => {
    const target = makeLog({ id: 'PL-1', reference: 'AAA', amount: 1000 })
    const other = makeLog({ id: 'PL-2', reference: 'BBB', amount: 2000 })
    const { deps, logWrites } = makeDeps([target, other])
    const res = await editPaymentLog(
      { logId: 'PL-1', amount: 2000, date: '2026-05-02', mode: 'Bank Transfer', reference: 'BBB', narration: null, recordedBy: 'fin1' },
      deps,
    )
    expect(res).toEqual({ ok: false, reason: 'duplicate-reference' })
    expect(logWrites).toHaveLength(0)
  })

  it('refuses editing a matched log', async () => {
    const { deps } = makeDeps([makeLog({ matchedInstallmentIds: ['PAY-9'], unmatched: false })])
    const res = await editPaymentLog(
      { logId: 'PL-1', amount: 60000, date: '2026-05-02', mode: 'UPI', reference: 'x', narration: null, recordedBy: 'fin1' },
      deps,
    )
    expect(res).toEqual({ ok: false, reason: 'still-matched' })
  })
})
