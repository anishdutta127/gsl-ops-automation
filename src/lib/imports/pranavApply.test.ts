import { describe, expect, it } from 'vitest'
import xlsx from 'xlsx'
import {
  applyPranavRefresh,
  type ApplyInput,
  type ClassifiedRow,
  type RowDecision,
} from './pranavApply'
import { parsePranavRefresh } from './pranavRefresh'
import type { MOU, School } from '../types'

function emptyState(): ApplyInput['currentState'] {
  return { mous: [], payments: [], schools: [], salesTeam: [] }
}

function existingMou(over: Partial<MOU>): MOU {
  return {
    id: 'MOU-EXISTING',
    schoolId: 'sch-existing',
    schoolName: 'Existing School',
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
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 118000,
    received: 0,
    tds: 0,
    balance: 118000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: 'TT',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...over,
  } as MOU
}

function existingSchool(over: Partial<School>): School {
  return {
    id: 'sch-existing',
    name: 'Existing School',
    legalEntity: null,
    city: '',
    state: '',
    region: '',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    auditLog: [],
    ...over,
  } as School
}

function classifyNew(): ClassifiedRow {
  const sheet = xlsx.utils.aoa_to_sheet([
    [], [], [], [], [], [
      'Sr. No.', 'Name of School', 'Status', 'No. of Schools', 'Sales Rep',
      'Physical', 'MOU', 'Kits', 'Model', 'Duration', 'City', 'State',
      'Students', 'Sale', 'Actual', 'SPwo', 'SPw', 'SA', 'Recv', 'TDS',
      'Bal', '%', '', '%', 'Amount', 'Month', 'Pmt',
    ],
    [
      1, 'New School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      100, 100000, 100, 850, 1000, 100000, 0, 0, 100000, 0,
      '', 1.0, 100000, new Date('2026-05-31T00:00:00.000Z'), '',
    ],
  ])
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, '2026-27PD ')
  const parsed = parsePranavRefresh(book)
  return {
    classification: 'NEW',
    refreshRow: parsed.rows[0]!,
    matchedMouId: null,
    candidateMatchIds: [],
    mouDiffs: [],
    installmentDiffs: [],
  }
}

function classifyUpdate(): { row: ClassifiedRow; mou: MOU } {
  const sheet = xlsx.utils.aoa_to_sheet([
    [], [], [], [], [],
    [
      'Sr. No.', 'Name of School', 'Status', 'No. of Schools', 'Sales Rep',
      'Physical', 'MOU', 'Kits', 'Model', 'Duration', 'City', 'State',
      'Students', 'Sale', 'Actual', 'SPwo', 'SPw', 'SA', 'Recv', 'TDS',
      'Bal', '%',
    ],
    [
      1, 'Existing School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      150, 118000, 120, 1000, 1180, 118000, 50000, 0, 68000, 0.42,
    ],
  ])
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, '2026-27PD ')
  const parsed = parsePranavRefresh(book)
  const mou = existingMou({})
  return {
    row: {
      classification: 'UPDATE',
      refreshRow: parsed.rows[0]!,
      matchedMouId: mou.id,
      candidateMatchIds: [mou.id],
      mouDiffs: [
        { field: 'studentsMou', current: 100, refresh: 150, kind: 'fill' },
        { field: 'studentsActual', current: null, refresh: 120, kind: 'fill' },
        { field: 'received', current: 0, refresh: 50000, kind: 'fill' },
      ],
      installmentDiffs: [],
    },
    mou,
  }
}

