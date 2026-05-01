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
<w:p><w:r><w:t>{#hasFlatItems}FLAT-SECTION{/hasFlatItems}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#flatItems}{skuName}=={quantity};{/flatItems}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#hasPerGradeItems}PER-GRADE-SECTION{/hasPerGradeItems}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#perGradeRows}{skuName}/G{grade}={quantity};{/perGradeRows}</w:t></w:r></w:p>
<w:p><w:r><w:t>Total quantity: {TOTAL_QUANTITY}</w:t></w:r></w:p>
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
    generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
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
    notes: null,
    lineItems: [{ kind: 'flat', skuName: 'Test SKU', quantity: 1 }],
    requestId: null, raisedBy: 'system-test', raisedFrom: 'ops-direct',
    auditLog: [],
    ...overrides,
  }
}

const company = {
  legalEntity: 'Get Set Learn Private Limited',
  gstin: '29AAAAA0000A1Z5',
  address: ['Sample', 'Bengaluru, Karnataka 560001'],
}

function defaultInventory(): import('@/lib/types').InventoryItem[] {
  // Covers the 'STEAM kit set' SKU that raiseDispatch synthesises from
  // MOU.programme (see buildKitItems) and the 'Test SKU' label used by
  // the dispatch() fixture for existing-dispatch scenarios. Stock is
  // generous so happy-path tests don't trip insufficient-stock.
  return [
    {
      id: 'INV-STEAM-KIT', skuName: 'STEAM kit set', category: 'Other',
      cretileGrade: null, mastersheetSourceName: null, currentStock: 10000,
      reorderThreshold: null, notes: null, active: true,
      lastUpdatedAt: FIXED_TS, lastUpdatedBy: 'system-test', auditLog: [],
    },
    {
      id: 'INV-TEST-SKU', skuName: 'Test SKU', category: 'Other',
      cretileGrade: null, mastersheetSourceName: null, currentStock: 10000,
      reorderThreshold: null, notes: null, active: true,
      lastUpdatedAt: FIXED_TS, lastUpdatedBy: 'system-test', auditLog: [],
    },
  ]
}

