/*
 * POST /api/mou/[mouId]/edit (Gate 5A.6 Step 9).
 *
 * Post-sign MOU field edits. Permission split:
 *   - Sales + Admin (canEditMOU): trainerModel, productSelection,
 *     importNotes (acquisition status free-text)
 *   - Admin only (role === 'Admin' with department null): schoolId,
 *     programme, programmeSubType, effectiveDate, endDate, startDate
 *
 * The route accepts ALL fields and applies only those the caller has
 * permission for. Rejected fields are reported back via ?warnings=...
 * so the form can show which edits failed silently.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import type {
  AuditEntry,
  MOU,
  Programme,
  TrainerModel,
  User,
} from '@/lib/types'
import type { ProductSelection } from '@/lib/mouSystem/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as Array<{ id: string; name: string }>
const allUsers = usersJson as unknown as User[]

const VALID_PROGRAMMES: Programme[] = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics']
const VALID_TRAINERS: TrainerModel[] = ['Bootcamp', 'GSL-T', 'TT', 'AIQ', 'Other']
const VALID_PRODUCT_SEL: ProductSelection[] = ['TinkRworks', 'Cretile', 'Both']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface RouteContext {
  params: Promise<{ mouId: string }>
}

function isAdminWildcard(u: User): boolean {
  return u.role === 'Admin' && (u.department ?? null) === null
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/edit`)
    return NextResponse.redirect(url, { status: 303 })
  }
  const user = allUsers.find((u) => u.id === session.sub)
  if (!user) return redirectTo(request, mouId, { error: 'unknown-user' })
  if (!canEditMOU(user)) {
    return redirectTo(request, mouId, { error: 'permission' })
  }
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou) return redirectTo(request, mouId, { error: 'mou-not-found' })

  const form = await request.formData()
  const isAdmin = isAdminWildcard(user)

  const patch: Partial<MOU> = {}
  const warnings: string[] = []

  // -- Sales + Admin editable --
  const trainerModelRaw = String(form.get('trainerModel') ?? '').trim()
  if (trainerModelRaw !== '' && VALID_TRAINERS.includes(trainerModelRaw as TrainerModel)) {
    patch.trainerModel = trainerModelRaw as TrainerModel
  } else if (trainerModelRaw === 'null') {
    patch.trainerModel = null
  }

  const productSelectionRaw = String(form.get('productSelection') ?? '').trim()
  if (productSelectionRaw !== '' && VALID_PRODUCT_SEL.includes(productSelectionRaw as ProductSelection)) {
    patch.productSelection = productSelectionRaw as ProductSelection
  } else if (productSelectionRaw === 'null') {
    patch.productSelection = null
  }

  const importNotesRaw = form.get('importNotes')
  if (typeof importNotesRaw === 'string') {
    patch.importNotes = importNotesRaw.trim() === '' ? null : importNotesRaw.trim()
  }

  const notesRaw = form.get('notes')
  if (typeof notesRaw === 'string') {
    patch.notes = notesRaw.trim() === '' ? null : notesRaw.trim()
  }

  // -- Admin only --
  const adminFields: Array<{ key: string; apply: () => void }> = [
    {
      key: 'schoolId',
      apply: () => {
        const raw = String(form.get('schoolId') ?? '').trim()
        if (raw === '' || raw === mou.schoolId) return
        const school = allSchools.find((s) => s.id === raw)
        if (!school) {
          warnings.push('school-not-found')
          return
        }
        patch.schoolId = raw
        patch.schoolName = school.name
      },
    },
    {
      key: 'programme',
      apply: () => {
        const raw = String(form.get('programme') ?? '').trim()
        if (raw === '' || raw === mou.programme) return
        if (!VALID_PROGRAMMES.includes(raw as Programme)) {
          warnings.push('invalid-programme')
          return
        }
        patch.programme = raw as Programme
      },
    },
    {
      key: 'programmeSubType',
      apply: () => {
        const raw = form.get('programmeSubType')
        if (typeof raw !== 'string') return
        const trimmed = raw.trim()
        patch.programmeSubType = trimmed === '' ? null : trimmed
      },
    },
    {
      key: 'effectiveDate',
      apply: () => {
        const raw = String(form.get('effectiveDate') ?? '').trim()
        if (raw === '') return
        if (!ISO_DATE_RE.test(raw)) {
          warnings.push('invalid-effective-date')
          return
        }
        patch.effectiveDate = raw
      },
    },
    {
      key: 'startDate',
      apply: () => {
        const raw = String(form.get('startDate') ?? '').trim()
        if (raw === '') return
        if (!ISO_DATE_RE.test(raw)) {
          warnings.push('invalid-start-date')
          return
        }
        patch.startDate = raw
      },
    },
    {
      key: 'endDate',
      apply: () => {
        const raw = String(form.get('endDate') ?? '').trim()
        if (raw === '') return
        if (!ISO_DATE_RE.test(raw)) {
          warnings.push('invalid-end-date')
          return
        }
        patch.endDate = raw
      },
    },
  ]

  for (const af of adminFields) {
    if (form.get(af.key) === null) continue
    if (!isAdmin) {
      warnings.push(`admin-only:${af.key}`)
      continue
    }
    af.apply()
  }

  if (Object.keys(patch).length === 0) {
    return redirectTo(request, mouId, {
      error: 'no-changes',
      warnings: warnings.join(','),
    })
  }

  const ts = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'update',
    before: Object.fromEntries(
      Object.keys(patch).map((k) => [k, (mou as unknown as Record<string, unknown>)[k] ?? null]),
    ),
    after: Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v ?? null]),
    ),
    notes: `Post-sign edit: ${Object.keys(patch).join(', ')}.`,
  }

  const next: MOU = {
    ...mou,
    ...patch,
    auditLog: [...(mou.auditLog ?? []), audit],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'mou',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return redirectTo(request, mouId, {
      error: 'queue-failure',
      detail: e instanceof Error ? e.message : 'queue failed',
    })
  }

  const params: Record<string, string> = {
    saved: '1',
    fields: Object.keys(patch).join(','),
  }
  if (warnings.length > 0) params.warnings = warnings.join(',')
  return redirectTo(request, mouId, params)
}

function redirectTo(
  request: Request,
  mouId: string,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(`/mous/${mouId}/edit`, request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}
