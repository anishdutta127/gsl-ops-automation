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
 *   piPrefix = MTPL/MH, fy = 2627 → MTPL/MH/2627/0001
 */
export function formatPiNumber(entityKey: EntityKey, seq: number): string {
  const e = getEntity(entityKey)
  return `${e.piPrefix}${e.piPrefixSeparator}${company.fiscalYear}${e.piPrefixSeparator}${String(seq).padStart(4, '0')}`
}
