/*
 * Q-G Test 6: importerIntegration.
 *
 * Drives src/lib/importer/fromMou.ts importOnce() against synthetic
 * inline RawMou + RawMouSchool inputs. The deps seam injects custom
 * fetchMouMous / fetchMouSchools / opsSchools / opsMous / enqueue /
 * now / legacyIncludeFlag, so no Contents API HTTP is involved.
 *
 * Coverage covers all 10 representative shapes per the eng-review
 * spec (line 236) plus the 4 additions confirmed pre-A4:
 *   - GSLT-Cretile normalise auditLog has both `before` and `after`
 *   - ImporterError captures only system failures (validators
 *     quarantine normally)
 *   - Legacy-include path stamps a 'legacy-include-import' auditLog
 *     entry
 *   - Quarantine candidates[] is sorted alphabetically by schoolId
 *     regardless of source insertion order.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  buildSalesPersonResolver,
  importOnce,
  ImporterError,
  type ImporterDeps,
  type RawMou,
  type RawMouSchool,
} from './fromMou'
import type { MOU, PendingUpdate, SalesPerson, School } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'
const FIXED_DATE = new Date(FIXED_TS)

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-TEST',
    name: 'Test School',
    legalEntity: null,
    city: 'Pune',
    state: 'Maharashtra',
    region: 'South-West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

const greenfieldPune = school({
  id: 'SCH-GREENFIELD-PUNE',
  name: 'Greenfield Academy',
  city: 'Pune',
  state: 'Maharashtra',
})

const oakwoodDelhi = school({
  id: 'SCH-OAKWOOD-DEL',
  name: 'Oakwood Senior Secondary',
  city: 'New Delhi',
  state: 'Delhi',
  region: 'North',
})

const narayanaAsn = school({
  id: 'SCH-NARAYANA-ASN',
  name: 'Narayana Group of Schools, West Bengal',
  city: 'Asansol',
  state: 'West Bengal',
  region: 'East',
})

const mapleLeafBlr = school({
  id: 'SCH-MAPLELEAF-BLR',
  name: 'Maple Leaf Public School',
  city: 'Bengaluru',
  state: 'Karnataka',
  region: 'South-West',
})

function rawMou(overrides: Partial<RawMou> = {}): RawMou {
  return {
    id: 'MOU-STEAM-2627-101',
    schoolName: 'Greenfield Academy',
    programme: 'STEAM',
    programmeSubType: null,
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 200,
    spWithoutTax: 4237,
    spWithTax: 5000,
    contractValue: 1000000,
    city: 'Pune',
    state: 'Maharashtra',
    ...overrides,
  }
}

interface DepsOpts {
  rawMous?: RawMou[]
  rawSchools?: RawMouSchool[]
  opsSchools?: School[]
  opsMous?: MOU[]
  legacyIncludeFlag?: boolean
  minAcademicYear?: string
  enqueueFails?: boolean
  fetchFails?: boolean
}

function makeDeps(opts: DepsOpts = {}): { deps: Partial<ImporterDeps>; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    if (opts.enqueueFails) throw new Error('queue down')
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'pending-stub',
      queuedAt: FIXED_TS,
      queuedBy: String(params.queuedBy ?? 'system'),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>,
      retryCount: 0,
    }
    return stub
  })

  const deps: Partial<ImporterDeps> = {
    fetchMouMous: opts.fetchFails
      ? async () => { throw new Error('contents api 503') }
      : async () => opts.rawMous ?? [],
    fetchMouSchools: async () => opts.rawSchools ?? [],
    opsSchools: opts.opsSchools ?? [greenfieldPune, oakwoodDelhi, narayanaAsn, mapleLeafBlr],
    opsMous: opts.opsMous ?? [],
    enqueue: enqueue as unknown as ImporterDeps['enqueue'],
    now: () => FIXED_DATE,
    legacyIncludeFlag: opts.legacyIncludeFlag ?? false,
    minAcademicYear: opts.minAcademicYear ?? '2026-27',
  }
  return { deps, calls }
}

describe('Q-G Test 6: importOnce', () => {
  describe('shape 1: single-school auto-link', () => {
    it('writes MOU with schoolId set + auditLog action=auto-link-exact-match', async () => {
      const { deps, calls } = makeDeps({ rawMous: [rawMou()] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(1)
      expect(result.quarantined).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
      expect(result.written[0]?.schoolId).toBe('SCH-GREENFIELD-PUNE')
      expect(result.autoLinkedSchoolIds).toEqual(['SCH-GREENFIELD-PUNE'])
      const link = result.written[0]?.auditLog.find(e => e.action === 'auto-link-exact-match')
      expect(link).toBeDefined()
      expect(link?.notes).toContain('SCH-GREENFIELD-PUNE')
      // Queue write happened
      expect(calls).toHaveLength(1)
      expect(calls[0]?.entity).toBe('mou')
      expect(calls[0]?.operation).toBe('create')
    })
  })

  describe('shape 2: chain MOU', () => {
    it('quarantines with GROUP-classification reason (name-based)', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-102',
        schoolName: 'Narayana Group of Schools, West Bengal',
        city: 'Asansol',
        state: 'West Bengal',
        studentsMou: 1500,
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(0)
      expect(result.quarantined).toHaveLength(1)
      expect(result.quarantined[0]?.quarantineReason).toMatch(/GROUP/)
      expect(result.quarantined[0]?.candidates).toHaveLength(1)
      expect(result.quarantined[0]?.candidates?.[0]?.schoolId).toBe('SCH-NARAYANA-ASN')
    })

    it('quarantines on student count > 1500 (count-based heuristic)', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-103',
        schoolName: 'Greenfield Academy',
        studentsMou: 5000,
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.quarantineReason).toMatch(/GROUP/)
    })
  })

  describe('shape 3: name+location exact match (auto-link)', () => {
    it('matches case-insensitive + punctuation-tolerant', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-104',
        schoolName: '  GREENFIELD  ACADEMY  ',
        city: 'pune',
        state: 'Maharashtra',
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written[0]?.schoolId).toBe('SCH-GREENFIELD-PUNE')
    })

    it('matches via city alias (Bangalore <-> Bengaluru)', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-105',
        schoolName: 'Maple Leaf Public School',
        city: 'Bangalore',
        state: 'Karnataka',
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written[0]?.schoolId).toBe('SCH-MAPLELEAF-BLR')
    })
  })

  describe('shape 4: near-duplicate quarantine + deterministic candidate ordering', () => {
    it('multiple candidates sorted alphabetically by schoolId regardless of source order', async () => {
      const a = school({ id: 'SCH-GREENFIELD-Z', name: 'Greenfield Academy', city: 'Pune', state: 'Maharashtra' })
      const b = school({ id: 'SCH-GREENFIELD-A', name: 'Greenfield Academy', city: 'Pune', state: 'Maharashtra' })
      const c = school({ id: 'SCH-GREENFIELD-M', name: 'Greenfield Academy', city: 'Pune', state: 'Maharashtra' })
      const { deps } = makeDeps({
        rawMous: [rawMou({ id: 'MOU-STEAM-2627-106' })],
        opsSchools: [a, b, c],
      })
      const result = await importOnce(deps)
      expect(result.quarantined).toHaveLength(1)
      const cands = result.quarantined[0]?.candidates ?? []
      expect(cands.map(c => c.schoolId)).toEqual(['SCH-GREENFIELD-A', 'SCH-GREENFIELD-M', 'SCH-GREENFIELD-Z'])
      expect(result.quarantined[0]?.quarantineReason).toMatch(/disambiguation/)
    })

    it('zero matches quarantines with "no matching school" reason', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-107',
        schoolName: 'Nonexistent Hill School',
        city: 'Nowhere',
        state: 'Madhya Pradesh',
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.quarantineReason).toMatch(/No matching school/)
      expect(result.quarantined[0]?.candidates).toEqual([])
    })
  })

  describe('shape 5: tax-inversion (validator 1)', () => {
    it('quarantines with tax_inversion category', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-108', spWithoutTax: 5000, spWithTax: 4000 })
      const { deps, calls } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(0)
      expect(result.quarantined[0]?.validationFailed).toBe('tax_inversion')
      expect(calls).toHaveLength(0)
    })
  })

  describe('shape 6: date-inversion (validator 4)', () => {
    it('quarantines with date_inversion category', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-109',
        startDate: '2027-03-31',
        endDate: '2026-04-01',
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.validationFailed).toBe('date_inversion')
    })
  })

  describe('shape 7: unknown programme (validator 5, post-normalise)', () => {
    it('quarantines with unknown_programme category', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-110', programme: 'ZebraSTEM' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.validationFailed).toBe('unknown_programme')
    })
  })

  describe('shape 8: missing required field (validator 6)', () => {
    it('quarantines empty schoolName with schoolname_implausible', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-111', schoolName: '' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.validationFailed).toBe('schoolname_implausible')
    })
  })

  describe('shape 9: GSLT-Cretile normalisation (Update 1)', () => {
    it('rewrites programme + sub-type AND captures before/after in audit log', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-112', programme: 'GSLT-Cretile' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)

      expect(result.written).toHaveLength(1)
      expect(result.written[0]?.programme).toBe('STEAM')
      expect(result.written[0]?.programmeSubType).toBe('GSLT-Cretile')

      const norm = result.written[0]?.auditLog.find(
        e => e.action === 'gslt-cretile-normalisation',
      )
      expect(norm).toBeDefined()
      // Both before AND after must be present per addition #1
      expect(norm?.before).toEqual({
        programme: 'GSLT-Cretile',
        programmeSubType: null,
      })
      expect(norm?.after).toEqual({
        programme: 'STEAM',
        programmeSubType: 'GSLT-Cretile',
      })
      expect(norm?.notes).toContain('Update 1')
    })

    it('plain STEAM records do NOT receive the normalisation audit entry', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-113', programme: 'STEAM' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      const norm = result.written[0]?.auditLog.find(
        e => e.action === 'gslt-cretile-normalisation',
      )
      expect(norm).toBeUndefined()
    })
  })

  describe('shape 10: legacy academicYear filter', () => {
    it('drops legacy records silently when legacyIncludeFlag is false (default)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2526-099', academicYear: '2025-26' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(0)
      expect(result.quarantined).toHaveLength(0)
      expect(result.filtered).toBe(1)
    })

    it('imports legacy records when legacyIncludeFlag is true AND stamps legacy-include-import audit entry', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2526-100', academicYear: '2025-26' })
      const { deps } = makeDeps({ rawMous: [raw], legacyIncludeFlag: true })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(1)
      expect(result.filtered).toBe(0)
      const legacyEntry = result.written[0]?.auditLog.find(
        e => e.action === 'legacy-include-import',
      )
      expect(legacyEntry).toBeDefined()
      expect(legacyEntry?.notes).toContain('2025-26')
    })

    it('current-cohort records do NOT receive the legacy-include audit entry even with flag on', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-114', academicYear: '2026-27' })
      const { deps } = makeDeps({ rawMous: [raw], legacyIncludeFlag: true })
      const result = await importOnce(deps)
      const legacyEntry = result.written[0]?.auditLog.find(
        e => e.action === 'legacy-include-import',
      )
      expect(legacyEntry).toBeUndefined()
    })
  })

  describe('extra: validator 2 (student count)', () => {
    it('quarantines studentsMou > 20000 with student_count_implausible', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-115', studentsMou: 25000 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      // Note: 25000 also triggers chain heuristic, but validator runs first
      expect(result.quarantined[0]?.validationFailed).toBe('student_count_implausible')
    })
  })

  describe('extra: validator 7 (id format)', () => {
    it('quarantines malformed mou.id with id_format', async () => {
      const raw = rawMou({ id: 'NOT-A-VALID-ID' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.quarantined[0]?.validationFailed).toBe('id_format')
    })
  })

  describe('dedup', () => {
    it('skips records already present in opsMous (no double-import on subsequent ticks)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-116' })
      const existing: MOU = {
        id: 'MOU-STEAM-2627-116',
        schoolId: 'SCH-GREENFIELD-PUNE',
        schoolName: 'Greenfield Academy',
        programme: 'STEAM',
        programmeSubType: null,
        schoolScope: 'SINGLE',
        schoolGroupId: null,
        status: 'Active',
        academicYear: '2026-27',
        startDate: null,
        endDate: null,
        studentsMou: 200,
        studentsActual: null,
        studentsVariance: null,
        studentsVariancePct: null,
        spWithoutTax: 4237,
        spWithTax: 5000,
        contractValue: 1000000,
        received: 0,
        tds: 0,
        balance: 1000000,
        receivedPct: 0,
        paymentSchedule: '',
        trainerModel: null,
        salesPersonId: null,
        templateVersion: null,
        generatedAt: null,
        notes: null,
        daysToExpiry: null,
        auditLog: [],
      }
      const { deps } = makeDeps({ rawMous: [raw], opsMous: [existing] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(0)
      expect(result.quarantined).toHaveLength(0)
      expect(result.filtered).toBe(0)
    })
  })

  describe('ImporterError reserved for SYSTEM errors only', () => {
    it('Contents API failure populates errors and returns empty result', async () => {
      const { deps } = makeDeps({ fetchFails: true })
      const result = await importOnce(deps)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toBeInstanceOf(ImporterError)
      expect(result.errors[0]?.message).toContain('Contents API')
      expect(result.written).toHaveLength(0)
      expect(result.quarantined).toHaveLength(0)
    })

    it('queue write failure surfaces as ImporterError but other records still import', async () => {
      const { deps } = makeDeps({
        rawMous: [rawMou({ id: 'MOU-STEAM-2627-117' })],
        enqueueFails: true,
      })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(1) // local record built
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toBeInstanceOf(ImporterError)
      expect(result.errors[0]?.message).toContain('Queue write failed')
    })

    it('validator failures do NOT populate errors (they quarantine normally)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-118', spWithoutTax: 5000, spWithTax: 4000 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.errors).toEqual([])
      expect(result.quarantined).toHaveLength(1)
    })
  })

  describe('happy-path summary across mixed batch', () => {
    it('processes 5 records: 2 written + 2 quarantined + 1 filtered', async () => {
      const batch: RawMou[] = [
        rawMou({ id: 'MOU-STEAM-2627-201' }), // good single-school
        rawMou({ id: 'MOU-STEAM-2627-202', programme: 'GSLT-Cretile' }), // normalised + good
        rawMou({ id: 'MOU-STEAM-2627-203', spWithoutTax: 5000, spWithTax: 4000 }), // tax inversion
        rawMou({ id: 'MOU-STEAM-2627-204', schoolName: 'Narayana Group of Schools, West Bengal', city: 'Asansol', state: 'West Bengal', studentsMou: 1500 }), // chain
        rawMou({ id: 'MOU-STEAM-2526-205', academicYear: '2025-26' }), // legacy filter
      ]
      const { deps } = makeDeps({ rawMous: batch })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(2)
      expect(result.quarantined).toHaveLength(2)
      expect(result.filtered).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(result.autoLinkedSchoolIds).toHaveLength(2)
    })
  })

  describe('Week 3: legacy-relaxed validators', () => {
    it('default (strict) mode rejects studentsMou=0', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-301', studentsMou: 0 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written).toHaveLength(0)
      expect(result.quarantined).toHaveLength(1)
      expect(result.quarantined[0]?.validationFailed).toBe('student_count_implausible')
    })

    it('legacy-relaxed mode accepts studentsMou=0 (placeholder for in-progress upstream record)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-302', studentsMou: 0 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, legacyValidationRelaxed: true })
      expect(result.written).toHaveLength(1)
      expect(result.quarantined).toHaveLength(0)
      expect(result.written[0]?.studentsMou).toBe(0)
    })

    it('legacy-relaxed mode accepts contractValue=0', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-303', contractValue: 0 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, legacyValidationRelaxed: true })
      expect(result.written).toHaveLength(1)
      expect(result.written[0]?.contractValue).toBe(0)
    })

    it('legacy-relaxed mode still rejects negative studentsMou (data corruption signal)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-304', studentsMou: -5 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, legacyValidationRelaxed: true })
      expect(result.written).toHaveLength(0)
      expect(result.quarantined[0]?.validationFailed).toBe('student_count_implausible')
    })

    it('legacy-relaxed mode still rejects tax inversions (structural integrity)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-305', spWithoutTax: 5000, spWithTax: 4000 })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, legacyValidationRelaxed: true })
      expect(result.written).toHaveLength(0)
      expect(result.quarantined[0]?.validationFailed).toBe('tax_inversion')
    })

    it('legacy-relaxed mode still rejects date inversions', async () => {
      const raw = rawMou({
        id: 'MOU-STEAM-2627-306',
        startDate: '2027-01-01',
        endDate: '2026-01-01',
      })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, legacyValidationRelaxed: true })
      expect(result.written).toHaveLength(0)
      expect(result.quarantined[0]?.validationFailed).toBe('date_inversion')
    })
  })

  describe('Week 3: salesRep -> salesPersonId resolution', () => {
    it('resolves a matching upstream salesRep name to the Ops sales-team id (full match)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-401', salesRep: 'Vikram T.' })
      const team: SalesPerson[] = [
        { id: 'sp-vikram', name: 'Vikram T.', email: 'v@t', phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
      ]
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, opsSalesTeam: team, salesPersonResolver: buildSalesPersonResolver(team) })
      expect(result.written[0]?.salesPersonId).toBe('sp-vikram')
    })

    it('resolves first-name match for "Firstname X."-style Ops records (upstream "Vikram" -> Ops "Vikram T.")', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-402', salesRep: 'Vikram' })
      const team: SalesPerson[] = [
        { id: 'sp-vikram', name: 'Vikram T.', email: 'v@t', phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
      ]
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, opsSalesTeam: team, salesPersonResolver: buildSalesPersonResolver(team) })
      expect(result.written[0]?.salesPersonId).toBe('sp-vikram')
    })

    it('case-insensitive match (upstream "sahil" -> Ops "Sahil M.")', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-403', salesRep: 'sahil' })
      const team: SalesPerson[] = [
        { id: 'sp-sahil', name: 'Sahil M.', email: 's@m', phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
      ]
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, opsSalesTeam: team, salesPersonResolver: buildSalesPersonResolver(team) })
      expect(result.written[0]?.salesPersonId).toBe('sp-sahil')
    })

    it('unmatched salesRep leaves salesPersonId=null and adds audit entry preserving the upstream name', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-404', salesRep: 'Anshuman' })
      const team: SalesPerson[] = [
        { id: 'sp-vikram', name: 'Vikram T.', email: 'v@t', phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
      ]
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce({ ...deps, opsSalesTeam: team, salesPersonResolver: buildSalesPersonResolver(team) })
      expect(result.written[0]?.salesPersonId).toBeNull()
      const relinkEntry = result.written[0]?.auditLog.find(e => e.action === 'manual-relink')
      expect(relinkEntry).toBeDefined()
      expect(relinkEntry?.notes).toContain('Anshuman')
    })

    it('absent salesRep is a no-op (no resolution attempt, no audit entry)', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-405' }) // no salesRep field
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written[0]?.salesPersonId).toBeNull()
      const relinkEntry = result.written[0]?.auditLog.find(e => e.action === 'manual-relink')
      expect(relinkEntry).toBeUndefined()
    })

    it('empty-string salesRep is treated as absent', async () => {
      const raw = rawMou({ id: 'MOU-STEAM-2627-406', salesRep: '   ' })
      const { deps } = makeDeps({ rawMous: [raw] })
      const result = await importOnce(deps)
      expect(result.written[0]?.salesPersonId).toBeNull()
      const relinkEntry = result.written[0]?.auditLog.find(e => e.action === 'manual-relink')
      expect(relinkEntry).toBeUndefined()
    })
  })
})
