/*
 * POST /api/operations/agreements/create (Gate 5A.6 Step 12).
 *
 * Create an Agreement row. When renewedFrom is supplied:
 *   - the new agreement keynotes "Renews AGR-XXX" in notes context
 *     (carried via initialNotes form field from the form);
 *   - the source agreement gets a 'renewed by AGR-YYY' audit entry
 *     enqueued as a parallel update.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type {
  Agreement,
  AgreementCustody,
  AgreementType,
  AuditEntry,
} from '@/lib/types'
import { agreementRepo } from '@/lib/db/repos/leafRepos'

function asStringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function parseType(v: unknown): AgreementType | null {
  return v === 'Vendor' || v === 'NDA' ? v : null
}

function parseCustody(v: unknown): AgreementCustody | null {
  if (v === 'Physical' || v === 'Digital') return v
  return null
}

export async function POST(request: Request) {
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const renewedFrom = asStringOrNull(form.get('renewedFrom'))
  const errorTo = (reason: string) => {
    const url = new URL('/operations/agreements/new', request.url)
    if (renewedFrom) url.searchParams.set('renewedFrom', renewedFrom)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canEditFinanceData(user)) return errorTo('permission')

  const type = parseType(form.get('type'))
  if (!type) return errorTo('invalid-type')
  const partyName = String(form.get('partyName') ?? '').trim()
  if (!partyName) return errorTo('missing-party')
  const natureOfAgreement = String(form.get('natureOfAgreement') ?? '').trim()
  if (!natureOfAgreement) return errorTo('missing-nature')
  const startDate = String(form.get('startDate') ?? '').trim()
  if (!startDate) return errorTo('missing-start')

  const custodyRaw = form.get('physicalCustody')
  const physicalCustody = custodyRaw === null || custodyRaw === ''
    ? null
    : parseCustody(custodyRaw)
  if (physicalCustody === null && custodyRaw && custodyRaw !== '') {
    return errorTo('invalid-custody')
  }

  const id = `AGR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const ts = new Date().toISOString()
  const initialNotes = asStringOrNull(form.get('initialNotes'))

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'create',
    after: { id, type, partyName },
    notes: initialNotes ?? `Agreement ${id} created.`,
  }

  const agreement: Agreement = {
    id,
    type,
    partyName,
    vendorId: asStringOrNull(form.get('vendorId')),
    natureOfAgreement,
    product: asStringOrNull(form.get('product')),
    department: asStringOrNull(form.get('department')),
    keyTerms: asStringOrNull(form.get('keyTerms')),
    startDate,
    endDate: asStringOrNull(form.get('endDate')),
    tenure: asStringOrNull(form.get('tenure')),
    noticePeriod: asStringOrNull(form.get('noticePeriod')),
    vendorLocation: asStringOrNull(form.get('vendorLocation')),
    physicalCustody,
    documentUrl: asStringOrNull(form.get('documentUrl')),
    daysToExpiry: null,
    auditLog: [auditEntry],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'agreement',
      operation: 'create',
      payload: agreement as unknown as Record<string, unknown>,
    })

    // Renewal-link audit: append a 'renewed by ${id}' entry on the
    // source via a queue update (full-record replacement).
    if (renewedFrom) {
      const source = await agreementRepo.findById(renewedFrom)
      if (source) {
        const sourceAudit: AuditEntry = {
          timestamp: ts,
          user: user.id,
          action: 'update',
          notes: `Renewed by ${id}.`,
        }
        const sourceNext: Agreement = {
          ...source,
          auditLog: [...(source.auditLog ?? []), sourceAudit],
        }
        await enqueueUpdate({
          queuedBy: user.id,
          entity: 'agreement',
          operation: 'update',
          payload: sourceNext as unknown as Record<string, unknown>,
        })
      }
    }
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL(`/operations/agreements/${id}`, request.url)
  url.searchParams.set('created', '1')
  return NextResponse.redirect(url, { status: 303 })
}