describe('applyPranavRefresh', () => {
  it('creates a new MOU + School + Payment for a NEW classification', () => {
    const cls = classifyNew()
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [cls],
      decisions: new Map([[cls.refreshRow.rowNum, { rowNum: cls.refreshRow.rowNum, decision: 'apply' }]]),
      currentState: emptyState(),
    })
    expect(result.summary.created).toBe(1)
    expect(result.newState.mous).toHaveLength(1)
    expect(result.newState.schools).toHaveLength(1)
    expect(result.newState.payments).toHaveLength(1)
    expect(result.outcomes[0]!.result).toBe('created')
    expect(result.outcomes[0]!.newMouId).toMatch(/^MOU-STEAM-2627-/)
    const auditEntries = result.newState.mous[0]!.auditLog
    expect(auditEntries.length).toBeGreaterThanOrEqual(1)
    expect(auditEntries[0]!.notes).toBe('source: pranav-refresh-2026-05-13')
  })

  it('updates an existing MOU on UPDATE classification', () => {
    const { row, mou } = classifyUpdate()
    const state = emptyState()
    state.mous.push(mou)
    state.schools.push(existingSchool({}))
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [row],
      decisions: new Map([[row.refreshRow.rowNum, { rowNum: row.refreshRow.rowNum, decision: 'apply' }]]),
      currentState: state,
    })
    expect(result.summary.updated).toBe(1)
    expect(result.newState.mous[0]!.studentsMou).toBe(150)
    expect(result.newState.mous[0]!.received).toBe(50000)
    expect(result.newState.mous[0]!.balance).toBe(68000)
  })

  it('skips a row when decision is skip', () => {
    const cls = classifyNew()
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [cls],
      decisions: new Map([[cls.refreshRow.rowNum, { rowNum: cls.refreshRow.rowNum, decision: 'skip' }]]),
      currentState: emptyState(),
    })
    expect(result.summary.skipped).toBe(1)
    expect(result.newState.mous).toHaveLength(0)
  })

  it('respects keep-current on a CONFLICT row', () => {
    const { row, mou } = classifyUpdate()
    row.classification = 'CONFLICT'
    row.mouDiffs[0]!.kind = 'overwrite'
    const state = emptyState()
    state.mous.push(mou)
    state.schools.push(existingSchool({}))
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [row],
      decisions: new Map([[row.refreshRow.rowNum, { rowNum: row.refreshRow.rowNum, decision: 'apply', conflictResolution: 'keep-current' }]]),
      currentState: state,
    })
    expect(result.summary.keptCurrent).toBe(1)
    expect(result.newState.mous[0]!.studentsMou).toBe(100)
  })

  it('respects keep-both on a CONFLICT row by creating a parallel MOU', () => {
    const { row, mou } = classifyUpdate()
    row.classification = 'CONFLICT'
    row.mouDiffs[0]!.kind = 'overwrite'
    const state = emptyState()
    state.mous.push(mou)
    state.schools.push(existingSchool({}))
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [row],
      decisions: new Map([[row.refreshRow.rowNum, { rowNum: row.refreshRow.rowNum, decision: 'apply', conflictResolution: 'keep-both' }]]),
      currentState: state,
    })
    expect(result.summary.keptBoth).toBe(1)
    expect(result.newState.mous).toHaveLength(2)
    expect(result.newState.mous[0]!.id).toBe('MOU-EXISTING')
    expect(result.newState.mous[1]!.id).toMatch(/^MOU-STEAM-2627-/)
  })

  it('apply-refresh on CONFLICT overwrites the conflicting field with audit', () => {
    const { row, mou } = classifyUpdate()
    row.classification = 'CONFLICT'
    row.mouDiffs[0]!.kind = 'overwrite'
    const state = emptyState()
    state.mous.push(mou)
    state.schools.push(existingSchool({}))
    const result = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [row],
      decisions: new Map([[row.refreshRow.rowNum, { rowNum: row.refreshRow.rowNum, decision: 'apply', conflictResolution: 'apply-refresh' }]]),
      currentState: state,
    })
    expect(result.summary.updated).toBe(1)
    expect(result.newState.mous[0]!.studentsMou).toBe(150)
    const log = result.newState.mous[0]!.auditLog
    expect(log[log.length - 1]!.notes).toContain('pranav-refresh-2026-05-13')
  })

  it('is idempotent: re-applying same plan after an apply produces zero changes', () => {
    const cls = classifyNew()
    const decisions = new Map<number, RowDecision>([
      [cls.refreshRow.rowNum, { rowNum: cls.refreshRow.rowNum, decision: 'apply' }],
    ])
    const first = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [cls],
      decisions,
      currentState: emptyState(),
    })
    // Re-classify against the new state. Because we use the same parsed
    // row and the apply created the school + MOU, a second classification
    // should now be UPDATE or UNCHANGED. We simulate UNCHANGED by zeroing
    // diffs and matching the just-created MOU.
    const newMouId = first.outcomes[0]!.newMouId!
    const second = applyPranavRefresh({
      refreshTag: 'pranav-refresh-2026-05-13',
      appliedBy: 'usr-test',
      classified: [{
        classification: 'UNCHANGED',
        refreshRow: cls.refreshRow,
        matchedMouId: newMouId,
        candidateMatchIds: [newMouId],
        mouDiffs: [],
        installmentDiffs: [],
      }],
      decisions,
      currentState: first.newState,
    })
    expect(second.summary.unchanged).toBe(1)
    expect(second.summary.created).toBe(0)
    expect(second.summary.updated).toBe(0)
    expect(second.newState.mous).toHaveLength(1)
  })
})
