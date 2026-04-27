/*
 * generatePi unit tests.
 *
 * Mocks docxtemplater + pizzip via deps.loadTemplate returning bytes
 * that the real Docxtemplater can render (we ship a minimal in-memory
 * .docx fixture in beforeAll). For TemplateMissingError the mock
 * loadTemplate throws.
 *
 * Strategy: build a minimal valid .docx in-memory using pizzip + a
 * hand-written document.xml. The fixture exercises docxtemplater's
 * real render path so we catch wiring breakage; the data plumbing
 * (counter, Payment, audit, GSTIN gate, permission) is verified
 * via the result + queue mock.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PizZip from 'pizzip'
import {
  generatePi,
  type GeneratePiDeps,
} from './generatePi'
import { TemplateMissingError } from './templates'
import type { MOU, PendingUpdate, Payment, School, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

// Minimal valid .docx with the placeholders we render. Built once in
// beforeAll. Word's smallest valid document needs: [Content_Types].xml,
// _rels/.rels, word/_rels/document.xml.rels, word/document.xml.
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
<w:p><w:r><w:t>PI {PI_NUMBER} dated {PI_DATE}</w:t></w:r></w:p>
<w:p><w:r><w:t>School: {SCHOOL_NAME} ({SCHOOL_GSTIN})</w:t></w:r></w:p>
<w:p><w:r><w:t>Total: {TOTAL}</w:t></w:r></w:p>
</w:body>
</w:document>`)
  return zip.generate({ type: 'uint8array' })
}

let fixtureBytes: Uint8Array

beforeAll(() => {
  fixtureBytes = buildFixtureDocx()
})

afterAll(() => {
  // No env teardown needed; deps-injection isolates the lib.
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Test School', legalEntity: 'Test Trust',
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
    contactPerson: 'P', email: 'spoc@example.test', phone: null,
    billingName: 'Test Trust', pan: null,
    gstNumber: '27AAAPL1234C1ZX',
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

const company = {
  legalEntity: 'GetSetLearn Pvt Ltd',
  gstin: '27ABCDE1234F1Z5',
  address: ['101 Test St', 'Pune, MH - 411001'],
  accountDetails: ['Bank: HDFC', 'Account: 12345', 'IFSC: HDFC0001'],
  paymentTerms: 'Payment due within 30 days.',
  gstRate: 0.18,
}

interface FakeCounterCalls {
  count: number
}

function makeDeps(opts: {
  mous: MOU[]
  schools: School[]
  users: User[]
  loadTemplateOverride?: GeneratePiDeps['loadTemplate']
}): {
  deps: GeneratePiDeps
  enqueueCalls: Array<Record<string, unknown>>
  counterCalls: FakeCounterCalls
} {
  const enqueueCalls: Array<Record<string, unknown>> = []
  const counterCalls: FakeCounterCalls = { count: 0 }
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    enqueueCalls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  const issueCounter = vi.fn(async () => {
    counterCalls.count += 1
    const seq = counterCalls.count
    return {
      piNumber: `GSL/OPS/26-27/${String(seq).padStart(4, '0')}`,
      counter: { fiscalYear: '26-27', next: seq + 1, prefix: 'GSL/OPS' },
    }
  })
  const loadTemplate = opts.loadTemplateOverride ?? (async () => fixtureBytes)
  return {
    deps: {
      mous: opts.mous,
      schools: opts.schools,
      users: opts.users,
      company,
      enqueue: enqueue as unknown as GeneratePiDeps['enqueue'],
      issueCounter: issueCounter as unknown as GeneratePiDeps['issueCounter'],
      loadTemplate,
      now: () => new Date(FIXED_TS),
    },
    enqueueCalls,
    counterCalls,
  }
}

describe('generatePi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: Finance generates PI; counter advances; Payment + MOU update enqueued', async () => {
    const u = user('Finance', 'shubhangi.g')
    const m = mou()
    const s = school()
    const { deps, enqueueCalls, counterCalls } = makeDeps({
      mous: [m], schools: [s], users: [u],
    })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.piNumber).toBe('GSL/OPS/26-27/0001')
    expect(counterCalls.count).toBe(1)
    expect(enqueueCalls).toHaveLength(2)
    expect(enqueueCalls[0]).toMatchObject({ entity: 'payment', operation: 'create' })
    expect(enqueueCalls[1]).toMatchObject({ entity: 'mou', operation: 'update' })
    expect(result.docxBytes.byteLength).toBeGreaterThan(100)
  })

  it('Admin can generate (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const m = mou()
    const s = school()
    const { deps } = makeDeps({ mous: [m], schools: [s], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('OpsHead is REJECTED (mou:generate-pi not granted)', async () => {
    const u = user('OpsHead', 'misba.m')
    const m = mou()
    const s = school()
    const { deps, enqueueCalls, counterCalls } = makeDeps({
      mous: [m], schools: [s], users: [u],
    })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'misba.m' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(enqueueCalls).toHaveLength(0)
    expect(counterCalls.count).toBe(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects mou-not-found', async () => {
    const u = user('Finance', 'shubhangi.g')
    const { deps } = makeDeps({ mous: [], schools: [school()], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-NOPE', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('rejects wrong-status (MOU not Active)', async () => {
    const u = user('Finance', 'shubhangi.g')
    const m = mou({ status: 'Completed' })
    const { deps } = makeDeps({ mous: [m], schools: [school()], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-status' })
  })

  it('rejects school-not-found (data integrity issue)', async () => {
    const u = user('Finance', 'shubhangi.g')
    const m = mou({ schoolId: 'SCH-MISSING' })
    const { deps } = makeDeps({ mous: [m], schools: [school()], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-not-found' })
  })

  // W4-A.6: GSTIN-missing no longer blocks PI generation. The counter
  // advances; the docx renders a "To be added" placeholder for SCHOOL_GSTIN.
  // Finance backfills via /schools/[id]/edit and re-issues if needed.
  it('PI generation succeeds when school.gstNumber is null (W4-A.6 unblock)', async () => {
    const u = user('Finance', 'shubhangi.g')
    const s = school({ gstNumber: null })
    const { deps, counterCalls } = makeDeps({ mous: [mou()], schools: [s], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(true)
    // Counter advances on success.
    expect(counterCalls.count).toBe(1)
  })

  it('PI generation succeeds when gstNumber is whitespace-only (still treated as missing)', async () => {
    const u = user('Finance', 'shubhangi.g')
    const s = school({ gstNumber: '   ' })
    const { deps } = makeDeps({ mous: [mou()], schools: [s], users: [u] })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('returns template-missing when production .docx is absent', async () => {
    const u = user('Finance', 'shubhangi.g')
    const m = mou()
    const s = school()
    const { deps } = makeDeps({
      mous: [m], schools: [s], users: [u],
      loadTemplateOverride: async () => {
        throw new TemplateMissingError('pi-v1', 'public/ops-templates/pi-template.docx')
      },
    })
    const result = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('template-missing')
    expect(result.templateError).toBeInstanceOf(TemplateMissingError)
    expect(result.templateError?.message).toContain('public/ops-templates/pi-template.docx')
  })

  it('Payment record carries correct shape: id, piNumber, status PI Sent, expectedAmount per instalment count', async () => {
    const u = user('Finance', 'shubhangi.g')
    const m = mou({ contractValue: 800000, paymentSchedule: '25-25-25-25 quarterly' })
    const s = school()
    const { deps, enqueueCalls } = makeDeps({ mous: [m], schools: [s], users: [u] })
    await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 2, generatedBy: 'shubhangi.g' },
      deps,
    )
    const payment = enqueueCalls[0]!.payload as unknown as Payment
    expect(payment.id).toBe('MOU-X-i2')
    expect(payment.piNumber).toBe('GSL/OPS/26-27/0001')
    expect(payment.status).toBe('PI Sent')
    expect(payment.instalmentSeq).toBe(2)
    expect(payment.totalInstalments).toBe(4)
    expect(payment.expectedAmount).toBe(200000)  // 800000 / 4
    expect(payment.piSentTo).toBe('spoc@example.test')
  })

  it('MOU audit entry has action pi-issued + before/after captured', async () => {
    const u = user('Finance', 'shubhangi.g')
    const { deps, enqueueCalls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
    })
    await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    const updatedMou = enqueueCalls[1]!.payload as unknown as MOU
    expect(updatedMou.auditLog).toHaveLength(1)
    const entry = updatedMou.auditLog[0]!
    expect(entry.action).toBe('pi-issued')
    expect(entry.user).toBe('shubhangi.g')
    expect(entry.after).toMatchObject({
      piNumber: 'GSL/OPS/26-27/0001',
      instalmentSeq: 1,
    })
  })

  it('counter monotonicity: two consecutive calls produce sequential PI numbers', async () => {
    const u = user('Finance', 'shubhangi.g')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    const r1 = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 1, generatedBy: 'shubhangi.g' },
      deps,
    )
    const r2 = await generatePi(
      { mouId: 'MOU-X', instalmentSeq: 2, generatedBy: 'shubhangi.g' },
      deps,
    )
    expect(r1.ok && r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.piNumber).toBe('GSL/OPS/26-27/0001')
      expect(r2.piNumber).toBe('GSL/OPS/26-27/0002')
    }
  })
})
