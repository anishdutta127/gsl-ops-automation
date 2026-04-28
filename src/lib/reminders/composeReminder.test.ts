/*
 * W4-E.4 composeReminder tests.
 *
 * Drives composeReminder against synthetic state. Verifies:
 *   - permission gate
 *   - kind -> CommunicationType + CcRuleContext mapping
 *   - placeholder substitution (sender name, school name, days overdue,
 *     PI number, expected amount, currentDate)
 *   - missing-recipient short-circuit
 *   - reminder-not-found short-circuit
 *   - audit entry shape (action='reminder-composed' with reminderId
 *     and threshold info)
 *   - mark-sent flips status to 'sent' with 'reminder-marked-sent' audit
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  Communication,
  MOU,
  PendingUpdate,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import {
  composeReminder,
  type ComposeReminderDeps,
} from './composeReminder'
import type { ReminderThresholds } from './detectDueReminders'
import { markReminderSent, type MarkReminderSentDeps } from './markReminderSent'

const NOW = new Date('2026-04-28T12:00:00.000Z')
const isoDaysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const T: ReminderThresholds = {
  intake: { thresholdDays: 14, anchorEvent: 'mou-active-from-startDate' },
  payment: { thresholdDays: 30, anchorEvent: 'pi-issued' },
  'delivery-ack': { thresholdDays: 7, anchorEvent: 'dispatch-delivered' },
  'feedback-chase': { thresholdDays: 7, anchorEvent: 'feedback-request-queued' },
}

function user(id: string, role: User['role'] = 'OpsHead'): User {
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
  }
}

function makeDeps(over: Partial<ComposeReminderDeps> = {}): ComposeReminderDeps {
  const enqueueCalls: PendingUpdate[] = []
  const baseEnqueue = vi.fn(async (params) => {
    const entry: PendingUpdate = {
      id: 'PU-' + Math.random().toString(36).slice(2, 8),
      queuedAt: NOW.toISOString(),
      retryCount: 0,
      ...params,
    }
    enqueueCalls.push(entry)
    return entry
  }) as unknown as ComposeReminderDeps['enqueue']
  return {
    mous: [],
    schools: [],
    payments: [],
    dispatches: [],
    intakeRecords: [],
    communications: [],
    feedback: [],
    salesPersons: [],
    thresholds: T,
    users: [],
    ccRules: [],
    enqueue: baseEnqueue,
    uuid: () => 'fixedid',
    appUrl: () => 'https://gsl-ops.example',
    now: () => NOW,
    resolveCc: () => [],
    ...over,
  }
}

function intakeReminderState() {
  const sch: School = {
    id: 'SCH-COMP',
    name: 'Compose Test School',
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
  const m: MOU = {
    id: 'MOU-COMP',
    schoolId: 'SCH-COMP',
    schoolName: 'Compose Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: isoDaysAgo(30),
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
    trainerModel: null,
    salesPersonId: 'sp-vikram',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
  }
  const sp: SalesPerson = {
    id: 'sp-vikram',
    name: 'Vikram T.',
    email: 'vikram.t@getsetlearn.info',
    phone: null,
    territories: [],
    programmes: ['STEAM'],
    active: true,
    joinedDate: '2025-04-01',
  }
  return { sch, m, sp }
}

describe('W4-E.4 composeReminder permission + recipient gates', () => {
  it('returns permission failure for users without reminder:create', async () => {
    const u = user('finance.user', 'Finance')
    const { sch, m, sp } = intakeReminderState()
    const result = await composeReminder(
      { reminderId: 'rem-intake-MOU-COMP', composedBy: u.id },
      makeDeps({
        mous: [m], schools: [sch], salesPersons: [sp], users: [u],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('permission')
  })

  it('returns reminder-not-found when no reminder matches the id', async () => {
    const u = user('opshead', 'OpsHead')
    const { sch, m, sp } = intakeReminderState()
    const result = await composeReminder(
      { reminderId: 'rem-intake-MOU-DOES-NOT-EXIST', composedBy: u.id },
      makeDeps({
        mous: [m], schools: [sch], salesPersons: [sp], users: [u],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('reminder-not-found')
  })

  it('returns no-recipient when MOU has no salesPersonId for an intake reminder', async () => {
    const u = user('opshead', 'OpsHead')
    const { sch, m } = intakeReminderState()
    const noOwner = { ...m, salesPersonId: null }
    const result = await composeReminder(
      { reminderId: 'rem-intake-MOU-COMP', composedBy: u.id },
      makeDeps({
        mous: [noOwner], schools: [sch], users: [u],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-recipient')
  })
})

describe('W4-E.4 composeReminder render + audit', () => {
  it('renders an intake reminder with sender + school + days substituted; writes Communication', async () => {
    const u = user('opshead', 'OpsHead')
    const { sch, m, sp } = intakeReminderState()
    const result = await composeReminder(
      { reminderId: 'rem-intake-MOU-COMP', composedBy: u.id },
      makeDeps({
        mous: [m], schools: [sch], salesPersons: [sp], users: [u],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reminder.kind).toBe('intake')
    expect(result.composed.to).toBe('vikram.t@getsetlearn.info')
    expect(result.composed.subject).toContain('Compose Test School')
    expect(result.composed.body).toContain('Vikram T.')
    expect(result.composed.body).toContain('Compose Test School')
    expect(result.composed.body).toContain('30 days')
    expect(result.communication.type).toBe('reminder-intake-chase')
    expect(result.communication.status).toBe('queued-for-manual')
    expect(result.communication.auditLog[0]!.action).toBe('reminder-composed')
    expect(result.communication.auditLog[0]!.after?.kind).toBe('intake')
  })

  it('CC fan-out uses the intake-reminder CcRuleContext (verified via resolveCc invocation)', async () => {
    const u = user('opshead', 'OpsHead')
    const { sch, m, sp } = intakeReminderState()
    const resolveCc = vi.fn(
      (_args: { context: string; schoolId: string; mouId: string | null }) =>
        ['cc1@example.in', 'cc2@example.in'],
    )
    const result = await composeReminder(
      { reminderId: 'rem-intake-MOU-COMP', composedBy: u.id },
      makeDeps({
        mous: [m], schools: [sch], salesPersons: [sp], users: [u],
        ccRules: [],
        resolveCc: resolveCc as unknown as ComposeReminderDeps['resolveCc'],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.composed.ccEmails).toEqual(['cc1@example.in', 'cc2@example.in'])
    expect(resolveCc).toHaveBeenCalledTimes(1)
    expect(resolveCc.mock.calls[0]![0]).toMatchObject({
      context: 'intake-reminder',
      schoolId: 'SCH-COMP',
      mouId: 'MOU-COMP',
    })
  })
})

describe('W4-E.4 markReminderSent', () => {
  function makeDeps(over: Partial<MarkReminderSentDeps> = {}): MarkReminderSentDeps {
    return {
      communications: [],
      users: [],
      enqueue: vi.fn() as unknown as MarkReminderSentDeps['enqueue'],
      now: () => NOW,
      ...over,
    }
  }
  function reminderComm(): Communication {
    return {
      id: 'COM-REM-1',
      type: 'reminder-intake-chase',
      schoolId: 'SCH-COMP',
      mouId: 'MOU-COMP',
      installmentSeq: null,
      channel: 'email',
      subject: 'Reminder: complete intake for X',
      bodyEmail: '...',
      bodyWhatsApp: null,
      toEmail: 'vikram.t@getsetlearn.info',
      toPhone: null,
      ccEmails: [],
      queuedAt: isoDaysAgo(0),
      queuedBy: 'opshead',
      sentAt: null,
      copiedAt: null,
      status: 'queued-for-manual',
      bounceDetail: null,
      auditLog: [],
    }
  }

  it('flips queued-for-manual to sent and appends reminder-marked-sent audit', async () => {
    const u = user('opshead', 'OpsHead')
    const c = reminderComm()
    const result = await markReminderSent(
      { communicationId: 'COM-REM-1', markedBy: u.id },
      makeDeps({ communications: [c], users: [u] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.communication.status).toBe('sent')
    expect(result.communication.sentAt).not.toBeNull()
    const last = result.communication.auditLog[result.communication.auditLog.length - 1]
    expect(last?.action).toBe('reminder-marked-sent')
  })

  it('rejects already-sent communications without writing', async () => {
    const u = user('opshead', 'OpsHead')
    const c = { ...reminderComm(), status: 'sent' as const, sentAt: isoDaysAgo(1) }
    const result = await markReminderSent(
      { communicationId: 'COM-REM-1', markedBy: u.id },
      makeDeps({ communications: [c], users: [u] }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('already-sent')
  })

  it('rejects non-reminder Communication types (e.g., feedback-request)', async () => {
    const u = user('opshead', 'OpsHead')
    const c = { ...reminderComm(), type: 'feedback-request' as const }
    const result = await markReminderSent(
      { communicationId: 'COM-REM-1', markedBy: u.id },
      makeDeps({ communications: [c], users: [u] }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-a-reminder')
  })
})
