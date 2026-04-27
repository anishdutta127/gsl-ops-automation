/*
 * MOU -> Ops importer (Q-A spec, eng review lines 60-119).
 *
 * Pipeline (each incoming RawMou flows through these steps in order):
 *
 *   1. Legacy academicYear filter
 *      Drops records where academicYear < minAcademicYear UNLESS
 *      legacyIncludeFlag is true. The flag is the Item C (Ameet's
 *      pending decision) gate: default EXCLUDED so Phase 1 ships
 *      with the 2026-04 cohort only; INCLUDED flips for the legacy
 *      back-fill pass.
 *
 *   2. Normalise step (pure transform)
 *      Currently only the GSLT-Cretile rewrite per Update 1:
 *      programme: 'GSLT-Cretile' -> programme: 'STEAM' +
 *      programmeSubType: 'GSLT-Cretile'. Records the rewrite as an
 *      auditLog entry with BOTH before AND after fields so post-
 *      hoc queries can distinguish "natively STEAM" from "rewritten
 *      from GSLT-Cretile at import." If the legacy-include flag was
 *      what allowed the record through step 1, a parallel
 *      'legacy-include-import' auditLog entry is appended here.
 *
 *   3. Validators (pure pass/fail)
 *      Seven invariants per validators.ts. First failure short-
 *      circuits; record lands in mou_import_review.json with
 *      validationFailed: <category> and never pollutes mous.json.
 *
 *   4. School identity resolution
 *      Normalised tuple lookup against Ops schools.json via
 *      schoolMatcher.findCandidates. Zero matches -> quarantine
 *      "no match"; multiple matches -> quarantine "human
 *      disambiguation"; exactly one -> auto-link path.
 *
 *   5. Chain-MOU heuristic (post-school-match)
 *      If schoolName contains "Group of Schools" OR studentsMou >
 *      single-school plausibility threshold (1500), the record is
 *      quarantined for SINGLE-vs-GROUP human classification rather
 *      than auto-linked. The matched school is preserved in
 *      candidates so the reviewer can see what the matcher found.
 *
 *   6. Auto-link write
 *      mous.json gains the new MOU with schoolId set; auditLog has
 *      'auto-link-exact-match' entry; queue-enqueued via the
 *      injected enqueue dep. The matched School's auditLog is NOT
 *      mutated by this lib (the MOU.auditLog is the canonical
 *      audit anchor for the link event, per DESIGN.md "Audit log
 *      conventions"); a future admin route may also annotate the
 *      School if useful, but Phase 1 lib does not.
 *
 * Eventual consistency: if the upstream MOU repo is mid-write when
 * fromMou reads, this importer sees a slightly stale view; the next
 * tick catches up. Not a correctness issue per Q-A line 68; the
 * dedup-by-id check prevents double-import on transient races.
 *
 * System errors (Contents API failures, JSON parse, queue write
 * failures) are captured into result.errors as ImporterError
 * instances. Validator and school-matcher quarantines are NOT
 * errors; they are normal outcomes recorded in result.quarantined.
 */

import type {
  AuditEntry,
  MOU,
  MouImportReviewItem,
  Programme,
  SalesPerson,
  School,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import salesTeamJson from '@/data/sales_team.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { fetchMouMous, fetchMouSchools } from './mouContentsApi'
import { findCandidates } from './schoolMatcher'
import { validate } from './validators'

const CHAIN_NAME_PATTERN = /group\s+of\s+schools/i
const SINGLE_SCHOOL_STUDENT_CEILING = 1500

export class ImporterError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ImporterError'
    this.cause = cause
  }
}

