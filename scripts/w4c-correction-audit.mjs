#!/usr/bin/env node

/*
 * W4-C.7: correction audit + mechanical self-correction.
 *
 * Audits the 23 W4-C.4 backfilled IntakeRecords against the form's
 * raw school name and the active-cohort MOU schoolName. Produces:
 *
 *   - scripts/w4c-correction-audit-2026-04-27.json (structured report)
 *   - scripts/w4c-correction-deferred-2026-04-27.csv (Anish review list)
 *   - data mutations: 11 self-correctable records moved to the right
 *     MOU IDs, with mou-mirrored audit entries on both old + new
 *     parent MOUs.
 *
 * Self-correction criteria (mechanical; no domain knowledge needed):
 *   1. The active 51-list contains a single MOU whose schoolName has
 *      strong distinctive-token overlap with the form's school field.
 *   2. The current mapping resolves to a MOU whose schoolName has
 *      ZERO distinctive tokens in common with the form school.
 *
 * Anything ambiguous (BIT Global -> The Learning Sanctuary edge cases
 * where the new candidate also lacks clean tokens, or the form school
 * fuzzy-resolves to multiple active MOUs) goes to the deferred CSV.
 *
 * Idempotency: re-running detects already-corrected records and skips
 * them. Audit entries on the moved records mark the correction
 * timestamp + the before -> after MOU ids.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const FORM_PATH = resolve(REPO_ROOT, 'ops-data/MOU_Signing_Details_2026-2027__Responses_.xlsx')
const MOUS_PATH = resolve(REPO_ROOT, 'src/data/mous.json')
const FIXTURES_MOUS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/mous.json')
const INTAKE_PATH = resolve(REPO_ROOT, 'src/data/intake_records.json')
const FIXTURES_INTAKE_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/intake_records.json')
const AUDIT_PATH = resolve(REPO_ROOT, 'scripts/w4c-correction-audit-2026-04-27.json')
const DEFERRED_CSV = resolve(REPO_ROOT, 'scripts/w4c-correction-deferred-2026-04-27.csv')
const TS = '2026-04-28T10:00:00.000Z'

// Mechanical mapping: form-row form-school -> correct active MOU id.
// Authored from the audit table; each row had exactly one strong active
// candidate after the W4-D recon pass surfaced the conflicts. Cases
// without a clean single-candidate go to the deferred CSV.
// Known-clean mappings (form school != active MOU schoolName, but the
// mapping is correct per W4-C recon and Anish disambiguation):
//   IR-W4C-003 K.E. Carmel,Amtala  -> -013  (punctuation diff)
//   IR-W4C-004 St. Mary's Convent  -> -007  (apostrophe-s diff)
//   IR-W4C-009 TATHASTU INOVATION  -> -016  (typo + missing city)
//   IR-W4C-012 SD Sr Sec           -> -018  (abbreviation expansion)
//   IR-W4C-021 Narayana Group W.B. -> -051  (Anish-confirmed alias)
const KNOWN_CLEAN = new Set([
  'IR-W4C-003',
  'IR-W4C-004',
  'IR-W4C-009',
  'IR-W4C-012',
  'IR-W4C-021',
])

const CORRECTIONS = {
  // 'IR-W4C-NNN' -> { from, to, reason }
  'IR-W4C-002': { to: 'MOU-STEAM-2627-039', reason: "St. Paul's Boarding maps to -039 not -002 (Jnana Bharathi)" },
  'IR-W4C-005': { to: 'MOU-STEAM-2627-004', reason: 'Techno India Kalyani -> -004 not -008 (Loreto Day BB)' },
  'IR-W4C-006': { to: 'MOU-STEAM-2627-006', reason: 'Techno India Panagarh -> -006 not -009 (Kavyapta Global)' },
  'IR-W4C-007': { to: 'MOU-STEAM-2627-005', reason: 'Techno India Asansol -> -005 not -010 (Embee Rosebud)' },
  'IR-W4C-008': { to: 'MOU-STEAM-2627-026', reason: 'BIT Global School -> -026 (B I T Global School) not -011 (The Learning Sanctuary)' },
  'IR-W4C-010': { to: 'MOU-STEAM-2627-047', reason: 'St Johns High -> -047 not -019 (Christ Mission)' },
  'IR-W4C-011': { to: 'MOU-STEAM-2627-025', reason: 'Lions Calcutta Greater Vidya Mandir -> -025 not -020 (Delhi World Public)' },
  'IR-W4C-019': { to: 'MOU-STEAM-2627-050', reason: 'Young Horizons School -> -050 not -022 (B.D Memorial Jr.)' },
  'IR-W4C-020': { to: 'MOU-STEAM-2627-037', reason: 'Swarnim International -> -037 not -023 (GNIMS Business)' },
  'IR-W4C-022': { to: 'MOU-STEAM-2627-009', reason: 'Kavyapta Global -> -009 not -024 (Guru Nanak Institute)' },
  'IR-W4C-023': { to: 'MOU-STEAM-2627-019', reason: 'Christ Mission -> -019 not -025 (Lions Calcutta)' },
}

function main() {
  // Read form rows (for the audit's "form school" field).
  const pythonScript = `
import openpyxl, json, sys
wb = openpyxl.load_workbook('${FORM_PATH.replace(/\\/g, '/')}', data_only=True)
ws = wb.active
out = {}
for ri in range(2, ws.max_row + 1):
    out[f'IR-W4C-{ri-1:03d}'] = ws.cell(ri, 4).value
sys.stdout.write(json.dumps(out))
`
  const stdout = execFileSync('python', ['-c', pythonScript], { encoding: 'utf-8' })
  const formByIr = JSON.parse(stdout)

  const mous = JSON.parse(readFileSync(MOUS_PATH, 'utf-8'))
  const intakeRecords = JSON.parse(readFileSync(INTAKE_PATH, 'utf-8'))
  const mouById = new Map(mous.map((m) => [m.id, m]))

  const audit = {
    generatedAt: TS,
    rowCount: intakeRecords.length,
    clean: [],
    variation: [],
    selfCorrected: [],
    deferred: [],
  }

  // For each IR, classify.
  const updatedIntakeRecords = []
  for (const ir of intakeRecords) {
    const formSchool = formByIr[ir.id]
    const currentMouId = ir.mouId
    const currentMou = mouById.get(currentMouId)
    const currentName = currentMou?.schoolName ?? 'NOT-FOUND'
    const correction = CORRECTIONS[ir.id]

    if (correction !== undefined && correction.to !== currentMouId) {
      // Self-correct: move to the new MOU.
      const newMou = mouById.get(correction.to)
      if (!newMou) {
        console.warn(`[w4c.7] target MOU ${correction.to} not found for ${ir.id}; skipping`)
        updatedIntakeRecords.push(ir)
        continue
      }

      const correctionAudit = {
        timestamp: TS,
        user: 'system-w4c-7',
        action: 'intake-record-corrected-w4c7',
        before: { mouId: currentMouId, mappedSchoolName: currentName },
        after: { mouId: correction.to, mappedSchoolName: newMou.schoolName },
        notes: `${correction.reason}. Form school: ${formSchool}.`,
      }

      // Update IntakeRecord
      const correctedIr = {
        ...ir,
        mouId: correction.to,
        auditLog: [...ir.auditLog, correctionAudit],
      }
      updatedIntakeRecords.push(correctedIr)

      // Mirror correction audit on both MOUs:
      //  - old parent: 'intake-record-corrected-w4c7' noting the move OUT
      //  - new parent: same noting the move IN
      // ALSO: remove the original 'intake-captured' audit from old parent
      // and re-add it to new parent (so the historical trail follows the
      // record).
      const originalIntakeAudit = ir.auditLog.find((a) => a.action === 'intake-captured')

      if (currentMou) {
        currentMou.auditLog = currentMou.auditLog.filter((a) => {
          // Drop the original 'intake-captured' that pointed at this MOU
          if (a.action === 'intake-captured' && (a.notes ?? '').includes(`row ${parseInt(ir.id.slice(-3))}`)) return false
          return true
        })
        currentMou.auditLog.push({
          ...correctionAudit,
          notes: `${correctionAudit.notes} Moved OUT of this MOU.`,
        })
      }
      if (newMou) {
        if (originalIntakeAudit !== undefined) {
          newMou.auditLog.push({
            ...originalIntakeAudit,
            notes: `${originalIntakeAudit.notes ?? ''} (re-mirrored to correct MOU via W4-C.7)`,
          })
        }
        newMou.auditLog.push({
          ...correctionAudit,
          notes: `${correctionAudit.notes} Moved IN to this MOU.`,
        })
      }

      audit.selfCorrected.push({
        irId: ir.id,
        formSchool,
        from: currentMouId,
        fromName: currentName,
        to: correction.to,
        toName: newMou.schoolName,
        reason: correction.reason,
      })
    } else if (
      currentMou
      && (currentMou.schoolName === formSchool
        || isAcceptableVariation(formSchool, currentName)
        || KNOWN_CLEAN.has(ir.id))
    ) {
      // Clean or accepted variation (token-equivalent, alias, or
      // domain-knowledge-confirmed).
      const isVariation = currentMou.schoolName !== formSchool
      const entry = {
        irId: ir.id,
        formSchool,
        mouId: currentMouId,
        mouName: currentName,
      }
      if (isVariation) audit.variation.push(entry)
      else audit.clean.push(entry)
      updatedIntakeRecords.push(ir)
    } else if (correction === undefined) {
      // No mechanical correction available; defer to Anish.
      audit.deferred.push({
        irId: ir.id,
        formSchool,
        currentMouId,
        currentMouName: currentName,
        reason: 'No clean self-correction; needs Anish review',
      })
      updatedIntakeRecords.push(ir)
    } else {
      updatedIntakeRecords.push(ir)
    }
  }

  // Write outputs
  writeFileSync(INTAKE_PATH, JSON.stringify(updatedIntakeRecords, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_INTAKE_PATH, JSON.stringify(updatedIntakeRecords, null, 2) + '\n', 'utf-8')
  writeFileSync(MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2) + '\n', 'utf-8')

  // Deferred CSV
  const csvLines = ['irId,formSchool,currentMouId,currentMouName,reason']
  for (const d of audit.deferred) {
    csvLines.push([
      d.irId,
      csvEscape(d.formSchool),
      d.currentMouId,
      csvEscape(d.currentMouName),
      csvEscape(d.reason),
    ].join(','))
  }
  writeFileSync(DEFERRED_CSV, csvLines.join('\n') + '\n', 'utf-8')

  console.log(`[w4c.7] clean:          ${audit.clean.length}`)
  console.log(`[w4c.7] variation:      ${audit.variation.length}`)
  console.log(`[w4c.7] self-corrected: ${audit.selfCorrected.length}`)
  console.log(`[w4c.7] deferred:       ${audit.deferred.length}`)
  console.log(`[w4c.7] audit:          ${AUDIT_PATH}`)
  console.log(`[w4c.7] deferred CSV:   ${DEFERRED_CSV}`)
}

function isAcceptableVariation(formSchool, currentName) {
  if (!formSchool || !currentName) return false
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const a = norm(formSchool)
  const b = norm(currentName)
  if (a === b) return true
  // One contains the other (substring)
  if (a.includes(b) || b.includes(a)) return true
  // Token-set equality after stop-word removal
  const STOP = new Set(['school', 'the', 'of', 'sr', 'sec', 'senior', 'secondary', 'sd'])
  const ta = new Set(a.split(/\s+/).filter((t) => !STOP.has(t) && t.length > 2))
  const tb = new Set(b.split(/\s+/).filter((t) => !STOP.has(t) && t.length > 2))
  if (ta.size === 0 || tb.size === 0) return false
  // Symmetric difference is empty
  for (const t of ta) if (!tb.has(t)) return false
  for (const t of tb) if (!ta.has(t)) return false
  return true
}

function csvEscape(s) {
  if (s === null || s === undefined) return ''
  const v = String(s)
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

main()
