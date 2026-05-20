/*
 * Phase 6C FY 2025-26 importer (Pratik spreadsheet).
 *
 * Pure plan-then-apply lib. Reads the static JSON at
 * src/data/imports/fy-2025-26-import.json (pre-processed from
 * source-pratik-fy-2025-26.xlsx) and computes:
 *   - schools to create / skip (name-match against current schools.json)
 *   - MOUs to create / skip (school + academicYear='2025-26')
 *   - instalments to create (per new MOU)
 *   - payments to create (per Paid instalment)
 *   - conflicts: school name match with diverging city/state
 *   - orphan-payment warnings: import schools whose payments.json carries
 *     records pointing at a MOU id that no longer exists in mous.json
 *     (left over from Phase 5A.8 import; surface but do not auto-fix)
 *
 * Discipline:
 *   - Pure: no enqueue, no IO. Plan is data-only; applyImportPlan in the
 *     sibling lib does the writes.
 *   - Deterministic: same input -> same plan output. The MOU sequence
 *     allocator is order-stable.
 *   - TDS: Pratik's data carries a per-record tds total but no
 *     per-instalment split. The plan surfaces totalTds for reporting;
 *     we do not invent a split.
 */

import type { AuditEntry, MOU, Payment, School } from '@/lib/types'
import type { Programme } from '@/lib/mouSystem/types'

export interface ImportRecord {
  srNo: number
  schoolName: string
  salesRep: string | null
  schoolCount: number
  mouStatusText: string
  kitsSent: string
  duration: string
  city: string
  state: string
  studentsMou: number
  studentsActual: number
  spPerStudentWithoutTax: number
  spPerStudentWithTax: number
  salesAmountWithTax: number
  amountReceived: number
  tdsAmount: number
  balanceOutstanding: number
  amtRecdIn2627: number | null
  tds2627: number | null
  pctReceivedOverall: number
  instalments: ImportInstalment[]
  ownerName: string | null
  piNotRaisedPaymentReceived: number
  piRaisedPaymentReceived: number
  piRaisedPaymentNotReceived: number
  piNotRaisedPaymentNotReceived: number
}

export interface ImportInstalment {
  instalmentNo: number
  pctShare: number
  amount: number
  month: string | null
  paymentReceived: string | null
}

export interface ImportFile {
  source: string
  sheet: string
  exportedAt: string
  totalRecords: number
  currency: string
  fiscalYear: string
  notes: string
  records: ImportRecord[]
}

export type SchoolPlan =
  | {
      kind: 'create'
      record: ImportRecord
      school: School
    }
  | {
      kind: 'skip-existing'
      record: ImportRecord
      existingSchoolId: string
    }
  | {
      kind: 'conflict-city-state'
      record: ImportRecord
      existingSchoolId: string
      existingCity: string
      existingState: string
      importCity: string
      importState: string
    }

export type MouPlan =
  | {
      kind: 'create'
      record: ImportRecord
      schoolId: string
      mou: MOU
      instalments: Payment[]
    }
  | {
      kind: 'skip-existing'
      record: ImportRecord
      schoolId: string
      existingMouId: string
    }
  | {
      kind: 'orphan-payments-detected'
      record: ImportRecord
      schoolId: string
      orphanMouIds: string[]
    }

export interface ImportPlan {
  schools: SchoolPlan[]
  mous: MouPlan[]
  unmatchedNameAnomalies: ImportRecord[]
  tdsSummary: {
    totalRecordsWithTds: number
    totalTdsRs: number
  }
  contractValueVsInstalmentSumMismatches: Array<{
    record: ImportRecord
    contractRs: number
    instalmentSumRs: number
    deltaRs: number
  }>
  totals: {
    schoolsToCreate: number
    schoolsSkipped: number
    schoolsConflict: number
    mousToCreate: number
    mousSkipped: number
    mousOrphanWarnings: number
    instalmentsToCreate: number
    paymentsToCreate: number
  }
}