export interface RawMou {
  id: string
  schoolName: string
  programme: string
  programmeSubType?: string | null
  status?: string
  academicYear: string
  startDate?: string | null
  endDate?: string | null
  studentsMou: number
  studentsActual?: number | null
  studentsVariance?: number | null
  studentsVariancePct?: number | null
  spWithoutTax: number
  spWithTax: number
  contractValue: number
  received?: number
  tds?: number
  balance?: number
  receivedPct?: number
  paymentSchedule?: string
  trainerModel?: string | null
  salesPersonId?: string | null
  /**
   * Free-text sales rep name carried by upstream gsl-mou-system records
   * (e.g., "Anshuman", "Balu R"). Resolved to SalesPerson.id via
   * salesPersonResolver during the import pipeline; the resolved id
   * lands on MOU.salesPersonId, the original free-text is preserved
   * in the audit log when resolution is non-trivial.
   */
  salesRep?: string | null
  templateVersion?: string | null
  generatedAt?: string | null
  notes?: string | null
  daysToExpiry?: number | null
  schoolId?: string
  city?: string
  state?: string
}

export interface RawMouSchool {
  id: string
  name: string
  city: string
  state: string
}

export interface ImporterDeps {
  fetchMouMous: () => Promise<RawMou[]>
  fetchMouSchools: () => Promise<RawMouSchool[]>
  opsSchools: School[]
  opsMous: MOU[]
  opsSalesTeam: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
  legacyIncludeFlag: boolean
  minAcademicYear: string
  /**
   * When true, the seven structural validators relax the
   * studentsMou-zero and contractValue-zero rules: legacy upstream
   * records often carry zero placeholders for fields not yet filled.
   * Tax + date inversions stay strict. Default: false (Phase 1
   * import-tick gets the strict path; Week 3 one-shot script gets
   * the relaxed path with `true`).
   */
  legacyValidationRelaxed: boolean
  /**
   * Resolves an upstream free-text sales rep name to a
   * SalesPerson.id. Returns null when the name does not match any
   * Ops sales-team entry (the import then sets MOU.salesPersonId
   * to null and preserves the original name in the auditLog notes).
   * Default implementation: case-insensitive name match against
   * opsSalesTeam.
   */
  salesPersonResolver: (rawSalesRep: string | null | undefined) => string | null
}

/**
 * Builds a name-matching resolver that case-insensitively looks up
 * an upstream salesRep name against an Ops sales team. Tries full
 * name match first, then first-name match for "Firstname X."-style
 * Ops records (e.g., upstream "Vikram" matches Ops "Vikram T.").
 */
export function buildSalesPersonResolver(
  salesTeam: SalesPerson[],
): (rawSalesRep: string | null | undefined) => string | null {
  return (rawSalesRep: string | null | undefined): string | null => {
    if (typeof rawSalesRep !== 'string') return null
    const needle = rawSalesRep.trim().toLowerCase()
    if (needle === '') return null
    for (const sp of salesTeam) {
      if (sp.name.trim().toLowerCase() === needle) return sp.id
      const firstName = sp.name.trim().split(/\s+/)[0]?.toLowerCase()
      if (firstName && firstName === needle) return sp.id
    }
    return null
  }
}

const defaultSalesTeam = salesTeamJson as unknown as SalesPerson[]

const defaultDeps: ImporterDeps = {
  fetchMouMous,
  fetchMouSchools,
  opsSchools: schoolsJson as unknown as School[],
  opsMous: mousJson as unknown as MOU[],
  opsSalesTeam: defaultSalesTeam,
  enqueue: enqueueUpdate,
  now: () => new Date(),
  legacyIncludeFlag: false,
  minAcademicYear: '2026-27',
  legacyValidationRelaxed: false,
  salesPersonResolver: buildSalesPersonResolver(defaultSalesTeam),
}

export interface ImportOnceResult {
  written: MOU[]
  quarantined: MouImportReviewItem[]
  filtered: number
  autoLinkedSchoolIds: string[]
  errors: ImporterError[]
}

