import { describe, expect, it, vi } from 'vitest'
import {
  normalisePhone,
  recordIntake,
  type RecordIntakeArgs,
  type RecordIntakeDeps,
} from './recordIntake'
import type {
  IntakeRecord,
  MOU,
  PendingUpdate,
  Programme,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-04-27T22:30:00.000Z'

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'anish.d@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 200, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 200000, received: 0, tds: 0,
    balance: 200000, receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function validArgs(overrides: Partial<RecordIntakeArgs> = {}): RecordIntakeArgs {
  return {
    mouId: 'M-A',
    salesOwnerId: 'sp-vikram',
    location: 'Krishnanagar, Nadia, West Bengal',
    grades: '4-8',
    recipientName: 'Father V T Jose',
    recipientDesignation: 'Principal',
    recipientEmail: 'principal@example.test',
    studentsAtIntake: 200,
    durationYears: 2,
    startDate: '2026-04-01',
    endDate: '2028-03-31',
    physicalSubmissionStatus: 'Pending',
    softCopySubmissionStatus: 'Submitted',
    productConfirmed: 'STEAM',
    gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'Dominic Nicholas',
    schoolPointOfContactPhone: '9932033447',
    signedMouUrl: 'https://drive.google.com/open?id=1tbO6O6hx2HRAUjKgmvkYSls49qRk5QkX',
    recordedBy: 'anish.d',
    ...overrides,
  }
}

function makeDeps(opts: {
  mous: MOU[]
  intakeRecords?: IntakeRecord[]
  users: User[]
}): { deps: RecordIntakeDeps; calls: Array<Record<string, unknown>> } {
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
      intakeRecords: opts.intakeRecords ?? [],
      users: opts.users,
      salesTeamIds: new Set(['sp-vikram', 'sp-prodipto', 'sp-roveena']),
      enqueue: enqueue as unknown as RecordIntakeDeps['enqueue'],
      now: () => new Date(FIXED_TS),
      randomUuid: () => 'IR-FIXED-UUID',
    },
    calls,
  }
}

describe('normalisePhone', () => {
  it('normalises a 10-digit Indian number to E.164 with +91 prefix', () => {
    expect(normalisePhone('9932033447')).toBe('+919932033447')
    expect(normalisePhone('99 32033447')).toBe('+919932033447')
  })

  it('keeps already-E.164 numbers unchanged', () => {
    expect(normalisePhone('+918910509564')).toBe('+918910509564')
  })

  it('strips spaces, dashes, and parentheses', () => {
    expect(normalisePhone('+91 92638 88888')).toBe('+919263888888')
    expect(normalisePhone('(7889) 380917')).toBe('+917889380917')
  })

  it('preserves un-normalisable inputs verbatim (trimmed)', () => {
    // E.g., a name accidentally entered into the phone field.
    expect(normalisePhone('NITIN TOMAR')).toBe('NITINTOMAR')  // letters preserved; whitespace stripped
    // Empty saves return empty.
    expect(normalisePhone('   ')).toBe('')
  })
})

