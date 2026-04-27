import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PizZip from 'pizzip'
import {
  generateDeliveryAck,
  type GenerateDeliveryAckDeps,
} from './generateDeliveryAck'
import { DeliveryAckTemplateMissingError } from './templates'
import type { Dispatch, MOU, School, User } from '@/lib/types'

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
<w:p><w:r><w:t>Handover for {DISPATCH_NUMBER} dated {ACK_DATE}</w:t></w:r></w:p>
<w:p><w:r><w:t>School: {SCHOOL_NAME}, branch {BRANCH}</w:t></w:r></w:p>
<w:p><w:r><w:t>Total kits: {TOTAL_KITS}</w:t></w:r></w:p>
</w:body>
</w:document>`)
  return zip.generate({ type: 'uint8array' })
}

let fixtureBytes: Uint8Array

beforeAll(() => {
  fixtureBytes = buildFixtureDocx()
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function school(): School {
  return {
    id: 'SCH-X', name: 'Test School', legalEntity: 'Test Trust',
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
    contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: FIXED_TS, auditLog: [],
  }
}

function mou(): MOU {
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
  }
}

function dispatch(stage: Dispatch['stage'] = 'po-raised'): Dispatch {
  return {
    id: 'DSP-MOU-X-i1', mouId: 'MOU-X', schoolId: 'SCH-X',
    installmentSeq: 1, stage, installment1Paid: true,
    overrideEvent: null, poRaisedAt: FIXED_TS, dispatchedAt: null,
    deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
    notes: null, auditLog: [],
  }
}

const company = {
  legalEntity: 'Get Set Learn Private Limited',
  gstin: '29AAAAA0000A1Z5',
  address: ['Sample', 'Bengaluru, Karnataka 560001'],
}

function makeDeps(opts: {
  dispatches: Dispatch[]
  mous: MOU[]
  schools: School[]
  users: User[]
  loadTemplateOverride?: GenerateDeliveryAckDeps['loadTemplate']
}): GenerateDeliveryAckDeps {
  return {
    dispatches: opts.dispatches,
    mous: opts.mous,
    schools: opts.schools,
    users: opts.users,
    company,
    loadTemplate: opts.loadTemplateOverride ?? (async () => fixtureBytes),
    now: () => new Date(FIXED_TS),
  }
}

describe('generateDeliveryAck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: OpsHead generates blank docx, no state mutation', async () => {
    const u = user('OpsHead', 'misba.m')
    const deps = makeDeps({
      dispatches: [dispatch('po-raised')],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.docxBytes.byteLength).toBeGreaterThan(100)
    // No state advance: stage stays po-raised
    expect(result.dispatch.stage).toBe('po-raised')
  })

  it('Admin can generate (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const deps = makeDeps({
      dispatches: [dispatch('dispatched')],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou:upload-delivery-ack not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const deps = makeDeps({
      dispatches: [dispatch('po-raised')],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'pratik.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects pending stage (must be raised first)', async () => {
    const u = user('OpsHead', 'misba.m')
    const deps = makeDeps({
      dispatches: [dispatch('pending')],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-stage' })
  })

  it('accepts already-acknowledged stage (operator may want to re-print form copy)', async () => {
    const u = user('OpsHead', 'misba.m')
    const deps = makeDeps({
      dispatches: [dispatch('acknowledged')],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects dispatch-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const deps = makeDeps({
      dispatches: [],
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-NOPE', generatedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'dispatch-not-found' })
  })

  it('rejects unknown user', async () => {
    const deps = makeDeps({
      dispatches: [dispatch()],
      mous: [mou()], schools: [school()], users: [],
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('returns template-missing when production .docx is absent', async () => {
    const u = user('OpsHead', 'misba.m')
    const deps = makeDeps({
      dispatches: [dispatch()], mous: [mou()], schools: [school()], users: [u],
      loadTemplateOverride: async () => {
        throw new DeliveryAckTemplateMissingError(
          'delivery-ack-v1',
          'public/ops-templates/delivery-ack-template.docx',
        )
      },
    })
    const result = await generateDeliveryAck(
      { dispatchId: 'DSP-MOU-X-i1', generatedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('template-missing')
    expect(result.templateError?.message).toContain('delivery-ack-template.docx')
  })
})