export async function importOnce(
  overrides: Partial<ImporterDeps> = {},
): Promise<ImportOnceResult> {
  const deps: ImporterDeps = { ...defaultDeps, ...overrides }
  const result: ImportOnceResult = {
    written: [],
    quarantined: [],
    filtered: 0,
    autoLinkedSchoolIds: [],
    errors: [],
  }

  let raws: RawMou[]
  let rawSchools: RawMouSchool[]
  try {
    [raws, rawSchools] = await Promise.all([
      deps.fetchMouMous(),
      deps.fetchMouSchools(),
    ])
  } catch (err) {
    result.errors.push(new ImporterError('MOU Contents API fetch failed', err))
    return result
  }

  const sourceSchoolById = new Map<string, RawMouSchool>(
    rawSchools.map((s) => [s.id, s]),
  )
  const existingMouIds = new Set(deps.opsMous.map((m) => m.id))

  for (const raw of raws) {
    if (existingMouIds.has(raw.id)) continue

    const ts = deps.now().toISOString()
    const auditLog: AuditEntry[] = []

    // Step 1: legacy filter
    const isLegacy =
      typeof raw.academicYear !== 'string' ||
      raw.academicYear < deps.minAcademicYear
    if (isLegacy && !deps.legacyIncludeFlag) {
      result.filtered += 1
      continue
    }

    // Step 2: normalise (GSLT-Cretile rewrite). Pure transform.
    let working: RawMou = { ...raw }
    if (working.programme === 'GSLT-Cretile') {
      const before = {
        programme: 'GSLT-Cretile',
        programmeSubType: working.programmeSubType ?? null,
      }
      working = {
        ...working,
        programme: 'STEAM',
        programmeSubType: 'GSLT-Cretile',
      }
      const after = {
        programme: 'STEAM',
        programmeSubType: 'GSLT-Cretile',
      }
      auditLog.push({
        timestamp: ts,
        user: 'system',
        action: 'gslt-cretile-normalisation',
        before,
        after,
        notes:
          'Imported as STEAM with GSLT-Cretile sub-type per Update 1',
      })
    }

    if (isLegacy && deps.legacyIncludeFlag) {
      auditLog.push({
        timestamp: ts,
        user: 'system',
        action: 'legacy-include-import',
        notes: `Imported via legacy-include config flag (academicYear: ${raw.academicYear})`,
      })
    }

    // Step 3: validators (legacy-relaxed mode demotes zero-value
    // studentsMou + contractValue to passable; still rejects negatives
    // and tax / date inversions)
    const failure = validate(working, { legacyRelaxed: deps.legacyValidationRelaxed })
    if (failure) {
      result.quarantined.push({
        queuedAt: ts,
        rawRecord: raw,
        validationFailed: failure.category,
        quarantineReason: failure.message,
        candidates: null,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        rejectionReason: null,
        rejectionNotes: null,
      })
      continue
    }

    // Step 4: school identity resolution
    const sourceSchool = working.schoolId
      ? sourceSchoolById.get(String(working.schoolId))
      : undefined
    const city = working.city ?? sourceSchool?.city ?? ''
    const state = working.state ?? sourceSchool?.state ?? ''
    const matched = findCandidates(
      { schoolName: working.schoolName, city, state },
      deps.opsSchools,
    )

    if (matched.matches.length === 0) {
      result.quarantined.push({
        queuedAt: ts,
        rawRecord: raw,
        validationFailed: null,
        quarantineReason: `No matching school in Ops directory for normalised key "${matched.matchKey}"`,
        candidates: [],
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        rejectionReason: null,
        rejectionNotes: null,
      })
      continue
    }
    if (matched.matches.length > 1) {
      result.quarantined.push({
        queuedAt: ts,
        rawRecord: raw,
        validationFailed: null,
        quarantineReason: `Multiple candidate schools (${matched.matches.length}) require human disambiguation`,
        candidates: matched.matches,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        rejectionReason: null,
        rejectionNotes: null,
      })
      continue
    }

    const matchedSchool = matched.matches[0]!

    // Step 5: chain-MOU heuristic (post-match)
    if (isLikelyChainMou(working)) {
      result.quarantined.push({
        queuedAt: ts,
        rawRecord: raw,
        validationFailed: null,
        quarantineReason:
          'Likely GROUP-scope chain MOU; SINGLE-vs-GROUP classification needed',
        candidates: [matchedSchool],
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        rejectionReason: null,
        rejectionNotes: null,
      })
      continue
    }

    // Step 6: salesRep -> salesPersonId resolution (Week 3 adapter)
    // Upstream gsl-mou-system records carry a free-text salesRep
    // name; Ops's MOU schema uses a salesPersonId FK. Resolve via the
    // injected resolver. Outcomes:
    //   - resolver returns a non-null id: use it; no audit entry needed
    //     (the link is canonical, no surprises)
    //   - working.salesRep is set but resolver returns null: no Ops
    //     SalesPerson matches; preserve the upstream name in the
    //     auditLog notes so it isn't lost
    //   - working.salesRep is unset / empty: pass through whatever
    //     working.salesPersonId was (typically null for upstream)
    const resolvedSalesPersonId = deps.salesPersonResolver(working.salesRep)
    if (resolvedSalesPersonId !== null) {
      working = { ...working, salesPersonId: resolvedSalesPersonId }
    } else if (typeof working.salesRep === 'string' && working.salesRep.trim() !== '') {
      auditLog.push({
        timestamp: ts,
        user: 'system',
        action: 'manual-relink',
        notes: `Upstream salesRep "${working.salesRep.trim()}" did not match any Ops sales-team entry; salesPersonId left null. Manual reassignment required.`,
      })
    }

    // Step 7: auto-link write
    auditLog.push({
      timestamp: ts,
      user: 'system',
      action: 'auto-link-exact-match',
      notes: `Auto-linked to school ${matchedSchool.schoolId} via match key "${matched.matchKey}"`,
    })

    const newMou = buildOpsMou(working, matchedSchool.schoolId, auditLog)
    result.written.push(newMou)
    result.autoLinkedSchoolIds.push(matchedSchool.schoolId)

    try {
      await deps.enqueue({
        queuedBy: 'system',
        entity: 'mou',
        operation: 'create',
        payload: newMou as unknown as Record<string, unknown>,
      })
    } catch (err) {
      result.errors.push(
        new ImporterError(`Queue write failed for MOU ${newMou.id}`, err),
      )
    }
  }

  return result
}

