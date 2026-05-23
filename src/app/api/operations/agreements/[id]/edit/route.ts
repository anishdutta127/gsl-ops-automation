/*
 * POST /api/operations/agreements/[id]/edit
 *
 * Update an Agreement record. Finance / Admin only. Phase 1 is a
 * full-record replace queue write; the drain reconciles by id and
 * writes the merged record back to agreements.json. daysToExpiry
 * is recomputed by the drain because the canonical anchor is
 * endDate vs today (not stored on write).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import type {
  Agreement,
  AgreementCustody,
  AgreementType,
  AuditEntry,
} from '@/lib/types'
import { agreementRepo } from '@/lib/db/repos/leafRepos'

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function parseType(v: unknown): AgreementType | null {
  return v === 'Vendor' || v === 'NDA' ? v : null
}

function parseCustody(v: unknown): AgreementCustody | null {
  return v === 'Physical' || v === 'Digital' ? v : null
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can edit agreements.' },
      { status: 403 },
    )
  }
  const existing = await agreementRepo.findById(id)
  if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const type = parseType(body.type) ?? existing.type
  const partyName =
    typeof body.partyName === 'string' ? body.partyName.trim() : ''
  const natureOfAgreement =
    typeof body.natureOfAgreement === 'string'
      ? body.natureOfAgreement.trim()
      : ''
  const startDate = typeof body.startDate === 'string' ? body.startDate : ''
  if (!partyName) {
    return NextResponse.json(
      { error: 'missing-party', message: 'Party name required.' },
      { status: 400 },
    )
  }
  if (!natureOfAgreement) {
    return NextResponse.json(
      { error: 'missing-nature', message: 'Nature of agreement required.' },
      { status: 400 },
    )
  }
  if (!startDate) {
    return NextResponse.json(
      { error: 'missing-start', message: 'Start date required.' },
      { status: 400 },
    )
  }

  const endDate = asStringOrNull(body.endDate)
  // Full Agreement record (including id) so the drain's
  // applyOneToList replaces by id. The Gate 5A.5 fix moved away from
  // the { agreementId, agreement, audit } wrapper which left payload.id
  // undefined and silently dropped the write.
  const nextWithoutAudit: Agreement = {
    ...existing,
    type,
    partyName,
    vendorId: asStringOrNull(body.vendorId),
    natureOfAgreement,
    product: asStringOrNull(body.product),
    department: asStringOrNull(body.department),
    keyTerms: asStringOrNull(body.keyTerms),
    startDate,
    endDate,
    tenure: asStringOrNull(body.tenure),
    noticePeriod: asStringOrNull(body.noticePeriod),
    vendorLocation: asStringOrNull(body.vendorLocation),
    physicalCustody: parseCustody(body.physicalCustody),
    documentUrl: asStringOrNull(body.documentUrl),
    // daysToExpiry left to the drain; recomputed on apply.
    auditLog: existing.auditLog ?? [],
  }
  const auditEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    user: user.id,
    action: 'update',
    before: existing as unknown as Record<string, unknown>,
    after: nextWithoutAudit as unknown as Record<string, unknown>,
    notes: `Agreement ${existing.id} updated.`,
  }
  // ATOMIC PATTERN (Part 5.B Priority 1 part 2): partial-update on
  // scalar fields + JSONB || concat for audit_log. Two parallel
  // operators no longer race on the audit_log array.
  const patch: Partial<Agreement> = {
    type, partyName,
    vendorId: nextWithoutAudit.vendorId,
    natureOfAgreement,
    product: nextWithoutAudit.product,
    department: nextWithoutAudit.department,
    keyTerms: nextWithoutAudit.keyTerms,
    startDate, endDate,
    tenure: nextWithoutAudit.tenure,
    noticePeriod: nextWithoutAudit.noticePeriod,
    vendorLocation: nextWithoutAudit.vendorLocation,
    physicalCustody: nextWithoutAudit.physicalCustody,
    documentUrl: nextWithoutAudit.documentUrl,
  }

  try {
    await agreementRepo.updateWithAudit(existing.id, patch, auditEntry, {
      queuedBy: user.id,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error ? e.message : 'Failed to queue the edit. Retry.',
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
