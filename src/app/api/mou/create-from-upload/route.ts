/*
 * POST /api/mou/create-from-upload (Step 2, Pranav Finance/Ops review;
 * reworked by the MOU form upgrade gate).
 *
 * The PRIMARY MOU creation path: Finance enters a SIGNED MOU (school
 * identity + core terms + instalment schedule + optional signed PDF).
 * Creates an Active MOU and its Payment instalment rows, stamps
 * opsReviewStatus='Pending for review' for the Ops track.
 *
 * School identity has three resolution modes (form upgrade gate):
 *   (a) Linked: existingSchoolId names a canonical school row.
 *   (b) Name-matched: the typed school name normalises (schoolMatcher
 *       rules, name-only) to exactly one active school; auto-link,
 *       recorded in the audit notes.
 *   (c) Inline-create: a new School row is created (slugified id,
 *       collision suffix, INCOMPLETE_SCHOOL_DETAILS marker) carrying
 *       the typed address in notes. Postgres mode wraps school + MOU +
 *       payments in ONE transaction (saveDraftMou pattern).
 *
 * Error contract: fetch callers (Accept: application/json) get JSON
 * { ok:false, error, message } with a real, specific message; native
 * form posts fall back to a 303 redirect carrying error + detail query
 * params which the page renders. The pre-gate behaviour of swallowing
 * the exception text behind a generic "save-failed" key is retired.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 *
 * File storage mirrors the existing signed-mou upload (public/signed-mous);
 * production-grade blob storage is the Azure migration (D-041).
 */

import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import type { AuditEntry, MOU, Payment, Programme, School } from '@/lib/types'
import type { SalesChannel } from '@/lib/mouSystem/types'
import { SALES_CHANNELS } from '@/lib/mouSystem/templates'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { paymentRepo } from '@/lib/db/repos/payment'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { regionForSalesPerson } from '@/lib/regions'
import { normaliseSchoolName } from '@/lib/importer/schoolMatcher'
import { slugifySchoolId, INCOMPLETE_SCHOOL_MARKER } from '@/lib/mouSystem/entityWriters'
import { currentBackend } from '@/lib/db/backend'