describe('recordIntake', () => {
  it('happy path: writes IntakeRecord, mirrors audit on MOU, queues both updates, returns no variance', async () => {
    const m = mou({ id: 'M-A' })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs(), deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.mouId).toBe('M-A')
      expect(res.record.completedAt).toBe(FIXED_TS)
      expect(res.record.schoolPointOfContactPhone).toBe('+919932033447')
      expect(res.record.recipientEmail).toBe('principal@example.test')
      expect(res.record.auditLog[0]?.action).toBe('intake-captured')
      expect(res.variances.studentsVariance).toBe(0)
      expect(res.variances.productMismatch).toBe(false)
      expect(res.variances.trainingModeMismatch).toBe(false)
    }
    // Two queue writes: intake create, mou update.
    expect(calls).toHaveLength(2)
    expect(calls[0]?.entity).toBe('intakeRecord')
    expect(calls[0]?.operation).toBe('create')
    expect(calls[1]?.entity).toBe('mou')
    expect(calls[1]?.operation).toBe('update')
  })

  it('variance detection: students differ from MOU baseline; result.variances flags it; save still succeeds', async () => {
    const m = mou({ id: 'M-A', studentsMou: 200 })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ studentsAtIntake: 350 }), deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.variances.studentsVariance).toBe(150)
      expect(res.record.studentsAtIntake).toBe(350)
      // Audit notes capture the variance for the trail.
      expect(res.record.auditLog[0]?.notes).toContain('Students variance')
      expect(res.record.auditLog[0]?.notes).toContain('+150')
    }
  })

  it('product mismatch flag set; save still succeeds', async () => {
    const m = mou({ id: 'M-A', programme: 'STEAM' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ productConfirmed: 'TinkRworks' }), deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.variances.productMismatch).toBe(true)
      expect(res.record.productConfirmed).toBe('TinkRworks')
    }
  })

  it('training mode mismatch flag set when gslTrainingMode disagrees with MOU.trainerModel', async () => {
    const m = mou({ id: 'M-A', trainerModel: 'TT' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ gslTrainingMode: 'GSL Trainer' }), deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.variances.trainingModeMismatch).toBe(true)
    }
  })

  it('null MOU.trainerModel does NOT trigger the training-mode mismatch flag', async () => {
    const m = mou({ id: 'M-A', trainerModel: null })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ gslTrainingMode: 'GSL Trainer' }), deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.variances.trainingModeMismatch).toBe(false)
    }
  })

  it('idempotency: re-submit on a MOU that already has an IntakeRecord returns already-recorded', async () => {
    const m = mou({ id: 'M-A' })
    const existing: IntakeRecord = {
      id: 'IR-OLD', mouId: 'M-A', completedAt: '2026-04-15T10:00:00Z',
      completedBy: 'anish.d', salesOwnerId: 'sp-vikram',
      location: 'X', grades: '1-8', recipientName: 'P', recipientDesignation: 'Principal',
      recipientEmail: 'p@example.test', studentsAtIntake: 200, durationYears: 2,
      startDate: '2026-04-01', endDate: '2028-03-31',
      physicalSubmissionStatus: 'Pending', softCopySubmissionStatus: 'Submitted',
      productConfirmed: 'STEAM', gslTrainingMode: 'GSL Trainer',
      schoolPointOfContactName: 'P', schoolPointOfContactPhone: '+919999999999',
      signedMouUrl: 'https://drive.google.com/open?id=test',
      thankYouEmailSentAt: null,
      gradeBreakdown: null, rechargeableBatteries: null, auditLog: [],
    }
    const { deps, calls } = makeDeps({
      mous: [m], intakeRecords: [existing], users: [admin()],
    })
    const res = await recordIntake(validArgs(), deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('already-recorded')
    expect(calls).toHaveLength(0)
  })

  it('rejects invalid-email', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ recipientEmail: 'not-an-email' }), deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-email')
  })

  it('rejects invalid-url (non-allow-listed host)', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(
      validArgs({ signedMouUrl: 'https://evil.com/document.pdf' }),
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-url')
  })

  it('accepts URLs from drive.google.com / sharepoint / dropbox subdomains', async () => {
    const m = mou({ id: 'M-A' })
    for (const url of [
      'https://drive.google.com/open?id=abc',
      'https://contoso.sharepoint.com/sites/x',
      'https://www.dropbox.com/s/abc',
    ]) {
      const { deps } = makeDeps({ mous: [m], users: [admin()] })
      const res = await recordIntake(validArgs({ signedMouUrl: url }), deps)
      expect(res.ok).toBe(true)
    }
  })

  it('rejects invalid-students (zero or negative)', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ studentsAtIntake: 0 }), deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-students')
  })

  it('rejects invalid-duration outside 1-10', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const r1 = await recordIntake(validArgs({ durationYears: 0 }), deps)
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.reason).toBe('invalid-duration')
    const r2 = await recordIntake(validArgs({ durationYears: 11 }), deps)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.reason).toBe('invalid-duration')
  })

  it('rejects date-order (endDate <= startDate)', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(
      validArgs({ startDate: '2027-04-01', endDate: '2027-04-01' }),
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('date-order')
  })

  it('rejects unknown-sales-owner', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ salesOwnerId: 'sp-not-real' }), deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown-sales-owner')
  })

  it('rejects missing-text on whitespace-only required fields', async () => {
    const m = mou({ id: 'M-A' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await recordIntake(validArgs({ location: '   ' }), deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('missing-text')
  })
})