function makeDeps(opts: {
  mous: MOU[]
  schools: School[]
  users: User[]
  dispatches?: Dispatch[]
  payments?: Payment[]
  inventoryItems?: import('@/lib/types').InventoryItem[]
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
      inventoryItems: opts.inventoryItems ?? defaultInventory(),
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
    // dispatch + mou + 1 inventoryItem (W4-G.4 decrement)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'create' })
    expect(calls[1]).toMatchObject({ entity: 'mou', operation: 'update' })
    expect(calls[2]).toMatchObject({ entity: 'inventoryItem', operation: 'update' })
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

  it('rejects wrong-status when MOU is closed (Completed)', async () => {
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

  it('rejects wrong-status for Draft / Expired / Renewed', async () => {
    const u = user('OpsHead', 'misba.m')
    for (const status of ['Draft', 'Expired', 'Renewed'] as const) {
      const { deps } = makeDeps({
        mous: [mou({ status })],
        schools: [school()], users: [u], payments: [payment('Paid')],
      })
      const result = await raiseDispatch(
        { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
        deps,
      )
      expect(result).toEqual({ ok: false, reason: 'wrong-status' })
    }
  })

  // W4-I.4 MM1: Sales sometimes approves dispatch before signature lands
  // (pilot kickoffs, parent-org commitments). DIS-002 P2-override fixture
  // already implies the system was meant to support pre-signature dispatch;
  // the active-only check contradicted that path.
  it('accepts Pending Signature MOU (W4-I.4 MM1)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      mous: [mou({ status: 'Pending Signature' })],
      schools: [school()], users: [u], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
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
    // dispatch-raised + inventory-decremented-by-dispatch (W4-G.4 mirror)
    expect(updatedDispatch.auditLog).toHaveLength(2)
    const entry = updatedDispatch.auditLog[0]!
    expect(entry.action).toBe('dispatch-raised')
    expect(entry.before).toMatchObject({ stage: 'pending' })
    expect(entry.after).toMatchObject({ stage: 'po-raised' })
    expect(updatedDispatch.auditLog[1]!.action).toBe('inventory-decremented-by-dispatch')
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

// ----------------------------------------------------------------------------
// W4-D.5: docx-bag conditional sections (flat / per-grade / mixed)
// ----------------------------------------------------------------------------
//
// These tests verify the .docx output rendered by docxtemplater with our
// fixture template. The fixture's word/document.xml carries marker strings
// (FLAT-SECTION, PER-GRADE-SECTION) inside the {#hasFlatItems} /
// {#hasPerGradeItems} blocks so we can grep them out of the generated zip.

import Docxtemplater from 'docxtemplater'
import PizZipImpl from 'pizzip'

function renderXmlFromBytes(bytes: Uint8Array): string {
  const z = new PizZipImpl(bytes)
  return z.file('word/document.xml')!.asText()
}

function dispatchWithLineItems(
  lineItems: Dispatch['lineItems'],
): Dispatch {
  return {
    id: 'DSP-MOU-X-i1', mouId: 'MOU-X', schoolId: 'SCH-X',
    installmentSeq: 1, stage: 'po-raised', installment1Paid: true,
    overrideEvent: null, poRaisedAt: FIXED_TS, dispatchedAt: null,
    deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
    notes: null,
    lineItems,
    requestId: null, raisedBy: 'system-test', raisedFrom: 'ops-direct',
    auditLog: [],
  }
}

describe('raiseDispatch W4-D.5 docx shapes', () => {
  // We exercise the bag via the idempotent re-render path: an existing
  // Dispatch with stage past 'pending' renders the docx without any state
  // mutation, so the test isolates the bag -> template rendering surface.
  it('shape (i): flat-only renders the flat section + skuName/quantity rows', async () => {
    const u = user('OpsHead', 'misba.m')
    const existing = dispatchWithLineItems([
      { kind: 'flat', skuName: 'TWs Pampered Plant', quantity: 30 },
      { kind: 'flat', skuName: 'TWs Smart Lamp', quantity: 30 },
    ])
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existing], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const xml = renderXmlFromBytes(result.docxBytes)
    expect(xml).toContain('FLAT-SECTION')
    expect(xml).toContain('TWs Pampered Plant==30;')
    expect(xml).toContain('TWs Smart Lamp==30;')
    expect(xml).not.toContain('PER-GRADE-SECTION')
    expect(xml).toContain('Total quantity: 60')
  })

  it('shape (ii): per-grade-only renders the per-grade section + (sku, grade) rows', async () => {
    const u = user('OpsHead', 'misba.m')
    const existing = dispatchWithLineItems([
      {
        kind: 'per-grade',
        skuName: 'Cretile Grade-band kit',
        gradeAllocations: [
          { grade: 1, quantity: 25 },
          { grade: 2, quantity: 25 },
        ],
      },
    ])
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existing], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const xml = renderXmlFromBytes(result.docxBytes)
    expect(xml).not.toContain('FLAT-SECTION')
    expect(xml).toContain('PER-GRADE-SECTION')
    expect(xml).toContain('Cretile Grade-band kit/G1=25;')
    expect(xml).toContain('Cretile Grade-band kit/G2=25;')
    expect(xml).toContain('Total quantity: 50')
  })

  it('shape (iii): mixed renders BOTH sections + correct row sets in each', async () => {
    const u = user('OpsHead', 'misba.m')
    const existing = dispatchWithLineItems([
      { kind: 'flat', skuName: 'TWs Pampered Plant', quantity: 50 },
      {
        kind: 'per-grade',
        skuName: 'Cretile Grade-band kit',
        gradeAllocations: [
          { grade: 3, quantity: 20 },
          { grade: 4, quantity: 30 },
        ],
      },
    ])
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existing], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const xml = renderXmlFromBytes(result.docxBytes)
    expect(xml).toContain('FLAT-SECTION')
    expect(xml).toContain('PER-GRADE-SECTION')
    expect(xml).toContain('TWs Pampered Plant==50;')
    expect(xml).toContain('Cretile Grade-band kit/G3=20;')
    expect(xml).toContain('Cretile Grade-band kit/G4=30;')
    // Total = 50 + 20 + 30 = 100
    expect(xml).toContain('Total quantity: 100')
  })

  it('zero line items: neither section renders, total quantity is 0', async () => {
    const u = user('OpsHead', 'misba.m')
    const existing = dispatchWithLineItems([])
    const { deps } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
      dispatches: [existing], payments: [payment('Paid')],
    })
    const result = await raiseDispatch(
      { mouId: 'MOU-X', installmentSeq: 1, raisedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const xml = renderXmlFromBytes(result.docxBytes)
    expect(xml).not.toContain('FLAT-SECTION')
    expect(xml).not.toContain('PER-GRADE-SECTION')
    expect(xml).toContain('Total quantity: 0')
  })

  // Defensive guard: ensures Docxtemplater is consistent with our pizzip
  // version so the import shape stays valid over time.
  it('Docxtemplater + PizZip are importable here', () => {
    expect(typeof Docxtemplater).toBe('function')
    expect(typeof PizZipImpl).toBe('function')
  })
})
