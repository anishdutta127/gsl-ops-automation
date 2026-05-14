/*
 * Gate 5A.8: Pranav refresh apply core.
 *
 * Pure function. Takes the parsed refresh + a current snapshot of the
 * live JSON files + per-row apply decisions, and returns:
 *   - new arrays for each entity (mous, payments, schools, sales_team)
 *   - per-row outcome record with applied changes
 *
 * Callers:
 *   scripts/apply-pranav-refresh.mjs     (CLI for the 2026-05-13 apply)
 *   src/app/api/admin/imports/pranav-refresh/apply/route.ts   (admin UI)
 *
 * Discipline:
 *   - Every change appends an AuditEntry on the entity's auditLog with
 *     source="pranav-refresh-<date>" in notes.
 *   - Idempotent: re-applying the same plan after a successful apply
 *     produces zero changes (UNCHANGED on every row).
 *   - Conflicts are NEVER overwritten silently; the caller must supply
 *     a resolution choice.
 */

import type { ParsedRow } from './pranavRefresh'
import type { MOU, Payment, School, AuditEntry } from '../types'

export type Classification = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'CONFLICT' | 'AMBIGUOUS'

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface ClassifiedRow {
  classification: Classification
  refreshRow: ParsedRow
  matchedMouId: string | null
  candidateMatchIds: string[]
  mouDiffs: Array<{ field: string; current: unknown; refresh: unknown; kind: 'fill' | 'overwrite' }>
  installmentDiffs: Array<{
    seq: number
    status: 'new' | 'update' | 'unchanged'
    refresh: ParsedRow['installments'][number]
    current: Payment | null
    diffs?: Array<{ field: string; current: unknown; refresh: unknown; kind: 'fill' | 'overwrite' }>
  }>
}

export type ConflictResolution = 'keep-current' | 'apply-refresh' | 'keep-both'

export interface RowDecision {
  rowNum: number
  decision: 'apply' | 'skip'
  conflictResolution?: ConflictResolution
  ambiguousMatchId?: string
}

export interface ApplyInput {
  refreshTag: string
  appliedBy: string
  classified: ClassifiedRow[]
  decisions: Map<number, RowDecision>
  currentState: {
    mous: MOU[]
    payments: Payment[]
    schools: School[]
    salesTeam: Array<{ id: string; name: string; email: string | null; phone: string | null; territories: string[]; active: boolean; notes: string | null; createdAt: string }>
  }
}

export interface RowOutcome {
  rowNum: number
  schoolName: string
  classification: Classification
  decision: 'apply' | 'skip'
  result: 'created' | 'updated' | 'unchanged' | 'skipped' | 'kept-current' | 'kept-both' | 'error'
  changes: FieldChange[]
  newMouId?: string
  message?: string
}

export interface ApplyResult {
  refreshTag: string
  appliedAt: string
  appliedBy: string
  outcomes: RowOutcome[]
  summary: {
    created: number
    updated: number
    unchanged: number
    skipped: number
    keptCurrent: number
    keptBoth: number
    errored: number
  }
  newState: ApplyInput['currentState']
}

