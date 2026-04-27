/*
 * Upstream-school -> Ops-school adapter (Week 3).
 *
 * Used by scripts/import-week3.mjs to seed the Ops schools fixture
 * from the gsl-mou-system upstream. Pure function: given a
 * RawUpstreamSchool, returns either a structured Ops `School` plus
 * any anomalies the import surfaced, or null when the input is too
 * malformed to land (caller logs).
 *
 * Why a separate module from fromMou.ts: schools land in a single
 * one-shot import (no per-tick incremental flow); the MOU pipeline
 * is incremental + stage-aware. Mixing them blurs the contract.
 *
 * The state -> region mapping is the only non-obvious transform.
 * Upstream schools carry `state` strings of mixed quality
 * ("Karnataka" / "Karanataka" / "Tamilnadu"), no `region` field.
 * Ops's CcRule scoping uses 'East' | 'North' | 'South-West' as a
 * three-bucket regional model. The mapping below is geographic;
 * unmapped or null states land in 'East' as a deliberate default
 * with the original state captured in `notes` so the operator can
 * triage.
 */

import type { AuditEntry, School } from '@/lib/types'

export interface RawUpstreamSchool {
  id: string
  name: string
  legalEntity?: string | null
  city?: string | null
  state?: string | null
  pinCode?: string | null
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  billingName?: string | null
  pan?: string | null
  gstNumber?: string | null
  notes?: string | null
}

export type Region = 'East' | 'North' | 'South-West'

const STATE_TO_REGION: Record<string, Region> = {
  // East
  'West Bengal': 'East',
  'Bihar': 'East',
  'Jharkhand': 'East',
  'Meghalaya': 'East',
  'Nagaland': 'East',
  // North
  'Delhi': 'North',
  'Haryana': 'North',
  'Uttar Pradesh': 'North',
  'Uttarakhand': 'North',
  'Rajasthan': 'North',
  'Jammu & Kashmir': 'North',
  'Kashmir': 'North',
  'Union Territory of Ladakh': 'North',
  // South-West (covers South + West India)
  'Karnataka': 'South-West',
  'Karanataka': 'South-West',           // typo carried forward; map to canonical
  'Tamil Nadu': 'South-West',
  'Tamilnadu': 'South-West',            // typo carried forward
  'Maharashtra': 'South-West',
  'Gujarat': 'South-West',
  'Telangana': 'South-West',
  'Andhra Pradesh': 'South-West',
  'Chhatisgarh': 'South-West',          // common alt spelling of Chhattisgarh
  'Chhattisgarh': 'South-West',
}

const FALLBACK_REGION: Region = 'East'

/** Capture every state -> region decision so the import script can surface them. */
export interface SchoolImportAnomaly {
  schoolId: string
  kind: 'unmapped-state' | 'null-state' | 'incomplete-contact'
  detail: string
}

export interface SchoolImportResult {
  school: School
  anomalies: SchoolImportAnomaly[]
}

export function importSchool(
  raw: RawUpstreamSchool,
  importTimestamp: string,
): SchoolImportResult {
  const anomalies: SchoolImportAnomaly[] = []

  // State + region resolution
  const rawState = typeof raw.state === 'string' ? raw.state.trim() : ''
  let region: Region = FALLBACK_REGION
  let normalisedState = rawState
  if (rawState === '') {
    anomalies.push({
      schoolId: raw.id,
      kind: 'null-state',
      detail: `state is null; defaulted region to ${FALLBACK_REGION}`,
    })
  } else if (rawState in STATE_TO_REGION) {
    region = STATE_TO_REGION[rawState]!
  } else {
    anomalies.push({
      schoolId: raw.id,
      kind: 'unmapped-state',
      detail: `state "${rawState}" not in canonical map; defaulted region to ${FALLBACK_REGION}`,
    })
  }

  // Audit entry recording the legacy import + any data-quality flags
  const auditLog: AuditEntry[] = [{
    timestamp: importTimestamp,
    user: 'system',
    action: 'create',
    notes: `Imported from gsl-mou-system as part of Week 3 backfill.${
      anomalies.length > 0 ? ' Anomalies: ' + anomalies.map(a => a.detail).join('; ') : ''
    }`,
  }]

  // Surface contact-data gap so operators can triage GSTIN / SPOC backfill
  const missingContactFields: string[] = []
  if (!raw.email) missingContactFields.push('email')
  if (!raw.contactPerson) missingContactFields.push('contactPerson')
  if (!raw.gstNumber) missingContactFields.push('gstNumber')
  if (!raw.pinCode) missingContactFields.push('pinCode')
  if (missingContactFields.length > 0) {
    anomalies.push({
      schoolId: raw.id,
      kind: 'incomplete-contact',
      detail: `missing fields: ${missingContactFields.join(', ')}`,
    })
  }

  const school: School = {
    id: raw.id,
    name: raw.name,
    legalEntity: raw.legalEntity ?? null,
    city: typeof raw.city === 'string' ? raw.city : '',
    state: normalisedState,
    region,
    pinCode: raw.pinCode ?? null,
    contactPerson: raw.contactPerson ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    billingName: raw.billingName ?? null,
    pan: raw.pan ?? null,
    gstNumber: raw.gstNumber ?? null,
    notes: raw.notes ?? null,
    active: true,
    createdAt: importTimestamp,
    auditLog,
  }

  return { school, anomalies }
}
