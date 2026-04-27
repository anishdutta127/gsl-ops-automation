#!/usr/bin/env node

/*
 * Week 3 one-shot importer.
 *
 * Reads mous.json + schools.json + payments.json from a local
 * gsl-mou-system clone, runs each through the matching adapter
 * module, writes the resulting Ops fixtures to src/data/ and
 * src/data/_fixtures/. Outputs a structured anomaly report so the
 * batch summary can land in the W3-A commit message + report.
 *
 * Why a one-shot script and not the existing /api/mou/import-tick
 * route: the API route is incremental (per-tick fetch from the
 * Contents API, dedup by MOU id) and only handles MOUs. Week 3
 * needs a single full-rebuild pass that also seeds schools +
 * payments + extends sales_team with new salesRep names. The
 * script is run once locally, the resulting fixtures are committed,
 * and the production import-tick continues unchanged from there.
 *
 * Inputs (read-only):
 *   ../gsl-mou-system/src/data/mous.json
 *   ../gsl-mou-system/src/data/schools.json
 *   ../gsl-mou-system/src/data/payments.json
 *
 * Outputs (overwrites):
 *   src/data/mous.json + src/data/_fixtures/mous.json
 *   src/data/schools.json + src/data/_fixtures/schools.json
 *   src/data/payments.json + src/data/_fixtures/payments.json
 *   src/data/sales_team.json + src/data/_fixtures/sales_team.json
 *   src/data/mou_import_review.json + src/data/_fixtures/mou_import_review.json
 *
 * After running:
 *   node scripts/import-week3.mjs
 *   npm run seed:dev   (to refresh users.json hashes if needed)
 *   git diff --stat    (verify only the fixture files changed)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const REPO_ROOT = resolve(__dirname, '..')
const UPSTREAM_ROOT = resolve(REPO_ROOT, '../gsl-mou-system')

const IMPORT_TIMESTAMP = '2026-04-27T12:00:00.000Z'

// ----------------------------------------------------------------------------
// Path helpers
// ----------------------------------------------------------------------------

function readJson(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf-8'))
}

function writeBoth(filename, data) {
  const json = JSON.stringify(data, null, 2) + '\n'
  writeFileSync(resolve(REPO_ROOT, 'src/data', filename), json, 'utf-8')
  writeFileSync(resolve(REPO_ROOT, 'src/data/_fixtures', filename), json, 'utf-8')
}

// ----------------------------------------------------------------------------
// Sales team extension
// ----------------------------------------------------------------------------

function extendSalesTeam(existingTeam, upstreamMous) {
  // Collect distinct salesRep names from upstream, dedup case-insensitively
  const namesByCanonical = new Map()
  for (const m of upstreamMous) {
    if (typeof m.salesRep !== 'string') continue
    const trimmed = m.salesRep.trim()
    if (trimmed === '') continue
    const canonical = trimmed.toLowerCase()
    if (!namesByCanonical.has(canonical)) {
      namesByCanonical.set(canonical, trimmed)
    }
  }
  const upstreamNames = [...namesByCanonical.values()].sort()

  const existingByLower = new Map(existingTeam.map(s => [s.name.trim().toLowerCase(), s]))
  const additions = []
  for (const upstreamName of upstreamNames) {
    const lower = upstreamName.toLowerCase()
    if (existingByLower.has(lower)) continue
    const firstName = upstreamName.split(/\s+/)[0]
    if ([...existingByLower.keys()].some(k => k.startsWith(lower + ' ') || k === lower)) continue
    const id = 'sp-' + upstreamName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    additions.push({
      id,
      name: upstreamName,
      email: id.replace('sp-', '').replace(/_/g, '.') + '@getsetlearn.info',
      phone: null,
      territories: [],
      programmes: ['STEAM', 'Young Pioneers'],
      active: true,
      joinedDate: '2025-04-01',
    })
  }

  return { extended: [...existingTeam, ...additions], additions, upstreamNames }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log('Week 3 importer: seeding Ops fixtures from upstream gsl-mou-system\n')

  // Read upstream
  const upstreamMous = readJson(resolve(UPSTREAM_ROOT, 'src/data/mous.json'))
  const upstreamSchools = readJson(resolve(UPSTREAM_ROOT, 'src/data/schools.json'))
  const upstreamPayments = readJson(resolve(UPSTREAM_ROOT, 'src/data/payments.json'))
  console.log(`  read ${upstreamMous.length} MOUs, ${upstreamSchools.length} schools, ${upstreamPayments.length} payments from upstream`)

  // Existing Ops state
  const existingSalesTeam = readJson(resolve(REPO_ROOT, 'src/data/sales_team.json'))

  // Step 1: extend sales_team with new entries from upstream salesRep
  const { extended: extendedTeam, additions: salesAdditions, upstreamNames: distinctSalesRepNames } =
    extendSalesTeam(existingSalesTeam, upstreamMous)
  console.log(`  sales_team: ${existingSalesTeam.length} existing + ${salesAdditions.length} new = ${extendedTeam.length} total`)

  // Step 2: schools (use the structured adapter via dynamic import of the TS module via tsx-equivalent)
  // To keep the script dependency-free and runnable as plain Node, we inline
  // the small amount of school adapter logic here; the canonical lib is at
  // src/lib/importer/fromSchools.ts and is unit-tested. This script's copy
  // must stay in sync with that module's STATE_TO_REGION map.
  const STATE_TO_REGION = {
    'West Bengal': 'East', 'Bihar': 'East', 'Jharkhand': 'East', 'Meghalaya': 'East', 'Nagaland': 'East',
    'Delhi': 'North', 'Haryana': 'North', 'Uttar Pradesh': 'North', 'Uttarakhand': 'North', 'Rajasthan': 'North',
    'Jammu & Kashmir': 'North', 'Kashmir': 'North', 'Union Territory of Ladakh': 'North',
    'Karnataka': 'South-West', 'Karanataka': 'South-West', 'Tamil Nadu': 'South-West', 'Tamilnadu': 'South-West',
    'Maharashtra': 'South-West', 'Gujarat': 'South-West', 'Telangana': 'South-West', 'Andhra Pradesh': 'South-West',
    'Chhatisgarh': 'South-West', 'Chhattisgarh': 'South-West',
  }
  const FALLBACK_REGION = 'East'

  const schoolAnomalies = []
  const schools = upstreamSchools.map(raw => {
    const rawState = typeof raw.state === 'string' ? raw.state.trim() : ''
    let region = FALLBACK_REGION
    if (rawState !== '' && STATE_TO_REGION[rawState]) region = STATE_TO_REGION[rawState]
    else if (rawState === '') schoolAnomalies.push({ schoolId: raw.id, kind: 'null-state' })
    else schoolAnomalies.push({ schoolId: raw.id, kind: 'unmapped-state', detail: rawState })

    const missingFields = []
    if (!raw.email) missingFields.push('email')
    if (!raw.contactPerson) missingFields.push('contactPerson')
    if (!raw.gstNumber) missingFields.push('gstNumber')
    if (!raw.pinCode) missingFields.push('pinCode')

    return {
      id: raw.id,
      name: raw.name,
      legalEntity: raw.legalEntity ?? null,
      city: typeof raw.city === 'string' ? raw.city : '',
      state: rawState,
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
      createdAt: IMPORT_TIMESTAMP,
      auditLog: [{
        timestamp: IMPORT_TIMESTAMP,
        user: 'system',
        action: 'create',
        notes: 'Imported from gsl-mou-system as part of Week 3 backfill.',
      }],
    }
  })
  console.log(`  schools: ${schools.length} written (${schoolAnomalies.filter(a => a.kind === 'unmapped-state').length} unmapped states, ${schoolAnomalies.filter(a => a.kind === 'null-state').length} null states)`)

  // Step 3: payments (mirror src/lib/importer/fromPayments.ts logic)
  const VALID_STATUS = new Set(['Received', 'Pending', 'Overdue', 'Partial', 'Due Soon', 'PI Sent', 'Paid'])
  const VALID_MODES = new Set(['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Zoho', 'Razorpay', 'Other'])
  const paymentAnomalies = []

  const payments = upstreamPayments.map(raw => {
    let status = 'Pending'
    if (typeof raw.status === 'string' && VALID_STATUS.has(raw.status)) status = raw.status
    else paymentAnomalies.push({ paymentId: raw.id, kind: 'unknown-status', detail: String(raw.status) })

    let paymentMode = null
    if (typeof raw.paymentMode === 'string' && raw.paymentMode !== '') {
      if (VALID_MODES.has(raw.paymentMode)) paymentMode = raw.paymentMode
      else paymentAnomalies.push({ paymentId: raw.id, kind: 'unknown-mode', detail: raw.paymentMode })
    }

    let piGeneratedAt = null
    if (typeof raw.piNumber === 'string' && raw.piNumber !== '') {
      piGeneratedAt = IMPORT_TIMESTAMP
      paymentAnomalies.push({ paymentId: raw.id, kind: 'pi-without-date' })
    }

    return {
      id: raw.id,
      mouId: raw.mouId,
      schoolName: raw.schoolName,
      programme: raw.programme,
      instalmentLabel: raw.instalmentLabel,
      instalmentSeq: raw.instalmentSeq,
      totalInstalments: raw.totalInstalments,
      description: raw.description,
      dueDateRaw: raw.dueDateRaw ?? null,
      dueDateIso: raw.dueDateIso ?? null,
      expectedAmount: raw.expectedAmount,
      receivedAmount: raw.receivedAmount ?? null,
      receivedDate: raw.receivedDate ?? null,
      paymentMode,
      bankReference: raw.bankReference ?? null,
      piNumber: raw.piNumber ?? null,
      taxInvoiceNumber: raw.taxInvoiceNumber ?? null,
      status,
      notes: raw.notes ?? null,
      piSentDate: null,
      piSentTo: null,
      piGeneratedAt,
      studentCountActual: null,
      partialPayments: null,
      auditLog: [{
        timestamp: IMPORT_TIMESTAMP,
        user: 'system',
        action: 'create',
        notes: piGeneratedAt !== null
          ? 'Imported from gsl-mou-system as part of Week 3 backfill. piGeneratedAt stamped to import timestamp (legacy PI issuance date unrecoverable).'
          : 'Imported from gsl-mou-system as part of Week 3 backfill.',
      }],
    }
  })
  console.log(`  payments: ${payments.length} written (${paymentAnomalies.filter(a => a.kind === 'pi-without-date').length} PI-no-date, ${paymentAnomalies.filter(a => a.kind === 'unknown-status').length} unknown-status, ${paymentAnomalies.filter(a => a.kind === 'unknown-mode').length} unknown-mode)`)

  // Step 4: MOUs via the legacy-relaxed validator path. Inline the
  // pipeline so the script is self-contained; canonical lib is
  // src/lib/importer/fromMou.ts (and validators.ts) and is unit-tested.
  const STUDENTS_MAX = 20000
  const CV_MAX = 100_000_000
  const SN_MAX = 200
  const MOU_ID_PATTERN = /^MOU-[A-Z]+-\d{4}-\d{3}$/
  const VALID_PROG = new Set(['STEAM', 'Young Pioneers', 'Harvard HBPE', 'TinkRworks', 'VEX'])
  const CHAIN_NAME_PATTERN = /group\s+of\s+schools/i
  const SINGLE_SCHOOL_STUDENT_CEILING = 1500

  const salesPersonResolver = buildResolver(extendedTeam)
  const schoolsByNameLower = new Map()
  for (const s of schools) {
    const key = s.name.trim().toLowerCase()
    if (!schoolsByNameLower.has(key)) schoolsByNameLower.set(key, [])
    schoolsByNameLower.get(key).push(s)
  }

  const written = []
  const quarantined = []
  let filtered = 0
  const mouAnomalies = []

  for (const raw of upstreamMous) {
    // Legacy-relaxed validator
    const swt = raw.spWithTax, swot = raw.spWithoutTax
    if (typeof swt !== 'number' || typeof swot !== 'number') {
      quarantined.push({ raw, validationFailed: 'tax_inversion', reason: 'spWithTax/spWithoutTax not numbers' })
      continue
    }
    if (swt < swot) {
      quarantined.push({ raw, validationFailed: 'tax_inversion', reason: `spWithTax (${swt}) < spWithoutTax (${swot})` })
      continue
    }
    const sm = raw.studentsMou
    if (typeof sm !== 'number' || sm < 0 || sm > STUDENTS_MAX) {
      quarantined.push({ raw, validationFailed: 'student_count_implausible', reason: `studentsMou must be in [0, ${STUDENTS_MAX}]; got ${sm}` })
      continue
    }
    const cv = raw.contractValue
    if (typeof cv !== 'number' || cv < 0 || cv >= CV_MAX) {
      quarantined.push({ raw, validationFailed: 'contract_value_implausible', reason: `contractValue must be in [0, ${CV_MAX}); got ${cv}` })
      continue
    }
    if (raw.startDate || raw.endDate) {
      if (typeof raw.startDate !== 'string' || typeof raw.endDate !== 'string') {
        quarantined.push({ raw, validationFailed: 'date_inversion', reason: 'startDate/endDate must both be ISO strings if either is set' })
        continue
      }
      if (new Date(raw.endDate).getTime() <= new Date(raw.startDate).getTime()) {
        quarantined.push({ raw, validationFailed: 'date_inversion', reason: `endDate (${raw.endDate}) <= startDate (${raw.startDate})` })
        continue
      }
    }
    if (typeof raw.programme !== 'string' || !VALID_PROG.has(raw.programme)) {
      quarantined.push({ raw, validationFailed: 'unknown_programme', reason: `programme not in canonical enum: "${raw.programme}"` })
      continue
    }
    if (typeof raw.schoolName !== 'string' || raw.schoolName.trim() === '' || raw.schoolName.length >= SN_MAX) {
      quarantined.push({ raw, validationFailed: 'schoolname_implausible', reason: 'schoolName empty or too long' })
      continue
    }
    if (typeof raw.id !== 'string' || !MOU_ID_PATTERN.test(raw.id)) {
      quarantined.push({ raw, validationFailed: 'id_format', reason: `id format mismatch: "${raw.id}"` })
      continue
    }

    // School identity resolution: upstream MOU.schoolId always resolves
    // (verified 0 orphans during recon). Skip the matcher; pass through.
    const matchedSchool = schools.find(s => s.id === raw.schoolId)
    if (!matchedSchool) {
      quarantined.push({ raw, validationFailed: null, reason: `schoolId "${raw.schoolId}" not in schools fixture` })
      continue
    }

    // Chain heuristic
    if ((typeof raw.schoolName === 'string' && CHAIN_NAME_PATTERN.test(raw.schoolName)) ||
        (typeof raw.studentsMou === 'number' && raw.studentsMou > SINGLE_SCHOOL_STUDENT_CEILING)) {
      quarantined.push({ raw, validationFailed: null, reason: 'Likely GROUP-scope chain MOU; SINGLE-vs-GROUP classification needed', candidates: [matchedSchool] })
      continue
    }

    // Sales-person resolver
    const auditLog = []
    let resolvedSalesPersonId = null
    if (typeof raw.salesRep === 'string' && raw.salesRep.trim() !== '') {
      resolvedSalesPersonId = salesPersonResolver(raw.salesRep)
      if (resolvedSalesPersonId === null) {
        auditLog.push({
          timestamp: IMPORT_TIMESTAMP,
          user: 'system',
          action: 'manual-relink',
          notes: `Upstream salesRep "${raw.salesRep.trim()}" did not match any Ops sales-team entry; salesPersonId left null.`,
        })
        mouAnomalies.push({ mouId: raw.id, kind: 'unmatched-salesRep', detail: raw.salesRep.trim() })
      }
    }

    auditLog.push({
      timestamp: IMPORT_TIMESTAMP,
      user: 'system',
      action: 'auto-link-exact-match',
      notes: `Imported from gsl-mou-system; auto-linked to school ${matchedSchool.id}.`,
    })

    written.push({
      id: raw.id,
      schoolId: matchedSchool.id,
      schoolName: raw.schoolName,
      programme: raw.programme,
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: typeof raw.status === 'string' ? raw.status : 'Active',
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
      trainerModel: raw.trainerModel ?? null,
      salesPersonId: resolvedSalesPersonId,
      templateVersion: raw.templateVersion ?? null,
      generatedAt: raw.generatedAt ?? null,
      notes: raw.notes ?? null,
      daysToExpiry: raw.daysToExpiry ?? null,
      auditLog,
    })
  }

  console.log(`  MOUs: ${written.length} written, ${quarantined.length} quarantined, ${filtered} filtered`)

  // Step 5: build mou_import_review.json from quarantined records
  const review = quarantined.map(q => ({
    queuedAt: IMPORT_TIMESTAMP,
    rawRecord: q.raw,
    validationFailed: q.validationFailed,
    quarantineReason: q.reason,
    candidates: q.candidates ?? null,
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    rejectionReason: null,
    rejectionNotes: null,
  }))

  // Write everything
  writeBoth('mous.json', written)
  writeBoth('schools.json', schools)
  writeBoth('payments.json', payments)
  writeBoth('sales_team.json', extendedTeam)
  writeBoth('mou_import_review.json', review)

  // Summary
  console.log('\n=== W3-A import summary ===')
  console.log(`Sales team: ${extendedTeam.length} (${salesAdditions.length} new added from upstream salesRep names)`)
  console.log(`Schools: ${schools.length}`)
  console.log(`Payments: ${payments.length}`)
  console.log(`MOUs written: ${written.length}`)
  console.log(`MOUs quarantined: ${quarantined.length}`)
  if (quarantined.length > 0) {
    const byKind = {}
    quarantined.forEach(q => {
      const k = q.validationFailed ?? (q.reason.includes('GROUP') ? 'chain-heuristic' : 'other')
      byKind[k] = (byKind[k] ?? 0) + 1
    })
    console.log('  Quarantine breakdown:', JSON.stringify(byKind))
  }
  console.log(`MOU anomalies (unmatched salesRep): ${mouAnomalies.filter(a => a.kind === 'unmatched-salesRep').length}`)
  console.log(`School anomalies (unmapped state): ${schoolAnomalies.filter(a => a.kind === 'unmapped-state').length}`)
  console.log(`School anomalies (null state): ${schoolAnomalies.filter(a => a.kind === 'null-state').length}`)
  console.log(`School anomalies (incomplete contact): ${schools.filter(s => !s.email || !s.contactPerson || !s.gstNumber || !s.pinCode).length} schools missing >=1 contact field`)
  console.log(`Payment anomalies (PI without date): ${paymentAnomalies.filter(a => a.kind === 'pi-without-date').length}`)
  console.log()
  console.log('Distinct upstream salesRep names:', distinctSalesRepNames.length)
  console.log('  ', distinctSalesRepNames.join(', '))
  if (salesAdditions.length > 0) {
    console.log('New sales_team entries:')
    salesAdditions.forEach(s => console.log(`  ${s.id}  ${s.name}`))
  }
}

function buildResolver(salesTeam) {
  return (rawSalesRep) => {
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

main().catch(err => {
  console.error('import-week3 failed:', err)
  process.exit(1)
})
