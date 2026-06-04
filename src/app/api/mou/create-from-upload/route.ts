/*
 * POST /api/mou/create-from-upload (Step 2, Pranav Finance/Ops review).
 *
 * The new PRIMARY MOU creation path: Finance enters a SIGNED MOU (upload
 * the signed document + metadata + Save). Replaces the hidden draft
 * wizard. Creates an Active MOU directly via mouRepo.create and stamps
 * opsReviewStatus='Pending for review' so it immediately surfaces to Ops
 * for product assignment + dispatch alignment (the two-process model).
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
import type { AuditEntry, MOU, Programme } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'

const SIGNED_DIR = path.join(process.cwd(), 'public', 'signed-mous')
const PROGRAMMES: Programme[] = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics']
const PROG_CODE: Record<Programme, string> = {
  STEAM: 'STEAM', 'Young Pioneers': 'YP', 'Harvard HBPE': 'HBPE', Robotics: 'ROBO',
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function fyTag(academicYear: string): string {
  // '2026-27' -> '2627'
  const m = academicYear.match(/(\d{2})\d{2}-(\d{2})/)
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

function back(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL('/mous/upload', request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/mous/upload')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canEditFinanceData(user)) return back(request, { error: 'permission' })

  let form: FormData
  try { form = await request.formData() } catch { return back(request, { error: 'invalid-form' }) }

  const schoolId = String(form.get('schoolId') ?? '').trim()
  const programme = String(form.get('programme') ?? '') as Programme
  const academicYear = String(form.get('academicYear') ?? '').trim()
  const students = Number(form.get('students'))
  const pricePerStudent = Number(form.get('pricePerStudent'))
  const signDate = String(form.get('signDate') ?? '').trim()
  const file = form.get('file')

  if (!schoolId) return back(request, { error: 'missing-school' })
  const school = (await schoolRepo.findAll()).find((s) => s.id === schoolId)
  if (!school) return back(request, { error: 'school-not-found' })
  const schoolName = school.name
  if (!PROGRAMMES.includes(programme)) return back(request, { error: 'invalid-programme' })
  if (!/^\d{4}-\d{2}$/.test(academicYear)) return back(request, { error: 'invalid-year' })
  if (!Number.isFinite(students) || students <= 0) return back(request, { error: 'invalid-students' })
  if (!Number.isFinite(pricePerStudent) || pricePerStudent <= 0) return back(request, { error: 'invalid-price' })
  if (signDate && !ISO_DATE_RE.test(signDate)) return back(request, { error: 'invalid-date' })

  const all = await mouRepo.findAll()
  const id = mintId(all, programme, academicYear)
  const contractValue = Math.round(students * pricePerStudent)
  const ts = new Date().toISOString()

  // Optional signed-PDF store (best-effort; metadata persists regardless).
  let signedMouPdfPath: string | null = null
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext !== 'pdf') return back(request, { error: 'pdf-only' })
    if (file.size > 10 * 1024 * 1024) return back(request, { error: 'too-large' })
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
    after: { id, status: 'Active', opsReviewStatus: 'Pending for review', signedMouPdfPath },
    notes: 'Signed MOU entered via upload+save (Finance). Pending Ops review.',
  }

  const mou: MOU = {
    id,
    schoolId,
    schoolName,
    programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear,
    effectiveDate: signDate || null,
    startDate: signDate || '',
    endDate: '',
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
    salesPersonId: '',
    templateVersion: '',
    generatedAt: ts,
    notes: '',
    delayNotes: null,
    daysToExpiry: null,
    salesChannel: null,
    schoolCrmId: null,
    signedMouPdfPath,
    importNotes: null,
    productSelection: null,
    products: null,
    opsReviewStatus: 'Pending for review',
    gradewiseDistribution: null,
    paymentSchedule: '',
    paymentSchedules: null,
    yearlyPricing: null,
    billingBlock: null,
    draftVariables: null,
    studentCountEventIds: [],
    auditLog: [audit],
  }

  try {
    await mouRepo.create(mou, { queuedBy: user.id })
  } catch (e) {
    return back(request, { error: 'save-failed', detail: e instanceof Error ? e.message : 'create failed' })
  }

  const url = new URL(`/mous/${id}`, request.url)
  url.searchParams.set('created', '1')
  return NextResponse.redirect(url, { status: 303 })
}
