/*
 * POST /api/mou/installments/edit (Gate 5A.6 Step 4).
 *
 * Edit a single instalment's due date, expected amount, and notes.
 * Two paths:
 *   - PI not yet issued (piNumber === null): enqueue a normal Payment
 *     update with the new fields.
 *   - PI issued: preserve the existing expectedAmount on the Payment
 *     row; create an Adjustment record capturing the delta (so the
 *     audit trail keeps the original PI number intact). The
 *     Adjustment is queued via the same drain channel as everything
 *     else; entityWriters.appendAdjustments() is a synchronous-write
 *     helper used outside the queue, so we go through enqueueUpdate
 *     here to stay consistent with the rest of the codebase.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { Adjustment, AuditEntry, Payment } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const paymentId = String(form.get('paymentId') ?? '')
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set(
      'next',
      mouId && paymentId
        ? `/mous/${mouId}/installments/${paymentId}/edit`
        : '/',
    )
    return NextResponse.redirect(url, { status: 303 })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId && paymentId
        ? `/mous/${mouId}/installments/${paymentId}/edit`
        : `/mous/${mouId || ''}/installments`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditFinanceData(user)) return errorTo('permission')
  if (!mouId || !paymentId) return errorTo('payment-not-found')

  const payment = await paymentRepo.findById(paymentId)
  if (!payment || payment.mouId !== mouId) return errorTo('payment-not-found')

  const dueDateIso = String(form.get('dueDateIso') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateIso)) return errorTo('invalid-date')
  const expectedAmount = Number(String(form.get('expectedAmount') ?? ''))
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return errorTo('invalid-amount')
  }
  const notesRaw = String(form.get('notes') ?? '').trim()
  const notes = notesRaw === '' ? null : notesRaw

  const piIssued = payment.piNumber !== null
  const ts = new Date().toISOString()

  try {
    if (piIssued && Math.abs(expectedAmount - payment.expectedAmount) > 0.01) {
      // Preserve the original expectedAmount; queue an Adjustment.
      const mou = await mouRepo.findById(mouId)
      const schoolId = mou?.schoolId ?? ''
      const adjustment: Adjustment = {
        id: `ADJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        mouId,
        schoolId,
        triggeredByEvent: 'manual',
        triggeredAt: ts,
        triggeredBy: user.id,
        originalInstallmentId: payment.id,
        appliedToInstallmentId: null,
        amountDelta: expectedAmount - payment.expectedAmount,
        reason: notes ?? 'Manual edit of installment after PI issued',
        beforeAmount: payment.expectedAmount,
        afterAmount: expectedAmount,
        status: 'Active',
      }
      await enqueueUpdate({
        queuedBy: user.id,
        entity: 'adjustment',
        operation: 'create',
        payload: adjustment as unknown as Record<string, unknown>,
      })
      // Still update due date + notes on the payment row (the
      // expectedAmount stays at the PI-issued value).
      const auditEntry: AuditEntry = {
        timestamp: ts,
        user: user.id,
        action: 'update',
        before: {
          dueDateIso: payment.dueDateIso,
          notes: payment.notes,
        },
        after: {
          dueDateIso,
          notes,
        },
        notes: `Edit instalment ${payment.id} after PI ${payment.piNumber} issued; expectedAmount delta captured on Adjustment ${adjustment.id}.`,
      }
      const updated: Payment = {
        ...payment,
        dueDateIso,
        notes,
        auditLog: [...(payment.auditLog ?? []), auditEntry],
      }
      await enqueueUpdate({
        queuedBy: user.id,
        entity: 'payment',
        operation: 'update',
        payload: updated as unknown as Record<string, unknown>,
      })
    } else {
      // No PI: normal in-place update.
      const auditEntry: AuditEntry = {
        timestamp: ts,
        user: user.id,
        action: 'update',
        before: {
          dueDateIso: payment.dueDateIso,
          expectedAmount: payment.expectedAmount,
          notes: payment.notes,
        },
        after: {
          dueDateIso,
          expectedAmount,
          notes,
        },
        notes: 'Manual edit of instalment (no PI issued).',
      }
      const updated: Payment = {
        ...payment,
        dueDateIso,
        expectedAmount,
        notes,
        auditLog: [...(payment.auditLog ?? []), auditEntry],
      }
      await enqueueUpdate({
        queuedBy: user.id,
        entity: 'payment',
        operation: 'update',
        payload: updated as unknown as Record<string, unknown>,
      })
    }
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL(`/mous/${mouId}/installments`, request.url)
  url.searchParams.set('edited', paymentId)
  return NextResponse.redirect(url, { status: 303 })
}
