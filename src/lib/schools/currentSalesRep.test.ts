import { describe, expect, it } from 'vitest'
import type { AuditEntry, MOU, School } from '@/lib/types'
import { getCurrentSalesRepForSchool } from './currentSalesRep'

function makeSchool(auditLog: AuditEntry[] = []): School {
  return {
    id: 'SCH-TEST',
    name: 'Test School',
    legalEntity: null,
    city: 'X',
    state: 'Y',
    region: 'East',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01',
    auditLog,
  }
}

function makeMou(id: string, salesPersonId: string | null, generatedAt: string | null): MOU {
  return {
    id,
    schoolId: 'SCH-TEST',
    schoolName: 'Test School',
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
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId,
    templateVersion: null,
    generatedAt,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
  }
}

function reassignedAudit(salesPersonId: string | null, ts: string): AuditEntry {
  return {
    timestamp: ts,
    user: 'anish.d',
    action: 'sales-rep-reassigned',
    before: { salesPersonId: null },
    after: { salesPersonId },
    notes: 'test reassignment',
  }
}

describe('getCurrentSalesRepForSchool', () => {
  it('returns null when no audit entries and no MOUs', () => {
    expect(getCurrentSalesRepForSchool(makeSchool(), [])).toBeNull()
  })

  it('returns the most-recent MOU salesPersonId when no audit entries', () => {
    const mous = [
      makeMou('MOU-A', 'sp-old', '2026-01-01T00:00:00.000Z'),
      makeMou('MOU-B', 'sp-new', '2026-03-01T00:00:00.000Z'),
    ]
    expect(getCurrentSalesRepForSchool(makeSchool(), mous)).toBe('sp-new')
  })

  it('audit-log reassignment wins over most-recent MOU', () => {
    const school = makeSchool([reassignedAudit('sp-audit', '2026-04-01T00:00:00.000Z')])
    const mous = [makeMou('MOU-A', 'sp-mou', '2026-03-01T00:00:00.000Z')]
    expect(getCurrentSalesRepForSchool(school, mous)).toBe('sp-audit')
  })

  it('newest audit-log entry wins over older audit-log entries', () => {
    const school = makeSchool([
      reassignedAudit('sp-old', '2026-01-01T00:00:00.000Z'),
      reassignedAudit('sp-newer', '2026-02-01T00:00:00.000Z'),
      reassignedAudit('sp-newest', '2026-03-01T00:00:00.000Z'),
    ])
    expect(getCurrentSalesRepForSchool(school, [])).toBe('sp-newest')
  })

  it('explicit null reassignment (unassign) is honoured', () => {
    const school = makeSchool([reassignedAudit(null, '2026-04-01T00:00:00.000Z')])
    const mous = [makeMou('MOU-A', 'sp-mou', '2026-03-01T00:00:00.000Z')]
    expect(getCurrentSalesRepForSchool(school, mous)).toBeNull()
  })

  it('ignores non-reassignment audit entries when finding the latest', () => {
    const school = makeSchool([
      reassignedAudit('sp-actual', '2026-04-01T00:00:00.000Z'),
      {
        timestamp: '2026-05-01T00:00:00.000Z',
        user: 'misba.m',
        action: 'update',
        before: { phone: null },
        after: { phone: '+91 99999 99999' },
        notes: 'updated phone',
      },
    ])
    expect(getCurrentSalesRepForSchool(school, [])).toBe('sp-actual')
  })

  it('falls back to MOU.id sort when generatedAt is null on every MOU', () => {
    const mous = [
      makeMou('MOU-STEAM-2627-001', 'sp-first', null),
      makeMou('MOU-STEAM-2627-099', 'sp-last', null),
    ]
    expect(getCurrentSalesRepForSchool(makeSchool(), mous)).toBe('sp-last')
  })
})