export interface BuildImportPlanArgs {
  records: ImportRecord[]
  existingSchools: School[]
  existingMous: MOU[]
  existingPayments: Payment[]
  /** Programme routing from config/company.json. STEAM is Pratik's default. */
  programme: Programme
  /** Fixed clock for tests. */
  now: () => Date
  /** Stable allocator counter offset, used to derive MOU ids deterministically. */
  createdBy: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeSchoolName(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parseInstalmentMonth(value: string | null): {
  iso: string | null
  raw: string | null
} {
  if (!value) return { iso: null, raw: null }
  const raw = String(value).trim()
  if (raw === '') return { iso: null, raw: null }
  const shortMonth = raw.match(/^([A-Za-z]{3})-(\d{2})$/)
  if (!shortMonth || !shortMonth[1] || !shortMonth[2]) return { iso: null, raw }
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const mKey = shortMonth[1].toLowerCase()
  const mNum = months[mKey]
  if (!mNum) return { iso: null, raw }
  const yearShort = Number(shortMonth[2])
  if (!Number.isFinite(yearShort)) return { iso: null, raw }
  const year = 2000 + yearShort
  return { iso: `${year}-${mNum}-01`, raw }
}

function isYesLike(v: string | null): boolean {
  if (v === null || v === undefined) return false
  return /^(y|yes|true)$/i.test(String(v).trim())
}

/**
 * Derive a school id from a name. ALL-CAPS, underscores for whitespace
 * and punctuation, truncated to 20 chars after the SCH- prefix. Collisions
 * are resolved by appending _2, _3, etc.
 *
 * Matches the existing seeded fixtures (SCH-LAXMIPAT_SINGHANIA_A,
 * SCH-MUTAHHARY_PUBLIC_SCH, SCH-BLUE_ANGELS_GLOBAL_S).
 */
export function deriveSchoolId(name: string, existingIds: Set<string>): string {
  const slug = (name || 'UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  const base = `SCH-${slug}`
  if (!existingIds.has(base)) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}_${i}`
    if (!existingIds.has(candidate)) return candidate
  }
  // Fallback: timestamp suffix.
  return `${base}_${Date.now()}`
}

/**
 * Region resolver from city/state. The schools.json region taxonomy is
 * the SPOC-DB 3-value enum: East, North, South-West. Bengal / Bihar /
 * Odisha / NE -> East; UP / MP / Delhi / Punjab / Rajasthan / J&K /
 * Uttarakhand -> North; everything else -> South-West.
 *
 * This is a lossy default; the import row's state value drives the
 * decision. Pranav can correct individual schools later via the edit
 * surface.
 */
export function regionForState(state: string): string {
  const s = (state || '').trim().toLowerCase()
  const east = ['west bengal', 'bihar', 'jharkhand', 'odisha', 'assam', 'tripura', 'manipur', 'nagaland', 'mizoram', 'meghalaya', 'arunachal pradesh', 'sikkim']
  const north = ['uttar pradesh', 'madhya pradesh', 'delhi', 'punjab', 'haryana', 'rajasthan', 'jammu and kashmir', 'jammu & kashmir', 'uttarakhand', 'himachal pradesh', 'chandigarh', 'ladakh', 'union territory of ladakh']
  if (east.includes(s)) return 'East'
  if (north.includes(s)) return 'North'
  return 'South-West'
}

function nextMouSeq(
  existingMous: MOU[],
  programmePrefix: string,
  fyPart: string,
  alreadyPlanned: number,
): number {
  let highest = 0
  const prefix = `MOU-${programmePrefix}-${fyPart}-`
  for (const m of existingMous) {
    if (!m.id.startsWith(prefix)) continue
    const tail = m.id.slice(prefix.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return highest + 1 + alreadyPlanned
}

function programmePrefix(programme: Programme): string {
  if (programme === 'STEAM') return 'STEAM'
  if (programme === 'Young Pioneers') return 'YP'
  if (programme === 'Harvard HBPE') return 'HBPE'
  if (programme === 'Robotics') return 'ROB'
  return 'STEAM'
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export function buildImportPlan(args: BuildImportPlanArgs): ImportPlan {
  const {
    records,
    existingSchools,
    existingMous,
    existingPayments,
    programme,
    now,
    createdBy,
  } = args

  const ts = now().toISOString()
  const fyPart = '2526'
  const academicYear = '2025-26'
  const progPrefix = programmePrefix(programme)

  // Build lookups.
  const schoolsByName = new Map<string, School>()
  for (const s of existingSchools) {
    schoolsByName.set(normalizeSchoolName(s.name), s)
  }
  const existingSchoolIds = new Set(existingSchools.map((s) => s.id))
  const mouKey = (schoolId: string, ay: string) => `${schoolId}::${ay}`
  const mousByKey = new Map<string, MOU>()
  for (const m of existingMous) {
    mousByKey.set(mouKey(m.schoolId, m.academicYear), m)
  }
  const mouIdSet = new Set(existingMous.map((m) => m.id))
  const orphanMouIdsByPaymentSchoolName = new Map<string, Set<string>>()
  for (const p of existingPayments) {
    if (mouIdSet.has(p.mouId)) continue
    if (!p.schoolName) continue
    const key = normalizeSchoolName(p.schoolName)
    if (!orphanMouIdsByPaymentSchoolName.has(key)) {
      orphanMouIdsByPaymentSchoolName.set(key, new Set())
    }
    orphanMouIdsByPaymentSchoolName.get(key)!.add(p.mouId)
  }

  // School pass.
  const schoolPlans: SchoolPlan[] = []
  const unmatchedNameAnomalies: ImportRecord[] = []
  const plannedSchoolIds = new Set<string>()

  for (const rec of records) {
    const norm = normalizeSchoolName(rec.schoolName)
    const existing = schoolsByName.get(norm)
    if (existing) {
      // Conflict if city/state mismatch.
      const importCity = (rec.city || '').trim()
      const importState = (rec.state || '').trim()
      const cityDiff =
        importCity !== '' &&
        existing.city.trim().toLowerCase() !== importCity.toLowerCase()
      const stateDiff =
        importState !== '' &&
        existing.state.trim().toLowerCase() !== importState.toLowerCase()
      if (cityDiff || stateDiff) {
        schoolPlans.push({
          kind: 'conflict-city-state',
          record: rec,
          existingSchoolId: existing.id,
          existingCity: existing.city,
          existingState: existing.state,
          importCity,
          importState,
        })
      } else {
        schoolPlans.push({
          kind: 'skip-existing',
          record: rec,
          existingSchoolId: existing.id,
        })
      }
      continue
    }
    // Flag anomalies (leading asterisk, suspicious chars). Still create.
    if (/^[^A-Za-z0-9]/.test((rec.schoolName || '').trim())) {
      unmatchedNameAnomalies.push(rec)
    }
    // Create new school. Compose the avoid-set into a fresh Set to
    // skirt downlevelIteration over the source Sets.
    const avoidSet = new Set<string>()
    existingSchoolIds.forEach((v) => avoidSet.add(v))
    plannedSchoolIds.forEach((v) => avoidSet.add(v))
    const id = deriveSchoolId(rec.schoolName, avoidSet)
    plannedSchoolIds.add(id)
    const audit: AuditEntry = {
      timestamp: ts,
      user: createdBy,
      action: 'create',
      after: { name: rec.schoolName, city: rec.city, state: rec.state },
      notes: 'FY 2025-26 import',
    }
    const school: School = {
      id,
      name: rec.schoolName.trim(),
      legalEntity: null,
      city: (rec.city || '').trim() || 'Unknown',
      state: (rec.state || '').trim() || 'Unknown',
      region: regionForState(rec.state),
      pinCode: null,
      contactPerson: null,
      email: null,
      phone: null,
      billingName: null,
      pan: null,
      gstNumber: null,
      notes: null,
      active: true,
      createdAt: ts,
      auditLog: [audit],
    }
    schoolPlans.push({ kind: 'create', record: rec, school })
  }

  // Resolve schoolId for each record (existing or newly planned).
  function resolveSchoolId(rec: ImportRecord): string | null {
    const norm = normalizeSchoolName(rec.schoolName)
    const existing = schoolsByName.get(norm)
    if (existing) return existing.id
    const planned = schoolPlans.find(
      (sp) => sp.kind === 'create' && sp.record === rec,
    )
    if (planned && planned.kind === 'create') return planned.school.id
    return null
  }

  // MOU pass.
  const mouPlans: MouPlan[] = []
  let mousCreatedSoFar = 0
  const contractMismatches: ImportPlan['contractValueVsInstalmentSumMismatches'] = []

  for (const rec of records) {
    const schoolId = resolveSchoolId(rec)
    if (!schoolId) continue
    const existingMou = mousByKey.get(mouKey(schoolId, academicYear))
    if (existingMou) {
      mouPlans.push({
        kind: 'skip-existing',
        record: rec,
        schoolId,
        existingMouId: existingMou.id,
      })
      continue
    }
    // Orphan payments warning: payments.json carries rows whose mouId
    // is not in mous.json but whose schoolName matches this import row.
    const norm = normalizeSchoolName(rec.schoolName)
    const orphanSet = orphanMouIdsByPaymentSchoolName.get(norm)
    if (orphanSet && orphanSet.size > 0) {
      mouPlans.push({
        kind: 'orphan-payments-detected',
        record: rec,
        schoolId,
        orphanMouIds: Array.from(orphanSet),
      })
      continue
    }
    // Create new MOU + instalments + payments.
    const seq = nextMouSeq(existingMous, progPrefix, fyPart, mousCreatedSoFar)
    mousCreatedSoFar += 1
    const mouId = `MOU-${progPrefix}-${fyPart}-${String(seq).padStart(3, '0')}`
    const totalInsts = Math.max(1, rec.instalments.length)
    const paymentSchedule = rec.instalments
      .map((i) => Math.round(i.pctShare * 100))
      .join('-')
    const audit: AuditEntry = {
      timestamp: ts,
      user: createdBy,
      action: 'create',
      after: {
        schoolId,
        academicYear,
        contractValue: rec.salesAmountWithTax,
      },
      notes: 'FY 2025-26 import',
    }
    const mou: MOU = {
      id: mouId,
      schoolId,
      schoolName: rec.schoolName.trim(),
      programme,
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: 'Active',
      cohortStatus: 'archived',
      academicYear,
      startDate: '2025-04-01',
      endDate: '2026-03-31',
      studentsMou: rec.studentsMou ?? 0,
      studentsActual: rec.studentsActual ?? null,
      studentsVariance: null,
      studentsVariancePct: null,
      spWithoutTax: rec.spPerStudentWithoutTax ?? 0,
      spWithTax: rec.spPerStudentWithTax ?? 0,
      contractValue: rec.salesAmountWithTax ?? 0,
      received: rec.amountReceived ?? 0,
      tds: rec.tdsAmount ?? 0,
      balance: rec.balanceOutstanding ?? 0,
      receivedPct: Math.round((rec.pctReceivedOverall ?? 0) * 100),
      paymentSchedule:
        paymentSchedule !== ''
          ? `${paymentSchedule} (FY 2025-26 import)`
          : 'lump-sum (FY 2025-26 import)',
      trainerModel: null,
      salesPersonId: null,
      templateVersion: null,
      generatedAt: null,
      notes: null,
      delayNotes: null,
      daysToExpiry: null,
      auditLog: [audit],
      importNotes: `Pratik FY25-26 sheet; ownerName=${rec.ownerName ?? 'unset'}; mouStatusText=${rec.mouStatusText ?? 'unset'}; salesRep=${rec.salesRep ?? 'unset'}`,
    }

    // Instalments / payments.
    const instalmentRows: Payment[] = []
    let instalmentSum = 0
    for (const inst of rec.instalments) {
      const parsed = parseInstalmentMonth(inst.month)
      const seqN = inst.instalmentNo
      const paid = isYesLike(inst.paymentReceived)
      const amount = inst.amount ?? 0
      instalmentSum += amount
      const payment: Payment = {
        id: `${mouId}-i${seqN}`,
        mouId,
        schoolName: rec.schoolName.trim(),
        programme,
        instalmentLabel: `${seqN} of ${totalInsts}`,
        instalmentSeq: seqN,
        totalInstalments: totalInsts,
        description: `${programme} - Instalment ${seqN} of ${totalInsts} (FY 2025-26 import)`,
        dueDateRaw: parsed.raw,
        dueDateIso: parsed.iso,
        expectedAmount: amount,
        receivedAmount: paid ? amount : null,
        receivedDate: paid ? parsed.iso : null,
        paymentMode: paid ? 'Bank Transfer' : null,
        bankReference: null,
        piNumber: null,
        taxInvoiceNumber: null,
        status: paid ? 'Received' : 'Pending',
        notes: null,
        piSentDate: null,
        piSentTo: null,
        piGeneratedAt: null,
        studentCountActual: rec.studentsActual ?? null,
        partialPayments: null,
        bankAmount: paid ? amount : null,
        tdsAmount: null,
        auditLog: [
          {
            timestamp: ts,
            user: createdBy,
            action: 'create',
            notes: `FY 2025-26 import; paymentReceived=${inst.paymentReceived ?? 'no'}`,
          },
        ],
      }
      instalmentRows.push(payment)
    }
    // Contract value sanity: sum of instalments should equal contract.
    const delta = Math.round((rec.salesAmountWithTax - instalmentSum) * 100) / 100
    if (Math.abs(delta) > 1) {
      contractMismatches.push({
        record: rec,
        contractRs: rec.salesAmountWithTax,
        instalmentSumRs: instalmentSum,
        deltaRs: delta,
      })
    }
    mouPlans.push({
      kind: 'create',
      record: rec,
      schoolId,
      mou,
      instalments: instalmentRows,
    })
  }

  // TDS summary.
  const tdsRecords = records.filter((r) => (r.tdsAmount ?? 0) > 0)
  const totalTds = tdsRecords.reduce((s, r) => s + (r.tdsAmount ?? 0), 0)

  // Totals.
  const schoolsToCreate = schoolPlans.filter((p) => p.kind === 'create').length
  const schoolsSkipped = schoolPlans.filter((p) => p.kind === 'skip-existing').length
  const schoolsConflict = schoolPlans.filter((p) => p.kind === 'conflict-city-state').length
  const mousCreatePlans = mouPlans.filter((p) => p.kind === 'create') as Extract<
    MouPlan,
    { kind: 'create' }
  >[]
  const mousToCreate = mousCreatePlans.length
  const mousSkipped = mouPlans.filter((p) => p.kind === 'skip-existing').length
  const mousOrphanWarnings = mouPlans.filter(
    (p) => p.kind === 'orphan-payments-detected',
  ).length
  const instalmentsToCreate = mousCreatePlans.reduce(
    (s, p) => s + p.instalments.length,
    0,
  )
  const paymentsToCreate = mousCreatePlans.reduce(
    (s, p) => s + p.instalments.filter((i) => i.receivedAmount !== null).length,
    0,
  )

  return {
    schools: schoolPlans,
    mous: mouPlans,
    unmatchedNameAnomalies,
    tdsSummary: {
      totalRecordsWithTds: tdsRecords.length,
      totalTdsRs: Math.round(totalTds * 100) / 100,
    },
    contractValueVsInstalmentSumMismatches: contractMismatches,
    totals: {
      schoolsToCreate,
      schoolsSkipped,
      schoolsConflict,
      mousToCreate,
      mousSkipped,
      mousOrphanWarnings,
      instalmentsToCreate,
      paymentsToCreate,
    },
  }
}
