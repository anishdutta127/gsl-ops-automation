/*
 * W4-E.5 trigger wiring smoke tests.
 *
 * Mocks the @/lib/notifications/createNotification module so the
 * trigger sites' fire-and-forget calls are observable. Verifies each
 * mutator (createRequest, approveRequest, rejectRequest, cancelRequest,
 * recordIntake, recordReceipt, composeReminder) calls the correct
 * notification helper (broadcast vs single) with a payload that names
 * the expected NotificationKind.
 *
 * The createNotification + broadcastNotification implementations
 * themselves are covered by createNotification.test.ts; this file
 * only verifies the wiring.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { broadcastSpy, createSpy, recipientsByRoleSpy } = vi.hoisted(() => ({
  broadcastSpy: vi.fn(async (_args: { kind: string; recipientUserIds: string[] }) => ({
    created: [],
    skipped: [],
  })),
  createSpy: vi.fn(async (_args: { kind: string; recipientUserId: string }) => ({
    created: [],
    skipped: [],
  })),
  recipientsByRoleSpy: vi.fn((users: Array<{ id: string }>) =>
    users.map((u) => u.id),
  ),
}))

vi.mock('@/lib/notifications/createNotification', () => ({
  broadcastNotification: broadcastSpy,
  createNotification: createSpy,
  recipientsByRole: recipientsByRoleSpy,
}))

import type {
  CcRule,
  DispatchRequest,
  MOU,
  Payment,
  PendingUpdate,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import { createRequest } from '@/lib/dispatch/createRequest'
import {
  approveRequest,
  rejectRequest,
  cancelRequest,
} from '@/lib/dispatch/reviewRequest'
import { recordIntake } from '@/lib/intake/recordIntake'
import { recordReceipt } from '@/lib/payment/recordReceipt'
import { composeReminder } from '@/lib/reminders/composeReminder'

const NOW = new Date('2026-04-28T12:00:00.000Z')
const isoDaysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  broadcastSpy.mockClear()
  createSpy.mockClear()
  recipientsByRoleSpy.mockClear()
})

function user(id: string, role: User['role'], overrides: Partial<User> = {}): User {
  return {
    id,
    name: id,
    email: `${id}@getsetlearn.info`,
    role,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function school(id: string): School {
  return {
    id,
    name: id,
    legalEntity: null,
    city: 'Bangalore',
    state: 'Karnataka',
    region: 'South-West',
    pinCode: null,
    contactPerson: 'Principal',
    email: 'spoc@example.in',
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function mou(id: string, schoolId: string, overrides: Partial<MOU> = {}): MOU {
  return {
    id,
    schoolId,
    schoolName: schoolId,
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 0,
    spWithTax: 0,
    contractValue: 0,
    received: 0,
    tds: 0,
    balance: 0,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function makeEnqueue() {
  const calls: PendingUpdate[] = []
  let i = 0
  const enqueue = vi.fn(async (params) => {
    const entry: PendingUpdate = {
      id: 'P-' + ++i,
      queuedAt: NOW.toISOString(),
      retryCount: 0,
      ...params,
    }
    calls.push(entry)
    return entry
  })
  return { enqueue, calls }
}

const SP_VIKRAM: SalesPerson = {
  id: 'sp-vikram',
  name: 'Vikram',
  email: 'sp@x.in',
  phone: null,
  territories: [],
  programmes: ['STEAM'],
  active: true,
  joinedDate: '2025-04-01',
}

describe('W4-E.5 trigger wiring', () => {
  it('createRequest fires broadcastNotification with kind=dispatch-request-created', async () => {
    const requester = user('vishwanath.g', 'SalesRep')
    const opsHead = user('opshead', 'OpsHead')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const { enqueue } = makeEnqueue()
    const result = await createRequest(
      {
        mouId: m.id,
        installmentSeq: 1,
        requestReason: 'Initial dispatch',
        lineItems: [{ kind: 'flat', skuName: 'Tinkr', quantity: 30 }],
        notes: null,
        requestedBy: requester.id,
      },
      {
        mous: [m],
        schools: [sch],
        users: [requester, opsHead],
        intakeRecords: [],
        dispatchRequests: [],
        salesPersons: [SP_VIKRAM],
        inventoryItems: [],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
      },
    )
    expect(result.ok).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledTimes(1)
    expect(broadcastSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'dispatch-request-created',
    })
  })

  it('approveRequest fires createNotification with kind=dispatch-request-approved', async () => {
    const requester = user('vishwanath.g', 'SalesRep')
    const reviewer = user('opshead', 'OpsHead')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const dr: DispatchRequest = {
      id: 'DR-1', mouId: m.id, schoolId: sch.id, requestedBy: requester.id,
      requestedAt: isoDaysAgo(1), requestReason: 'pilot', installmentSeq: 1,
      lineItems: [{ kind: 'flat', skuName: 'X', quantity: 10 }],
      status: 'pending-approval', conversionDispatchId: null,
      rejectionReason: null, reviewedBy: null, reviewedAt: null, notes: null, auditLog: [],
    }
    const { enqueue } = makeEnqueue()
    const result = await approveRequest(
      { requestId: dr.id, reviewedBy: reviewer.id },
      {
        mous: [m], schools: [sch], users: [requester, reviewer],
        dispatches: [], dispatchRequests: [dr],
        inventoryItems: [
          {
            id: 'INV-X', skuName: 'X', category: 'Other',
            cretileGrade: null, mastersheetSourceName: null,
            currentStock: 1000, reorderThreshold: null, notes: null,
            active: true, lastUpdatedAt: NOW.toISOString(),
            lastUpdatedBy: 'system-test', auditLog: [],
          },
        ],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
      },
    )
    expect(result.ok).toBe(true)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'dispatch-request-approved',
      recipientUserId: requester.id,
    })
  })

  it('rejectRequest fires createNotification with kind=dispatch-request-rejected', async () => {
    const requester = user('vishwanath.g', 'SalesRep')
    const reviewer = user('opshead', 'OpsHead')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const dr: DispatchRequest = {
      id: 'DR-1', mouId: m.id, schoolId: sch.id, requestedBy: requester.id,
      requestedAt: isoDaysAgo(1), requestReason: 'pilot', installmentSeq: 1,
      lineItems: [{ kind: 'flat', skuName: 'X', quantity: 10 }],
      status: 'pending-approval', conversionDispatchId: null,
      rejectionReason: null, reviewedBy: null, reviewedAt: null, notes: null, auditLog: [],
    }
    const { enqueue } = makeEnqueue()
    const result = await rejectRequest(
      { requestId: dr.id, reviewedBy: reviewer.id, rejectionReason: 'Wrong SKU' },
      {
        mous: [m], schools: [sch], users: [requester, reviewer],
        dispatches: [], dispatchRequests: [dr],
        inventoryItems: [],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
      },
    )
    expect(result.ok).toBe(true)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'dispatch-request-rejected',
      recipientUserId: requester.id,
    })
  })

  it('cancelRequest fires broadcastNotification with kind=dispatch-request-cancelled', async () => {
    const requester = user('vishwanath.g', 'SalesRep')
    const opsHead = user('opshead', 'OpsHead')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const dr: DispatchRequest = {
      id: 'DR-1', mouId: m.id, schoolId: sch.id, requestedBy: requester.id,
      requestedAt: isoDaysAgo(1), requestReason: 'pilot', installmentSeq: 1,
      lineItems: [{ kind: 'flat', skuName: 'X', quantity: 10 }],
      status: 'pending-approval', conversionDispatchId: null,
      rejectionReason: null, reviewedBy: null, reviewedAt: null, notes: null, auditLog: [],
    }
    const { enqueue } = makeEnqueue()
    const result = await cancelRequest(
      { requestId: dr.id, cancelledBy: requester.id, notes: 'changed mind' },
      {
        mous: [m], schools: [sch], users: [requester, opsHead],
        dispatches: [], dispatchRequests: [dr], inventoryItems: [],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
      },
    )
    expect(result.ok).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledTimes(1)
    expect(broadcastSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'dispatch-request-cancelled',
    })
  })

  it('recordIntake fires broadcastNotification with kind=intake-completed', async () => {
    const recorder = user('vishwanath.g', 'SalesRep')
    const opsHead = user('opshead', 'OpsHead')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const { enqueue } = makeEnqueue()
    const result = await recordIntake(
      {
        mouId: m.id,
        salesOwnerId: SP_VIKRAM.id,
        location: 'Bangalore',
        grades: '1-5',
        recipientName: 'Principal X',
        recipientDesignation: 'Principal',
        recipientEmail: 'principal@school.in',
        studentsAtIntake: 100,
        durationYears: 1,
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        physicalSubmissionStatus: 'Submitted',
        softCopySubmissionStatus: 'Submitted',
        productConfirmed: 'STEAM',
        gslTrainingMode: 'GSL Trainer',
        schoolPointOfContactName: 'Principal X',
        schoolPointOfContactPhone: '+919999999999',
        signedMouUrl: 'https://drive.google.com/abc',
        recordedBy: recorder.id,
      },
      {
        mous: [m],
        intakeRecords: [],
        users: [recorder, opsHead],
        salesTeamIds: new Set([SP_VIKRAM.id]),
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
        randomUuid: () => 'uuid1',
      },
    )
    expect(result.ok).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledTimes(1)
    expect(broadcastSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'intake-completed',
    })
  })

  it('recordReceipt fires broadcastNotification with kind=payment-recorded', async () => {
    const recorder = user('shubhangi.g', 'Finance')
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id)
    const pay: Payment = {
      id: 'PAY-1', mouId: m.id, schoolName: sch.name, programme: 'STEAM',
      instalmentLabel: '1 of 4', instalmentSeq: 1, totalInstalments: 4,
      description: '', dueDateRaw: null, dueDateIso: null,
      expectedAmount: 100000, receivedAmount: null, receivedDate: null,
      paymentMode: null, bankReference: null, piNumber: 'GSL/OPS/26-27/0001',
      taxInvoiceNumber: null, status: 'PI Sent', notes: null,
      piSentDate: '2026-04-01', piSentTo: null, piGeneratedAt: null,
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    const { enqueue } = makeEnqueue()
    const result = await recordReceipt(
      {
        paymentId: pay.id, receivedDate: '2026-04-28', receivedAmount: 100000,
        paymentMode: 'Bank Transfer', bankReference: 'UTR-X', notes: null,
        recordedBy: recorder.id,
      },
      {
        payments: [pay], users: [recorder], mous: [m], salesTeam: [SP_VIKRAM],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        now: () => NOW,
      },
    )
    expect(result.ok).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledTimes(1)
    expect(broadcastSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'payment-recorded',
    })
  })

  it('composeReminder fires createNotification with kind=reminder-due to mapped sales-owner', async () => {
    const composer = user('opshead', 'OpsHead')
    const salesUser = user('vishwanath.g', 'SalesRep', { email: 'sp@x.in' })
    const sch = school('SCH-1')
    const m = mou('MOU-1', sch.id, { startDate: isoDaysAgo(30) })
    const { enqueue } = makeEnqueue()
    const result = await composeReminder(
      { reminderId: `rem-intake-${m.id}`, composedBy: composer.id },
      {
        mous: [m],
        schools: [sch],
        payments: [],
        dispatches: [],
        intakeRecords: [],
        communications: [],
        feedback: [],
        salesPersons: [SP_VIKRAM],
        thresholds: {
          intake: { thresholdDays: 14, anchorEvent: 'mou-active-from-startDate' },
          payment: { thresholdDays: 30, anchorEvent: 'pi-issued' },
          'delivery-ack': { thresholdDays: 7, anchorEvent: 'dispatch-delivered' },
          'feedback-chase': { thresholdDays: 7, anchorEvent: 'feedback-request-queued' },
        },
        users: [composer, salesUser],
        ccRules: [] as CcRule[],
        enqueue: enqueue as unknown as typeof import('@/lib/pendingUpdates').enqueueUpdate,
        uuid: () => 'uuid1',
        appUrl: () => 'https://gsl-ops.example',
        now: () => NOW,
        resolveCc: () => [],
      },
    )
    expect(result.ok).toBe(true)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0]![0]).toMatchObject({
      kind: 'reminder-due',
      recipientUserId: salesUser.id,
    })
  })
})