function slugify(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function maxNumericSuffix(ids: string[], prefix: string): number {
  let max = 0
  const re = new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)`)
  for (const id of ids) {
    const m = id.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

function mintMouId(state: ApplyInput['currentState'], seed: number): string {
  const existing = state.mous.map((m) => m.id)
  const start = Math.max(maxNumericSuffix(existing, 'MOU-STEAM-2627-'), seed)
  return `MOU-STEAM-2627-${String(start + 1).padStart(3, '0')}`
}

function newAuditEntry(
  userId: string,
  refreshTag: string,
  changes: FieldChange[],
  kind: 'create' | 'update',
): AuditEntry {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const c of changes) {
    before[c.field] = c.before
    after[c.field] = c.after
  }
  return {
    timestamp: new Date().toISOString(),
    user: userId,
    action: kind,
    before: kind === 'update' ? before : undefined,
    after,
    notes: `source: ${refreshTag}`,
  }
}

function upsertSchool(
  state: ApplyInput['currentState'],
  row: ParsedRow,
  refreshTag: string,
  userId: string,
): { schoolId: string; changes: FieldChange[] } {
  const slug = row.schoolSlug
  const schoolId = `sch-${slug}`
  const existing = state.schools.find((s) => s.id === schoolId || slugify(s.name) === slug)
  const changes: FieldChange[] = []
  if (!existing) {
    const fresh: School = {
      id: schoolId,
      name: row.schoolName,
      legalEntity: null,
      city: row.city ?? '',
      state: row.state ?? '',
      region: '',
      pinCode: null,
      contactPerson: null,
      email: null,
      phone: null,
      billingName: null,
      pan: null,
      gstNumber: null,
      notes: `Created from Pranav refresh ${refreshTag}`,
      active: true,
      createdAt: new Date().toISOString(),
      auditLog: [
        newAuditEntry(userId, refreshTag, [
          { field: 'name', before: null, after: row.schoolName },
          { field: 'city', before: null, after: row.city },
          { field: 'state', before: null, after: row.state },
        ], 'create'),
      ],
    } as unknown as School
    state.schools.push(fresh)
    return { schoolId, changes: [{ field: 'school', before: null, after: schoolId }] }
  }
  if (!existing.city && row.city) {
    changes.push({ field: 'city', before: existing.city, after: row.city })
    existing.city = row.city
  }
  if (!existing.state && row.state) {
    changes.push({ field: 'state', before: existing.state, after: row.state })
    existing.state = row.state
  }
  if (changes.length) {
    existing.auditLog = existing.auditLog ?? []
    existing.auditLog.push(newAuditEntry(userId, refreshTag, changes, 'update'))
  }
  return { schoolId: existing.id, changes }
}

function upsertSalesRep(
  state: ApplyInput['currentState'],
  name: string | null,
  refreshTag: string,
): string | null {
  if (!name) return null
  const slug = slugify(name)
  const id = `sp-${slug}`
  const existing = state.salesTeam.find((s) => s.id === id || slugify(s.name) === slug)
  if (existing) return existing.id
  state.salesTeam.push({
    id,
    name,
    email: null,
    phone: null,
    territories: [],
    active: true,
    notes: `Auto-created from Pranav refresh ${refreshTag}`,
    createdAt: new Date().toISOString(),
  })
  return id
}

function applyInstallmentChanges(
  state: ApplyInput['currentState'],
  mouId: string,
  row: ParsedRow,
  refreshTag: string,
  userId: string,
  isNewMou: boolean,
): FieldChange[] {
  const changes: FieldChange[] = []
  const existingForMou = state.payments.filter((p) => p.mouId === mouId)
  const total = Math.max(row.installments.length, 1)
  for (const inst of row.installments) {
    const id = `${mouId}-i${inst.seq}`
    let payment = existingForMou.find((p) => p.id === id)
    if (!payment) {
      payment = {
        id,
        mouId,
        schoolName: row.schoolName,
        programme: 'STEAM',
        instalmentLabel: `${inst.seq} of ${total}`,
        instalmentSeq: inst.seq,
        totalInstalments: total,
        description: '',
        dueDateRaw: inst.monthRaw,
        dueDateIso: inst.monthIso,
        expectedAmount: inst.amount ?? 0,
        receivedAmount: inst.isReceived ? (inst.amount ?? 0) : null,
        receivedDate: inst.isReceived ? inst.monthIso : null,
        paymentMode: null,
        bankReference: null,
        piNumber: null,
        taxInvoiceNumber: null,
        status: inst.isReceived ? 'Received' : 'Pending',
        notes: `Created from Pranav refresh ${refreshTag}`,
        piSentDate: null,
        piSentTo: null,
        piGeneratedAt: null,
        studentCountActual: null,
        partialPayments: null,
        auditLog: [
          newAuditEntry(userId, refreshTag, [
            { field: 'expectedAmount', before: null, after: inst.amount ?? 0 },
            { field: 'dueDateIso', before: null, after: inst.monthIso },
            { field: 'status', before: null, after: inst.isReceived ? 'Received' : 'Pending' },
          ], 'create'),
        ],
      }
      state.payments.push(payment)
      changes.push({ field: `payment.${inst.seq}.created`, before: null, after: inst.amount })
      continue
    }
    if (isNewMou) continue
    const paymentChanges: FieldChange[] = []
    if (inst.amount !== null && Math.abs((inst.amount ?? 0) - (payment.expectedAmount ?? 0)) > 1) {
      if (payment.expectedAmount === 0 || payment.expectedAmount === null) {
        paymentChanges.push({ field: 'expectedAmount', before: payment.expectedAmount, after: inst.amount })
        payment.expectedAmount = inst.amount
      }
    }
    if (inst.monthIso && inst.monthIso !== payment.dueDateIso) {
      if (!payment.dueDateIso) {
        paymentChanges.push({ field: 'dueDateIso', before: payment.dueDateIso, after: inst.monthIso })
        payment.dueDateIso = inst.monthIso
      }
    }
    if (inst.monthRaw && inst.monthRaw !== payment.dueDateRaw) {
      if (!payment.dueDateRaw) {
        paymentChanges.push({ field: 'dueDateRaw', before: payment.dueDateRaw, after: inst.monthRaw })
        payment.dueDateRaw = inst.monthRaw
      }
    }
    if (inst.isReceived && payment.status !== 'Received' && payment.status !== 'Paid') {
      paymentChanges.push({ field: 'status', before: payment.status, after: 'Received' })
      payment.status = 'Received'
    }
    if (paymentChanges.length) {
      payment.auditLog = payment.auditLog ?? []
      payment.auditLog.push(newAuditEntry(userId, refreshTag, paymentChanges, 'update'))
      for (const c of paymentChanges) changes.push({ field: `payment.${inst.seq}.${c.field}`, before: c.before, after: c.after })
    }
  }
  return changes
}

function createMou(
  state: ApplyInput['currentState'],
  row: ParsedRow,
  schoolId: string,
  salesPersonId: string | null,
  refreshTag: string,
  userId: string,
  idHint: string | null,
): { mou: MOU; changes: FieldChange[] } {
  const id = idHint ?? mintMouId(state, state.mous.length)
  const mou: MOU = {
    id,
    schoolId,
    schoolName: row.schoolName,
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: row.mouSigned ? 'Active' : 'Pending Signature',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: row.duration.start,
    endDate: row.duration.end,
    studentsMou: row.studentsMou ?? 0,
    studentsActual: row.studentsActual,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: row.spWithoutTax ?? 0,
    spWithTax: row.spWithTax ?? 0,
    contractValue: row.contractValue ?? 0,
    received: row.received ?? 0,
    tds: row.tds ?? 0,
    balance: (row.contractValue ?? 0) - (row.received ?? 0),
    receivedPct:
      (row.contractValue ?? 0) > 0
        ? Math.round(((row.received ?? 0) / (row.contractValue ?? 0)) * 100)
        : 0,
    paymentSchedule: '',
    trainerModel: row.trainerModel,
    salesPersonId,
    templateVersion: null,
    generatedAt: null,
    notes: `Created from Pranav refresh ${refreshTag}`,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [
      newAuditEntry(
        userId,
        refreshTag,
        [
          { field: 'schoolName', before: null, after: row.schoolName },
          { field: 'contractValue', before: null, after: row.contractValue ?? 0 },
          { field: 'studentsMou', before: null, after: row.studentsMou ?? 0 },
          { field: 'trainerModel', before: null, after: row.trainerModel },
        ],
        'create',
      ),
    ],
    effectiveDate: row.duration.start,
    signedMouPdfPath: row.physicalCopyScanned ? `imports/${refreshTag}/stubs/${id}.pdf` : null,
    importNotes: [
      row.acquisitionStatus && `acquisitionStatus=${row.acquisitionStatus}`,
      row.kitsSent && `kitsSent=${row.kitsSent}`,
      `source=${refreshTag}`,
    ].filter(Boolean).join('; ') || null,
  } as MOU
  state.mous.push(mou)
  return {
    mou,
    changes: [
      { field: 'mou.created', before: null, after: id },
      { field: 'contractValue', before: null, after: row.contractValue ?? 0 },
      { field: 'studentsMou', before: null, after: row.studentsMou ?? 0 },
    ],
  }
}

function updateMouFields(
  mou: MOU,
  row: ParsedRow,
  diffs: ClassifiedRow['mouDiffs'],
  conflictResolution: ConflictResolution | undefined,
  refreshTag: string,
  userId: string,
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const d of diffs) {
    const shouldApply =
      d.kind === 'fill' ||
      (d.kind === 'overwrite' && conflictResolution === 'apply-refresh')
    if (!shouldApply) continue
    const before = (mou as unknown as Record<string, unknown>)[d.field]
    const after = d.refresh
    if (d.field === 'startDate' || d.field === 'endDate') {
      (mou as unknown as Record<string, unknown>)[d.field] = after
    } else {
      (mou as unknown as Record<string, unknown>)[d.field] = after
    }
    changes.push({ field: d.field, before, after })
  }
  if (changes.length) {
    mou.balance = (mou.contractValue ?? 0) - (mou.received ?? 0)
    mou.receivedPct =
      (mou.contractValue ?? 0) > 0
        ? Math.round(((mou.received ?? 0) / (mou.contractValue ?? 0)) * 100)
        : 0
    mou.auditLog = mou.auditLog ?? []
    mou.auditLog.push(newAuditEntry(userId, refreshTag, changes, 'update'))
  }
  return changes
}

export function applyPranavRefresh(input: ApplyInput): ApplyResult {
  const state: ApplyInput['currentState'] = {
    mous: input.currentState.mous.map((m) => ({ ...m, auditLog: [...(m.auditLog ?? [])] })),
    payments: input.currentState.payments.map((p) => ({ ...p, auditLog: p.auditLog ? [...p.auditLog] : null })),
    schools: input.currentState.schools.map((s) => ({ ...s, auditLog: [...(s.auditLog ?? [])] })),
    salesTeam: input.currentState.salesTeam.map((s) => ({ ...s })),
  }

  const outcomes: RowOutcome[] = []
  for (const cls of input.classified) {
    // Per-row try/catch so an unexpected throw in one row (bad fixture,
    // null where the writer assumed a value) becomes a row-level error
    // outcome rather than aborting the entire batch.
    try {
      const decision = input.decisions.get(cls.refreshRow.rowNum)
      if (!decision || decision.decision === 'skip') {
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'skip',
          result: 'skipped',
          changes: [],
          message: !decision ? 'No decision supplied; skipped' : undefined,
        })
        continue
      }

      if (cls.classification === 'UNCHANGED') {
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'unchanged',
          changes: [],
        })
        continue
      }

      const { schoolId } = upsertSchool(state, cls.refreshRow, input.refreshTag, input.appliedBy)
      const salesId = upsertSalesRep(state, cls.refreshRow.salesRepName, input.refreshTag)

      if (cls.classification === 'NEW') {
        const { mou, changes } = createMou(
          state,
          cls.refreshRow,
          schoolId,
          salesId,
          input.refreshTag,
          input.appliedBy,
          null,
        )
        const instChanges = applyInstallmentChanges(state, mou.id, cls.refreshRow, input.refreshTag, input.appliedBy, true)
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'created',
          changes: [...changes, ...instChanges],
          newMouId: mou.id,
        })
        continue
      }

      if (cls.classification === 'CONFLICT' && decision.conflictResolution === 'keep-current') {
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'kept-current',
          changes: [],
          message: 'Kept current values; no changes applied',
        })
        continue
      }

      if (cls.classification === 'CONFLICT' && decision.conflictResolution === 'keep-both') {
        const { mou, changes } = createMou(
          state,
          cls.refreshRow,
          schoolId,
          salesId,
          input.refreshTag,
          input.appliedBy,
          null,
        )
        const instChanges = applyInstallmentChanges(state, mou.id, cls.refreshRow, input.refreshTag, input.appliedBy, true)
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'kept-both',
          changes: [...changes, ...instChanges],
          newMouId: mou.id,
          message: `Refresh stored as new MOU ${mou.id}; original kept as ${cls.matchedMouId}`,
        })
        continue
      }

      // UPDATE or CONFLICT/apply-refresh: mutate the matched MOU.
      const matchedId = decision.ambiguousMatchId ?? cls.matchedMouId
      if (!matchedId) {
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'error',
          changes: [],
          message: 'No matched MOU id available for update',
        })
        continue
      }
      const mou = state.mous.find((m) => m.id === matchedId)
      if (!mou) {
        outcomes.push({
          rowNum: cls.refreshRow.rowNum,
          schoolName: cls.refreshRow.schoolName,
          classification: cls.classification,
          decision: 'apply',
          result: 'error',
          changes: [],
          message: `Matched MOU ${matchedId} not found in state`,
        })
        continue
      }
      const mouChanges = updateMouFields(mou, cls.refreshRow, cls.mouDiffs, decision.conflictResolution, input.refreshTag, input.appliedBy)
      const instChanges = applyInstallmentChanges(state, mou.id, cls.refreshRow, input.refreshTag, input.appliedBy, false)
      outcomes.push({
        rowNum: cls.refreshRow.rowNum,
        schoolName: cls.refreshRow.schoolName,
        classification: cls.classification,
        decision: 'apply',
        result: mouChanges.length + instChanges.length > 0 ? 'updated' : 'unchanged',
        changes: [...mouChanges, ...instChanges],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      outcomes.push({
        rowNum: cls.refreshRow.rowNum,
        schoolName: cls.refreshRow.schoolName,
        classification: cls.classification,
        decision: 'apply',
        result: 'error',
        changes: [],
        message: `Row threw during apply: ${message}`,
      })
    }
  }

  const summary = {
    created: outcomes.filter((o) => o.result === 'created').length,
    updated: outcomes.filter((o) => o.result === 'updated').length,
    unchanged: outcomes.filter((o) => o.result === 'unchanged').length,
    skipped: outcomes.filter((o) => o.result === 'skipped').length,
    keptCurrent: outcomes.filter((o) => o.result === 'kept-current').length,
    keptBoth: outcomes.filter((o) => o.result === 'kept-both').length,
    errored: outcomes.filter((o) => o.result === 'error').length,
  }

  return {
    refreshTag: input.refreshTag,
    appliedAt: new Date().toISOString(),
    appliedBy: input.appliedBy,
    outcomes,
    summary,
    newState: state,
  }
}
