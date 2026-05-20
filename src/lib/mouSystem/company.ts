/*
 * Company config loader. Reads config/company.json : the source of
 * truth for the two MAF Technologies GSTIN registrations, programme
 * routing and PI prefix mapping (Phase 3 Step 3).
 */

import companyJson from './company.json'
import type { Programme } from './types'

export type EntityKey = 'MH' | 'UP'

export interface EntityConfig {
  label: string
  stateCode: string
  state: string
  gstin: string
  address: string
  city: string
  pin: string
  hsn: string
  piPrefix: string
  piPrefixSeparator: string
}

export interface CompanyConfig {
  name: string
  pan: string
  email: string
  /** Phase 3 Round 2: warehouse contact for VEX dispatch requests. */
  warehouseEmail: string | null
  tallyVersion: string
  fiscalYear: string
  entities: Record<EntityKey, EntityConfig>
  programmeRouting: Record<string, EntityKey>
  vexDefaultEntity: EntityKey
}

const RAW = companyJson as unknown as CompanyConfig

export const company: CompanyConfig = {
  name: RAW.name,
  pan: RAW.pan,
  email: RAW.email,
  warehouseEmail: RAW.warehouseEmail ?? null,
  tallyVersion: RAW.tallyVersion,
  fiscalYear: RAW.fiscalYear,
  entities: RAW.entities,
  programmeRouting: RAW.programmeRouting,
  vexDefaultEntity: RAW.vexDefaultEntity,
}

export function getEntity(key: EntityKey): EntityConfig {
  const e = company.entities[key]
  if (!e) throw new Error(`Unknown company entity: ${key}`)
  return e
}

export function getEntityForProgramme(programme: Programme | 'VEX' | string): EntityKey {
  return (company.programmeRouting[programme] ?? company.vexDefaultEntity) as EntityKey
}

/**
 * Format a sequence number under a given entity's prefix.
 *   piPrefix = MTPL/MH, fy = 26-27 -> MTPL/MH/26-27/0001
 *
 * Phase 6B: optional fyDisplay lets callers route PI numbers into a
 * prior fiscal year (e.g., reissuing a FY 25-26 PI on a
 * MOU.academicYear='2025-26' instalment). Defaults to the current
 * company.fiscalYear when omitted, so existing callers do not change.
 * fyDisplay must be in the dashed format ('25-26'), not the counter
 * key form ('2526').
 */
export function formatPiNumber(
  entityKey: EntityKey,
  seq: number,
  fyDisplay?: string,
): string {
  const e = getEntity(entityKey)
  const fy = fyDisplay ?? company.fiscalYear
  return `${e.piPrefix}${e.piPrefixSeparator}${fy}${e.piPrefixSeparator}${String(seq).padStart(4, '0')}`
}

/**
 * Phase 6B: derive the FY for a PI from the parent MOU's academicYear
 * (e.g., '2025-26'). Returns the two representations that
 * formatPiNumber and the counter atomic need:
 *   - display: dashed two-digit form, used in the PI number itself
 *   - counterKey: undashed form, used as the priorFiscalYears map key
 *
 * The mapping is purely textual; the function does not validate that
 * the academic year is one our system actually supports.
 */
export function fyFromAcademicYear(
  academicYear: string,
): { display: string; counterKey: string } {
  const m = academicYear.match(/^(\d{2})(\d{2})-(\d{2})$/)
  if (!m) {
    throw new Error(
      `Cannot derive PI fiscal year from academicYear='${academicYear}'. Expected '20YY-YY' shape (e.g. '2025-26').`,
    )
  }
  const display = `${m[2]}-${m[3]}`
  const counterKey = `${m[2]}${m[3]}`
  return { display, counterKey }
}

/**
 * Counter-key form of the current fiscal year ('26-27' -> '2627').
 * Used by piCounterAtomic to decide whether to write into the
 * top-level entities block (current FY) or the priorFiscalYears
 * block (any other FY).
 */
export function currentFiscalYearCounterKey(): string {
  return company.fiscalYear.replace('-', '')
}
