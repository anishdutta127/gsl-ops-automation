/*
 * raiseDispatch unit tests.
 *
 * Mocks docxtemplater via deps.loadTemplate returning a minimal
 * in-memory .docx fixture (built once in beforeAll). Data plumbing
 * (gate logic, audit, idempotent re-render, Dispatch shape) is
 * verified via the result + queue mock.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PizZip from 'pizzip'
import {
  raiseDispatch,
  type RaiseDispatchDeps,
} from './raiseDispatch'
import { DispatchTemplateMissingError } from './templates'
import type {
  Dispatch,
  MOU,
  Payment,
  PendingUpdate,
  School,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function buildFixtureDocx(): Uint8Array {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Dispatch {DISPATCH_NUMBER} dated {DISPATCH_DATE}</w:t></w:r></w:p>
<w:p><w:r><w:t>Ship to: {SCHOOL_NAME}</w:t></w:r></w:p>
<w:p><w:r><w:t>Total kits: {TOTAL_KITS}</w:t></w:r></w:p>
</w:body>
</w:document>`)
  return zip.generate({ type: 'uint8array' })
}

let fixtureBytes: Uint8Array

beforeAll(() => {
  fixtureBytes = buildFixtureDocx()
})

function user(role: User['role'], id = 'u', name = id): User {
  return {
    id, name, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Test School', legalEntity: 'Test Trust',
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
    contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: '27AAAPL1234C1ZX',
    notes: null, active: true, createdAt: FIXED_TS, auditLog: [],
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Test School',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 200, studentsActual: 200, studentsVariance: 0,
    studentsVariancePct: 0, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 800000, received: 0, tds: 0, balance: 800000,
    receivedPct: 0, paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: 'GSL-T', salesPersonId: null, templateVersion: null,
    generatedAt: null, notes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function payment(status: Payment['status']): Payment {
  return {
    id: 'MOU-X-i1', mouId: 'MOU-X', schoolName: 'Test School',
    programme: 'STEAM', instalmentLabel: '1 of 4', instalmentSeq: 1,
    totalInstalments: 4, description: 'Instalment 1', dueDateRaw: null,
    dueDateIso: null, expectedAmount: 200000,
    receivedAmount: status === 'Received' || status === 'Paid' ? 200000 : null,
    receivedDate: null, paymentMode: null, bankReference: null,
    piNumber: null, taxInvoiceNumber: null, status, notes: null,
    piSentDate: null, piSentTo: null, piGeneratedAt: null,
    studentCountActual: null, partialPayments: null, auditLog: null,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DSP-MOU-X-i1', mouId: 'MOU-X', schoolId: 'SCH-X',
    installmentSeq: 1, stage: 'pending', installment1Paid: false,
    overrideEvent: null, poRaisedAt: null, dispatchedAt: null,
    deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
    notes: null, auditLog: [],
    ...overrides,
  }
}

const company = {
  legalEntity: 'Get Set Learn Private Limited',
  gstin: '29AAAAA0000A1Z5',
  address: ['Sample', 'Bengaluru, Karnataka 560001'],
}

function makeDeps(opts: {
  mous: MOU[]
  schools: School[]
  users: User[]
  dispatches?: Dispatch[]
  payments?: Payment[]
  loadTemplateOverride?: RaiseDispatchDeps['loadTemplate']
}): { deps: RaiseDispatchDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      mous: opts.mous,
      schools: opts.schools,
      users: opts.users,
      dispatches: opts.dispatches ?? [],
      payments: opts.payments ?? [],
      company,
      enqueue: enqueue as unknown as RaiseDispatchDeps['enqueue'],
      loadTemplate: opts.loadTemplateOverride ?? (async () => fixtureBytes),
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('raiseDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: payment Paid -> creates Dispatch with stage po-raised, MOU audit appended, queue enqueued', async () => {
    const u = user('OpsHead', 'misba.m', 'Misba M.')
    const { deps, calls } = makeDeps({
      mous: [mou()],
      schools: [school()],
      users: [u],
      payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dispatch.stage).toBe('po-raised')
    expect(result.dispatch.poRaisedAt).toBe(FIXED_TS)
    expect(result.dispatch.installment1Paid).toBe(true)
    expect(result.wasAlreadyRaised).toBe(false)
    expect(result.docxBytes.byteLength).toBeGreaterThan(100)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'create' })
    expect(calls[1]).toMatchObject({ entity: 'mou', operation: 'update' })
  })

  it('Admin can raise (wildcard)', async () => {
    const u = user('Admin', 'anish.d', 'Anish')
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Received')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou:raise-dispatch not granted)', async () => {
    const u = user('SalesHead', 'pratik.d', 'Pratik')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'pratik.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects gate-locked when no payment + no override', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'gate-locked' })
    expect(calls).toHaveLength(0)
  })

  it('rejects gate-locked when payment status is Pending (not yet received)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Pending')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'gate-locked' })
  })

  it('unblocked by overrideEvent (Leadership pre-payment authorisation)', async () => {
    const u = user('OpsHead', 'misba.m')
    const existingDispatch = dispatch({
      stage: 'pending',
      overrideEvent: {
        overriddenBy: 'ameet.z',
        overriddenAt: '2026-04-25T15:00:00Z',
        reason: 'Pilot kicks off Monday; payment in transit',
        acknowledgedBy: null,
        acknowledgedAt: null,
      },
    })
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existingDispatch],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dispatch.stage).toBe('po-raised')
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'update' })
  })

  it('idempotent re-render: stage already po-raised -> returns docx without writing', async () => {
    const u = user('OpsHead', 'misba.m')
    const existingDispatch = dispatch({
      stage: 'po-raised',
      poRaisedAt: '2026-04-20T10:00:00Z',
      installment1Paid: true,
    })
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existingDispatch],
      payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.wasAlreadyRaised).toBe(true)
    expect(result.dispatch.poRaisedAt).toBe('2026-04-20T10:00:00Z')  // unchanged
    expect(calls).toHaveLength(0)  // no writes
  })

  it('idempotent re-render works for stages dispatched / in-transit / delivered too', async () => {
    const u = user('OpsHead', 'misba.m')
    for (const stage of ['dispatched', 'in-transit', 'delivered'] as const) {
      const existingDispatch = dispatch({
        stage,
        installment1Paid: true,
        poRaisedAt: '2026-04-20T10:00:00Z',
      })
      const { deps, calls } = makeDeps({
        mous: [mou()], schools: [school()], users: [u],
        dispatches: [existingDispatch],
        payments: [payment('Paid')],
      })
      const result = await raiseDispatch(
        { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
        deps,
      )
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.wasAlreadyRaised).toBe(true)
      expect(calls).toHaveLength(0)
    }
  })

  it('rejects mou-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ mous: [], schools: [school()], users: [u] })
    const result = await raiseDispatch(
      { mouId: 'MOU-NOPE', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('rejects wrong-status (MOU not Active)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      mous: [mou({ status: 'Completed' })],
      schools: [school()], users: [u], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-status' })
  })

  it('rejects school-not-found (data integrity issue)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      mous: [mou({ schoolId: 'SCH-MISSING' })],
      schools: [school()], users: [u], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-not-found' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [] })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('returns template-missing when production .docx is absent', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Paid')],
      loadTemplateOverride: async () => {
        throw new DispatchTemplateMissingError('dispatch-v1', 'public/ops-templates/dispatch-template.docx')
      },
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('template-missing')
    expect(result.templateError?.message).toContain('public/ops-templates/dispatch-template.docx')
  })

  it('Dispatch audit entry has action dispatch-raised + before/after stage capture', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Paid')],
    })
    await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    const updatedDispatch = calls[0]!.payload as unknown as Dispatch
    expect(updatedDispatch.auditLog).toHaveLength(1)
    const entry = updatedDispatch.auditLog[0]!
    expect(entry.action).toBe('dispatch-raised')
    expect(entry.before).toMatchObject({ stage: 'pending' })
    expect(entry.after).toMatchObject({ stage: 'po-raised' })
  })

  it('MOU audit entry has action dispatch-raised + dispatch reference', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      payments: [payment('Paid')],
    })
    await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    const updatedMou = calls[1]!.payload as unknown as MOU
    const entry = updatedMou.auditLog.at(-1)!
    expect(entry.action).toBe('dispatch-raised')
    expect(entry.after).toMatchObject({ dispatchId: 'DSP-MOU-X-i1' })
  })
})
