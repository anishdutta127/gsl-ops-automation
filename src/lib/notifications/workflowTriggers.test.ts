/*
 * Gate 4 Step 2: workflow trigger fan-out smoke tests.
 *
 * Mocks broadcastNotification + recipientsByRole and verifies each
 * helper picks the right department fan-out and ships the validated
 * payload shape.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { broadcastSpy, recipientsSpy } = vi.hoisted(() => ({
  broadcastSpy: vi.fn(
    async (_args: {
      kind: string
      recipientUserIds: string[]
      payload: Record<string, unknown>
    }) => ({ created: [], skipped: [] }),
  ),
  recipientsSpy: vi.fn((_users: unknown[], roles: string[]) => roles),
}))

vi.mock('./createNotification', () => ({
  broadcastNotification: broadcastSpy,
  recipientsByRole: recipientsSpy,
}))

import {
  emitDispatchExecuted,
  emitKitsAllocatedForApproval,
  emitMouUploaded,
  emitPodUploaded,
} from './workflowTriggers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emitMouUploaded', () => {
  it('fans out to Ops + Finance roles', async () => {
    await emitMouUploaded({
      mouId: 'MOU-1',
      schoolName: 'Sunrise',
      programme: 'STEAM',
      contractValue: 500000,
      importedFrom: 'sheet-import',
      senderUserId: 'system',
    })
    expect(recipientsSpy).toHaveBeenCalledTimes(1)
    const rolesArg = recipientsSpy.mock.calls[0]?.[1] as string[]
    expect(rolesArg).toEqual(
      expect.arrayContaining(['OpsHead', 'OpsEmployee', 'Finance']),
    )
    expect(broadcastSpy).toHaveBeenCalledTimes(1)
    expect(broadcastSpy.mock.calls[0]?.[0].kind).toBe('mou-uploaded')
    expect(broadcastSpy.mock.calls[0]?.[0].payload).toMatchObject({
      mouId: 'MOU-1',
      schoolName: 'Sunrise',
      programme: 'STEAM',
      contractValue: 500000,
      importedFrom: 'sheet-import',
    })
  })
})

describe('emitKitsAllocatedForApproval', () => {
  it('fans out to Sales roles for Sales approval (Misba #3 remap)', async () => {
    await emitKitsAllocatedForApproval({
      kitDispatchId: 'DISPATCH-MOU-1',
      mouId: 'MOU-1',
      schoolName: 'Sunrise',
      allocationCount: 3,
      totalKits: 90,
      senderUserId: 'misba.m',
    })
    const rolesArg = recipientsSpy.mock.calls[0]?.[1] as string[]
    expect(rolesArg).toEqual(expect.arrayContaining(['SalesHead', 'SalesRep']))
    expect(rolesArg).not.toEqual(expect.arrayContaining(['OpsHead']))
    expect(broadcastSpy.mock.calls[0]?.[0].kind).toBe('kits-allocated-for-approval')
  })
})

describe('emitDispatchExecuted', () => {
  it('fans out to Ops + Sales when Tally DC uploaded', async () => {
    await emitDispatchExecuted({
      kitDispatchId: 'DISPATCH-MOU-1',
      mouId: 'MOU-1',
      schoolName: 'Sunrise',
      taxInvoiceNumber: 'GSL/OPS/26-27/0001',
      taxInvoiceDate: '2026-05-10',
      senderUserId: 'pranav.p',
    })
    const rolesArg = recipientsSpy.mock.calls[0]?.[1] as string[]
    expect(rolesArg).toEqual(
      expect.arrayContaining(['OpsHead', 'OpsEmployee', 'SalesHead', 'SalesRep']),
    )
    expect(broadcastSpy.mock.calls[0]?.[0].kind).toBe('dispatch-executed')
  })
})

describe('emitPodUploaded', () => {
  it('fans out to Finance + Sales when POD uploaded', async () => {
    await emitPodUploaded({
      kitDispatchId: 'DISPATCH-MOU-1',
      mouId: 'MOU-1',
      schoolName: 'Sunrise',
      deliveredOn: '2026-05-09',
      senderUserId: 'misba.m',
    })
    const rolesArg = recipientsSpy.mock.calls[0]?.[1] as string[]
    expect(rolesArg).toEqual(
      expect.arrayContaining(['Finance', 'SalesHead', 'SalesRep']),
    )
    expect(broadcastSpy.mock.calls[0]?.[0].kind).toBe('pod-uploaded')
  })
})
