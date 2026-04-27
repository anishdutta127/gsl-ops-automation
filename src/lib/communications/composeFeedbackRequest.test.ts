import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  composeFeedbackRequest,
  type ComposeFeedbackRequestDeps,
} from './composeFeedbackRequest'
import type { MOU, PendingUpdate, School, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'
const TEST_KEY = 'unit-test-magic-link-key-32-bytes-of-entropy'

let originalKey: string | undefined
let originalAppUrl: string | undefined

beforeAll(() => {
  originalKey = process.env.GSL_SNAPSHOT_SIGNING_KEY
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
  process.env.GSL_SNAPSHOT_SIGNING_KEY = TEST_KEY
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.GSL_SNAPSHOT_SIGNING_KEY
  else process.env.GSL_SNAPSHOT_SIGNING_KEY = originalKey
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
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
    id: 'SCH-X', name: 'Greenfield Academy', legalEntity: 'Greenfield Trust',
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
    contactPerson: 'Priya R.', email: 'spoc@example.test', phone: '+91-98000-00099',
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: FIXED_TS, auditLog: [],
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Greenfield',
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

function makeDeps(opts: {
  mous: MOU[]
  schools: School[]
  users: User[]
  appUrl?: string | undefined
}): { deps: ComposeFeedbackRequestDeps; calls: Array<Record<string, unknown>> } {
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
  let uuidCounter = 0
  return {
    deps: {
      mous: opts.mous,
      schools: opts.schools,
      users: opts.users,
      enqueue: enqueue as unknown as ComposeFeedbackRequestDeps['enqueue'],
      uuid: () => {
        uuidCounter += 1
        return `${'a'.repeat(7)}${uuidCounter}-1234-5678-9012-abcdef123456`
      },
      now: () => new Date(FIXED_TS),
      appUrl: () => opts.appUrl ?? 'https://ops.example.test',
    },
    calls,
  }
}

describe('composeFeedbackRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: OpsHead composes; MagicLinkToken + Communication both enqueued; returns content', async () => {
    const u = user('OpsHead', 'pradeep.r', 'Pradeep R.')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.communication.status).toBe('queued-for-manual')
    expect(result.communication.type).toBe('feedback-request')
    expect(result.communication.toEmail).toBe('spoc@example.test')
    expect(result.magicLinkToken.purpose).toBe('feedback-submit')
    expect(result.magicLinkUrl).toContain('https://ops.example.test/feedback/MLT-FB-')
    expect(result.magicLinkUrl).toContain('?h=')
    expect(result.email.subject).toContain('STEAM')
    expect(result.whatsapp).toContain(result.magicLinkUrl)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ entity: 'magicLinkToken', operation: 'create' })
    expect(calls[1]).toMatchObject({ entity: 'communication', operation: 'create' })
  })

  it('Admin can compose (wildcard)', async () => {
    const u = user('Admin', 'anish.d', 'Anish')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou:send-feedback-request not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school()], users: [u],
    })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pratik.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects mou-not-found', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ mous: [], schools: [school()], users: [u] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-NOPE', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('rejects school-not-found (data integrity)', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({
      mous: [mou({ schoolId: 'SCH-MISSING' })],
      schools: [school()], users: [u],
    })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-not-found' })
  })

  it('rejects school-email-missing', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps, calls } = makeDeps({
      mous: [mou()], schools: [school({ email: null })], users: [u],
    })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-email-missing' })
    expect(calls).toHaveLength(0)
  })

  it('rejects missing-app-url when NEXT_PUBLIC_APP_URL is unset', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    deps.appUrl = () => undefined
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'missing-app-url' })
  })

  it('MagicLinkToken expiresAt is +48 hours from now', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const issued = new Date(result.magicLinkToken.issuedAt).getTime()
    const expires = new Date(result.magicLinkToken.expiresAt).getTime()
    expect(expires - issued).toBe(48 * 60 * 60 * 1000)
  })

  it('Communication record persists email HTML body and WhatsApp body for audit replay', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.communication.subject).toContain('STEAM')
    expect(result.communication.bodyEmail).toContain('Greenfield Academy')
    expect(result.communication.bodyEmail).toContain(result.magicLinkUrl)
    expect(result.communication.bodyWhatsApp).toContain(result.magicLinkUrl)
  })

  it('audit entry on Communication captures the magicLinkTokenId for forward-traceability', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ mous: [mou()], schools: [school()], users: [u] })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entry = result.communication.auditLog[0]!
    expect(entry.action).toBe('create')
    expect(entry.after).toMatchObject({ magicLinkTokenId: result.magicLinkToken.id })
  })

  it('uses school.contactPerson as SPOC name when present, falls back to school.name', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({
      mous: [mou()],
      schools: [school({ contactPerson: null })],
      users: [u],
    })
    const result = await composeFeedbackRequest(
      { mouId: 'MOU-X', installmentSeq: 1, composedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.email.text).toContain('Dear Greenfield Academy')
  })
})