const SIGNED_DIR = path.join(process.cwd(), 'public', 'signed-mous')
const PROGRAMMES: Programme[] = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics']
const PROG_CODE: Record<Programme, string> = {
  STEAM: 'STEAM', 'Young Pioneers': 'YP', 'Harvard HBPE': 'HBPE', Robotics: 'ROBO',
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Human messages for every failure key. The page's redirect-fallback
 * map mirrors these; JSON responses carry them directly. */
const MESSAGES: Record<string, string> = {
  permission: 'Only Finance and Admin can enter MOUs.',
  'invalid-form': 'The form payload was malformed. Retry.',
  'missing-school-name': 'Enter the school name.',
  'missing-school-address': 'Enter the school address.',
  'school-not-found': 'That school was not found.',
  'invalid-programme': 'Select a valid programme.',
  'invalid-year': 'Enter the academic year as YYYY-YY (e.g. 2026-27).',
  'invalid-students': 'Enter a student count greater than zero.',
  'invalid-price': 'Enter a sale price per student greater than zero.',
  'missing-start-date': 'Enter the MOU start date.',
  'missing-end-date': 'Enter the MOU end date.',
  'date-order': 'The MOU end date must be on or after the start date.',
  'invalid-date': 'Dates must be YYYY-MM-DD.',
  'invalid-installments': 'Add at least one complete instalment row (due date and an amount greater than zero).',
  'invalid-sales-channel': 'Select a valid sales channel.',
  'salesperson-not-found': 'The selected salesperson was not found.',
  'salesperson-no-region': 'The selected salesperson has no region/territory set. Set it in Sales Team first, then retry.',
  'pdf-only': 'Only PDF files are accepted for the signed MOU.',
  'too-large': 'The signed PDF exceeds 10 MB.',
  'save-failed': 'Failed to save the MOU.',
}

interface InstalmentInput {
  dueDateIso: string
  amountRs: number
}

function fyTag(academicYear: string): string {
  // '2026-27' -> '2627'. The pre-gate regex captured the century
  // digits ('20' + '27' -> '2027'), drifting new ids away from the
  // existing MOU-STEAM-2627-NNN cohort; capture the year tail instead.
  const m = academicYear.match(/\d{2}(\d{2})-(\d{2})/)
  return m ? `${m[1]}${m[2]}` : academicYear.replace(/\D/g, '').slice(0, 4)
}

/** Mint the next MOU id for this programme + FY, e.g. MOU-STEAM-2627-014. */
function mintId(all: MOU[], programme: Programme, academicYear: string): string {
  const prefix = `MOU-${PROG_CODE[programme]}-${fyTag(academicYear)}-`
  let max = 0
  for (const m of all) {
    if (!m.id.startsWith(prefix)) continue
    const tail = m.id.slice(prefix.length)
    const n = Number(tail)
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function parseInstalments(raw: string): InstalmentInput[] | null {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!Array.isArray(parsed)) return null
  const rows: InstalmentInput[] = []
  for (const r of parsed) {
    const obj = (r ?? {}) as Record<string, unknown>
    const dueDateIso = typeof obj.dueDateIso === 'string' ? obj.dueDateIso : ''
    const amountRs = Number(obj.amountRs)
    if (!ISO_DATE_RE.test(dueDateIso)) return null
    if (!Number.isFinite(amountRs) || amountRs <= 0) return null
    rows.push({ dueDateIso, amountRs: Math.round(amountRs * 100) / 100 })
  }
  return rows.length > 0 ? rows : null
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json')
}

function fail(
  request: Request,
  key: string,
  opts?: { detail?: string; status?: number },
): NextResponse {
  const message = opts?.detail
    ? `${MESSAGES[key] ?? key} ${opts.detail}`.trim()
    : MESSAGES[key] ?? key
  if (wantsJson(request)) {
    return NextResponse.json(
      { ok: false, error: key, message },
      { status: opts?.status ?? 400 },
    )
  }
  const url = new URL('/mous/upload', request.url)
  url.searchParams.set('error', key)
  if (opts?.detail) url.searchParams.set('detail', opts.detail)
  return NextResponse.redirect(url, { status: 303 })
}

/** Allocate the next free school id for a base slug against the full
 * school list (json + postgres parity; single-writer scale per the
 * saveDraftMou precedent). */
function allocateSchoolId(baseId: string, schools: School[]): string {
  const taken = new Set(schools.map((s) => s.id))
  for (let i = 1; i <= 99; i++) {
    const candidate = i === 1 ? baseId : `${baseId}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(
    `Could not allocate a unique school id for slug ${baseId}. Use a more distinctive school name.`,
  )
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    if (wantsJson(request)) {
      return NextResponse.json(
        { ok: false, error: 'unauthenticated', message: 'Your session has expired. Sign in again.' },
        { status: 401 },
      )
    }
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/mous/upload')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canEditFinanceData(user)) return fail(request, 'permission', { status: 403 })

  let form: FormData
  try { form = await request.formData() } catch { return fail(request, 'invalid-form') }

  const schoolNameInput = String(form.get('schoolName') ?? '').trim()
  const schoolAddress = String(form.get('schoolAddress') ?? '').trim()
  const existingSchoolId = String(form.get('existingSchoolId') ?? '').trim()
  const programme = String(form.get('programme') ?? '') as Programme
  const academicYear = String(form.get('academicYear') ?? '').trim()
  const students = Number(form.get('students'))
  const pricePerStudent = Number(form.get('pricePerStudent'))
  const startDate = String(form.get('startDate') ?? '').trim()
  const endDate = String(form.get('endDate') ?? '').trim()
  const salesChannelRaw = String(form.get('salesChannel') ?? '').trim()
  const salesPersonId = String(form.get('salesPersonId') ?? '').trim()
  const signDate = String(form.get('signDate') ?? '').trim()
  const installmentsRaw = String(form.get('installments') ?? '')
  const file = form.get('file')

  // ---- Server-side validation (mirror of the client checks; the client
  // is a convenience, this is the boundary) ----
  if (!existingSchoolId && !schoolNameInput) return fail(request, 'missing-school-name')
  if (!existingSchoolId && !schoolAddress) return fail(request, 'missing-school-address')
  if (!PROGRAMMES.includes(programme)) return fail(request, 'invalid-programme')
  if (!/^\d{4}-\d{2}$/.test(academicYear)) return fail(request, 'invalid-year')
  if (!Number.isFinite(students) || students <= 0) return fail(request, 'invalid-students')
  if (!Number.isFinite(pricePerStudent) || pricePerStudent <= 0) return fail(request, 'invalid-price')
  if (!startDate) return fail(request, 'missing-start-date')
  if (!endDate) return fail(request, 'missing-end-date')
  if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) return fail(request, 'invalid-date')
  if (endDate < startDate) return fail(request, 'date-order')
  if (signDate && !ISO_DATE_RE.test(signDate)) return fail(request, 'invalid-date')
  if (salesChannelRaw && !(SALES_CHANNELS as readonly string[]).includes(salesChannelRaw)) {
    return fail(request, 'invalid-sales-channel')
  }
  const salesChannel = (salesChannelRaw || null) as SalesChannel | null
  const installments = parseInstalments(installmentsRaw)
  if (!installments) return fail(request, 'invalid-installments')

  // Salesperson + derived region (do not free-type region). Optional field; but
  // if a salesperson is chosen, its territory MUST yield a region - else fail
  // loud rather than save a blank region.
  let region: string | null = null
  if (salesPersonId) {
    const sp = await salesTeamRepo.findById(salesPersonId)
    if (!sp) return fail(request, 'salesperson-not-found')
    region = regionForSalesPerson(sp)
    if (!region) return fail(request, 'salesperson-no-region', { detail: `(${sp.name})` })
  }

  // ---- School resolution: linked / name-matched / inline-create ----
  const allSchools = await schoolRepo.findAll()
  let school: School | null = null
  let newSchoolRow: School | null = null
  let schoolResolution = ''
  const ts = new Date().toISOString()

  if (existingSchoolId) {
    school = allSchools.find((s) => s.id === existingSchoolId) ?? null
    if (!school) return fail(request, 'school-not-found')
    schoolResolution = 'linked by operator'
  } else {
    const targetKey = normaliseSchoolName(schoolNameInput)
    const matches = allSchools.filter(
      (s) => s.active !== false && normaliseSchoolName(s.name) === targetKey,
    )
    if (matches.length === 1) {
      school = matches[0]!
      schoolResolution = `auto-linked by name match (${school.id})`
    } else {
      const baseId = slugifySchoolId(schoolNameInput)
      const newId = allocateSchoolId(baseId, allSchools)
      newSchoolRow = {
        id: newId,
        name: schoolNameInput,
        legalEntity: null,
        city: '',
        state: '',
        region: '',
        pinCode: null,
        contactPerson: null,
        email: null,
        phone: null,
        billingName: null,
        pan: null,
        gstNumber: null,
        notes: `${INCOMPLETE_SCHOOL_MARKER} Address: ${schoolAddress}. City / state / region pending; entered via Add MOU form.`,
        active: true,
        createdAt: ts,
        auditLog: [],
      }
      school = newSchoolRow
      schoolResolution = `new school created (${newId})`
    }
  }

  const all = await mouRepo.findAll()
  const id = mintId(all, programme, academicYear)
  const contractValue = Math.round(students * pricePerStudent)

  if (newSchoolRow) {
    // Per the audit convention: the consequent entity gets a generic
    // 'create' with a forward pointer to the originating MOU.
    newSchoolRow.auditLog = [{
      timestamp: ts,
      user: user.name,
      action: 'create',
      notes: `Auto-created from Add MOU ${id}. Address captured in notes; city / state / region pending.`,
    }]
  }

  // Optional signed-PDF store (best-effort; metadata persists regardless).
  let signedMouPdfPath: string | null = null
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext !== 'pdf') return fail(request, 'pdf-only')
    if (file.size > 10 * 1024 * 1024) return fail(request, 'too-large')
    try {
      await fs.mkdir(SIGNED_DIR, { recursive: true })
      await fs.writeFile(path.join(SIGNED_DIR, `${id}.pdf`), Buffer.from(await file.arrayBuffer()))
      signedMouPdfPath = `/signed-mous/${id}.pdf`
    } catch { /* file store is ephemeral on serverless; the MOU still saves */ }
  }

  const audit: AuditEntry = {
    timestamp: ts,
    user: user.name,
    action: 'create',
    after: {
      id,
      status: 'Active',
      opsReviewStatus: 'Pending for review',
      schoolId: school.id,
      schoolName: school.name,
      schoolAddress: schoolAddress || null,
      startDate,
      endDate,
      studentsMou: students,
      spWithTax: pricePerStudent,
      contractValue,
      salesChannel,
      salesPersonId: salesPersonId || null,
      region,
      installmentCount: installments.length,
      signedMouPdfPath,
    },
    notes: `Signed MOU entered via Add MOU form (Finance). School ${schoolResolution}. Pending Ops review.`,
  }

  const totalInstalments = installments.length
  const scheduleSummary = installments
    .map((i) => `${Math.round((i.amountRs / Math.max(contractValue, 1)) * 100)}`)
    .join('-')

  const mou: MOU = {
    id,
    schoolId: school.id,
    schoolName: school.name,
    programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear,
    effectiveDate: signDate || null,
    startDate,
    endDate,
    numberOfYears: 1,
    studentsMou: students,
    studentsActual: students,
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: pricePerStudent,
    spWithTax: pricePerStudent,
    contractValue,
    received: 0,
    tds: 0,
    balance: contractValue,
    receivedPct: 0,
    trainerModel: null,
    salesPersonId: salesPersonId || '',
    region,
    templateVersion: '',
    generatedAt: ts,
    notes: '',
    delayNotes: null,
    daysToExpiry: null,
    salesChannel,
    schoolCrmId: null,
    signedMouPdfPath,
    importNotes: null,
    productSelection: null,
    products: null,
    opsReviewStatus: 'Pending for review',
    gradewiseDistribution: null,
    paymentSchedule: scheduleSummary,
    paymentSchedules: null,
    yearlyPricing: null,
    billingBlock: null,
    draftVariables: null,
    studentCountEventIds: [],
    auditLog: [audit],
  }

  const paymentRows: Payment[] = installments.map((row, idx) => {
    const seq = idx + 1
    return {
      id: `${id}-i${seq}`,
      mouId: id,
      schoolName: school!.name,
      programme,
      instalmentLabel: `${seq} of ${totalInstalments}`,
      instalmentSeq: seq,
      totalInstalments,
      description: '',
      dueDateRaw: row.dueDateIso,
      dueDateIso: row.dueDateIso,
      expectedAmount: row.amountRs,
      receivedAmount: null,
      receivedDate: null,
      paymentMode: null,
      bankReference: null,
      piNumber: null,
      taxInvoiceNumber: null,
      status: 'Pending',
      notes: null,
      piSentDate: null,
      piSentTo: null,
      piGeneratedAt: null,
      studentCountActual: null,
      partialPayments: [],
      auditLog: [{
        timestamp: ts,
        user: user.name,
        action: 'create',
        notes: `Auto-created from Add MOU ${id} instalment schedule.`,
      }],
    }
  })

  try {
    if (currentBackend() === 'postgres') {
      // School (when new) + MOU + Payment rows in ONE transaction so a
      // failure on any insert rolls back the lot (saveDraftMou pattern).
      const { getSql } = await import('@/lib/db/client')
      const sqlInstance = getSql()
      await sqlInstance.begin(async (tx) => {
        const txSql = tx as unknown as ReturnType<typeof getSql>
        if (newSchoolRow) {
          await schoolRepo.create(newSchoolRow, { queuedBy: user.id, sql: txSql })
        }
        await mouRepo.create(mou, { queuedBy: user.id, sql: txSql })
        for (const p of paymentRows) {
          await paymentRepo.create(p, { queuedBy: user.id, sql: txSql })
        }
      })
    } else {
      if (newSchoolRow) {
        await schoolRepo.create(newSchoolRow, { queuedBy: user.id })
      }
      await mouRepo.create(mou, { queuedBy: user.id })
      for (const p of paymentRows) {
        await paymentRepo.create(p, { queuedBy: user.id })
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'create failed'
    console.error('[create-from-upload] save failed:', e)
    return fail(request, 'save-failed', { detail, status: 500 })
  }

  if (wantsJson(request)) {
    return NextResponse.json({ ok: true, id, redirect: `/mous/${id}?created=1` })
  }
  const url = new URL(`/mous/${id}`, request.url)
  url.searchParams.set('created', '1')
  return NextResponse.redirect(url, { status: 303 })
}