function isLikelyChainMou(record: RawMou): boolean {
  if (typeof record.schoolName === 'string' && CHAIN_NAME_PATTERN.test(record.schoolName)) {
    return true
  }
  if (typeof record.studentsMou === 'number' && record.studentsMou > SINGLE_SCHOOL_STUDENT_CEILING) {
    return true
  }
  return false
}

function buildOpsMou(
  raw: RawMou,
  schoolId: string,
  auditLog: AuditEntry[],
): MOU {
  return {
    id: raw.id,
    schoolId,
    schoolName: raw.schoolName,
    programme: raw.programme as Programme,
    programmeSubType: raw.programmeSubType ?? null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: (raw.status as MOU['status']) ?? 'Active',
    academicYear: raw.academicYear,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    studentsMou: raw.studentsMou,
    studentsActual: raw.studentsActual ?? null,
    studentsVariance: raw.studentsVariance ?? null,
    studentsVariancePct: raw.studentsVariancePct ?? null,
    spWithoutTax: raw.spWithoutTax,
    spWithTax: raw.spWithTax,
    contractValue: raw.contractValue,
    received: raw.received ?? 0,
    tds: raw.tds ?? 0,
    balance: raw.balance ?? raw.contractValue,
    receivedPct: raw.receivedPct ?? 0,
    paymentSchedule: raw.paymentSchedule ?? '',
    trainerModel: (raw.trainerModel as MOU['trainerModel']) ?? null,
    salesPersonId: raw.salesPersonId ?? null,
    templateVersion: raw.templateVersion ?? null,
    generatedAt: raw.generatedAt ?? null,
    notes: raw.notes ?? null,
    daysToExpiry: raw.daysToExpiry ?? null,
    auditLog,
  }
}

export type { SchoolMatchCandidate } from './schoolMatcher'
