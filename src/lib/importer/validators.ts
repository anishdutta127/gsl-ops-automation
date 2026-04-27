/*
 * Pure validators for incoming MOU records (Q-A spec lines 80-92).
 *
 * Each validator inspects a structural invariant and returns either
 * `null` (passes) or a `ValidatorFailure` { category, message }
 * describing the first failure encountered. Validators run in the
 * order listed; the first failure short-circuits.
 *
 * Validators do NOT transform. The fromMou pipeline runs the
 * normalise step (currently the GSLT-Cretile rewrite) BEFORE this
 * function so validator 5 sees the post-normalised programme value.
 *
 * Thresholds (20000 students, Rs 10 crore contract, 200-char school
 * name) are config constants here, not magic numbers in the body,
 * so future tuning is a one-line edit. Values picked per Q-A spec
 * line 92 with headroom over the current observed max
 * (Narayana 7950 students, Rs 7 cr largest contract).
 */

import type { MouImportValidationCategory } from '@/lib/types'

const VALID_PROGRAMMES: ReadonlySet<string> = new Set<string>([
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'TinkRworks',
  'VEX',
])

export const STUDENTS_MAX = 20000
export const CONTRACT_VALUE_MAX = 100_000_000
export const SCHOOLNAME_MAX = 200
export const MOU_ID_PATTERN = /^MOU-[A-Z]+-\d{4}-\d{3}$/

export interface ValidatorFailure {
  category: MouImportValidationCategory
  message: string
}

export interface ValidatableRecord {
  id?: unknown
  schoolName?: unknown
  programme?: unknown
  studentsMou?: unknown
  spWithoutTax?: unknown
  spWithTax?: unknown
  contractValue?: unknown
  startDate?: unknown
  endDate?: unknown
}

export interface ValidateOptions {
  /**
   * When true, demotes the studentsMou-zero and contractValue-zero
   * checks to passable: a zero is treated as a placeholder rather
   * than a rejection. Used for the Week 3 legacy backfill where
   * upstream MOU records carry zeros for in-progress / unfilled
   * fields. Negative values still reject in both modes (data
   * corruption signal). Tax + date inversions stay strict; those
   * are structural integrity checks not data-completeness checks.
   */
  legacyRelaxed?: boolean
}

export function validate(
  record: ValidatableRecord,
  options: ValidateOptions = {},
): ValidatorFailure | null {
  const relaxed = options.legacyRelaxed === true

  // 1. Tax inversion: spWithTax >= spWithoutTax
  const swt = record.spWithTax
  const swot = record.spWithoutTax
  if (typeof swt !== 'number' || typeof swot !== 'number') {
    return {
      category: 'tax_inversion',
      message: 'spWithTax / spWithoutTax must both be numbers',
    }
  }
  if (swt < swot) {
    return {
      category: 'tax_inversion',
      message: `spWithTax (${swt}) is less than spWithoutTax (${swot})`,
    }
  }

  // 2. Student count: 0 < studentsMou <= 20000 (relaxed: 0 allowed)
  const sm = record.studentsMou
  if (typeof sm !== 'number') {
    return {
      category: 'student_count_implausible',
      message: `studentsMou must be a number; got ${String(sm)}`,
    }
  }
  const studentsLowerOk = relaxed ? sm >= 0 : sm > 0
  if (!studentsLowerOk || sm > STUDENTS_MAX) {
    return {
      category: 'student_count_implausible',
      message: relaxed
        ? `studentsMou must be in [0, ${STUDENTS_MAX}]; got ${String(sm)}`
        : `studentsMou must be in (0, ${STUDENTS_MAX}]; got ${String(sm)}`,
    }
  }

  // 3. Contract value: 0 < contractValue < 10 cr (relaxed: 0 allowed)
  const cv = record.contractValue
  if (typeof cv !== 'number') {
    return {
      category: 'contract_value_implausible',
      message: `contractValue must be a number; got ${String(cv)}`,
    }
  }
  const contractLowerOk = relaxed ? cv >= 0 : cv > 0
  if (!contractLowerOk || cv >= CONTRACT_VALUE_MAX) {
    return {
      category: 'contract_value_implausible',
      message: relaxed
        ? `contractValue must be in [0, ${CONTRACT_VALUE_MAX}); got ${String(cv)}`
        : `contractValue must be in (0, ${CONTRACT_VALUE_MAX}); got ${String(cv)}`,
    }
  }

  // 4. Date inversion: endDate > startDate (or both null/absent)
  const sd = record.startDate
  const ed = record.endDate
  if (sd != null || ed != null) {
    if (typeof sd !== 'string' || typeof ed !== 'string') {
      return {
        category: 'date_inversion',
        message: 'startDate / endDate must both be ISO strings if either is present',
      }
    }
    if (new Date(ed).getTime() <= new Date(sd).getTime()) {
      return {
        category: 'date_inversion',
        message: `endDate (${ed}) is not after startDate (${sd})`,
      }
    }
  }

  // 5. Programme is in the canonical enum (post-normalise)
  const prog = record.programme
  if (typeof prog !== 'string' || !VALID_PROGRAMMES.has(prog)) {
    return {
      category: 'unknown_programme',
      message: `programme not in canonical enum: "${String(prog)}"`,
    }
  }

  // 6. School name: non-empty, under 200 chars
  const sn = record.schoolName
  if (typeof sn !== 'string' || sn.trim() === '' || sn.length >= SCHOOLNAME_MAX) {
    const len = typeof sn === 'string' ? sn.length : 'n/a'
    return {
      category: 'schoolname_implausible',
      message: `schoolName empty or too long (length: ${String(len)})`,
    }
  }

  // 7. MOU id format
  const id = record.id
  if (typeof id !== 'string' || !MOU_ID_PATTERN.test(id)) {
    return {
      category: 'id_format',
      message: `mou.id format mismatch: "${String(id)}"`,
    }
  }

  return null
}
