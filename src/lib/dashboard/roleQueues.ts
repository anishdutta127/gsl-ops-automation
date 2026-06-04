/*
 * Step 3 role priority-queues. Pure functions that turn existing data
 * (MOUs, payments, kit dispatches, welcome notes) into the 4-5 priority
 * tiles each role sees daily - "only the four or five most priority
 * information for that department, not cluttered with 10". Views, not new
 * state: they READ Step 1 products[] + Step 2 opsReviewStatus and the
 * existing payment/dispatch status, never pricing/PI logic.
 *
 * Each tile carries its own filtered item list; the dashboard renders the
 * tiles + the active tile's list, nothing more.
 */

import type { KitDispatch, MOU, Payment, WelcomeNote } from '@/lib/types'

export type TileTone = 'alert' | 'attention' | 'navy' | 'neutral' | 'ok'

export interface QueueItem {
  mouId: string
  schoolName: string
  programme: string
  academicYear: string
  meta: string
  href: string
}

export interface QueueTile {
  key: string
  label: string
  count: number
  tone: TileTone
  /** Lower = more urgent (waiting-on-you / overdue first). */
  urgency: number
  hint: string
  items: QueueItem[]
}

const DUE_STATUSES = new Set(['Pending', 'Overdue', 'Due Soon', 'PI Sent'])

function rs(n: number): string {
  return 'Rs ' + Math.round(n).toLocaleString('en-IN')
}
function baseItem(m: MOU): Omit<QueueItem, 'meta' | 'href'> {
  return { mouId: m.id, schoolName: m.schoolName, programme: m.programme, academicYear: m.academicYear ?? '' }
}
function sortTiles(tiles: QueueTile[]): QueueTile[] {
  // Urgency-ordered (waiting-on-you first), then by count desc.
  return [...tiles].sort((a, b) => a.urgency - b.urgency || b.count - a.count)
}

export function computeOpsQueue(args: {
  mous: MOU[]
  kitDispatches: KitDispatch[]
  welcomeNotes: WelcomeNote[]
  now?: Date
}): QueueTile[] {
  const { mous, kitDispatches, welcomeNotes } = args
  const sentWelcome = new Set(welcomeNotes.filter((w) => w.status === 'sent').map((w) => w.mouId))

  const awaitingReview = mous.filter((m) => m.opsReviewStatus === 'Pending for review')
  // "Welcome pending": active, signed MOUs the school hasn't been welcomed for.
  const welcomePending = mous.filter((m) => m.status === 'Active' && !sentWelcome.has(m.id))
  const readyToDispatch = kitDispatches.filter(
    (k) => k.salesApprovalStatus === 'Approved'
      && (k.dispatchStatus === 'Not Started' || k.dispatchStatus === 'Pending'),
  )
  const inTransit = kitDispatches.filter((k) => k.dispatchStatus === 'In Transit')
  const mouById = new Map(mous.map((m) => [m.id, m]))

  return sortTiles([
    {
      key: 'awaiting-review', label: 'Awaiting review', tone: 'attention', urgency: 1,
      hint: 'Finance entered these; assign products + align dispatch.',
      count: awaitingReview.length,
      items: awaitingReview.map((m) => ({ ...baseItem(m), meta: m.opsReviewStatus ?? '', href: `/operations/review/${m.id}` })),
    },
    {
      key: 'ready-to-dispatch', label: 'Ready to dispatch', tone: 'navy', urgency: 2,
      hint: 'Allocations approved, awaiting dispatch.',
      count: readyToDispatch.length,
      items: readyToDispatch
        .map((k) => mouById.get(k.mouId))
        .filter((m): m is MOU => !!m)
        .map((m) => ({ ...baseItem(m), meta: 'approved', href: `/dispatch/kits/${m.id}` })),
    },
    {
      key: 'in-transit', label: 'In transit', tone: 'neutral', urgency: 3,
      hint: 'Dispatched, awaiting delivery confirmation.',
      count: inTransit.length,
      items: inTransit
        .map((k) => mouById.get(k.mouId))
        .filter((m): m is MOU => !!m)
        .map((m) => ({ ...baseItem(m), meta: 'in transit', href: `/dispatch/kits/${m.id}` })),
    },
    {
      key: 'welcome-pending', label: 'Welcome pending', tone: 'ok', urgency: 4,
      hint: 'Send the school its welcome note.',
      count: welcomePending.length,
      items: welcomePending.map((m) => ({ ...baseItem(m), meta: `${m.studentsMou ?? 0} students`, href: `/operations/welcome/${m.id}` })),
    },
  ])
}

export function computeFinanceQueue(args: {
  mous: MOU[]
  payments: Payment[]
  now?: Date
}): QueueTile[] {
  const { mous, payments } = args
  const activeMous = mous.filter((m) => m.status === 'Active')
  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of payments) {
    const list = paymentsByMou.get(p.mouId) ?? []
    list.push(p)
    paymentsByMou.set(p.mouId, list)
  }

  // Awaiting setup: active MOU with no instalments yet.
  const awaitingSetup = activeMous.filter((m) => (paymentsByMou.get(m.id)?.length ?? 0) === 0)

  // Awaiting payment: MOUs with >=1 due/overdue instalment. One row per MOU.
  const awaitingPayment: QueueItem[] = []
  let dueInstalmentCount = 0
  for (const m of activeMous) {
    const due = (paymentsByMou.get(m.id) ?? []).filter((p) => DUE_STATUSES.has(p.status))
    if (due.length === 0) continue
    dueInstalmentCount += due.length
    const overdue = due.some((p) => p.status === 'Overdue')
    const totalDue = due.reduce((s, p) => s + (p.expectedAmount - (p.receivedAmount ?? 0)), 0)
    awaitingPayment.push({
      ...baseItem(m),
      meta: `${due.length} due${overdue ? ' (overdue)' : ''} · ${rs(totalDue)}`,
      href: `/mous/${m.id}/installments`,
    })
  }
  // Overdue MOUs first within the list.
  awaitingPayment.sort((a, b) => Number(b.meta.includes('overdue')) - Number(a.meta.includes('overdue')))

  const dispatchRequests = mous.filter((m) => m.opsReviewStatus === 'Submitted to Finance')
  const pisToChase = activeMous.filter((m) => (paymentsByMou.get(m.id) ?? []).some((p) => p.status === 'PI Sent'))

  return sortTiles([
    {
      key: 'awaiting-payment', label: 'Awaiting payment', tone: 'alert', urgency: 1,
      hint: `${dueInstalmentCount} instalment(s) due/overdue across these MOUs.`,
      count: awaitingPayment.length,
      items: awaitingPayment,
    },
    {
      key: 'dispatch-requests', label: 'Dispatch requests', tone: 'attention', urgency: 1,
      hint: 'Ops submitted these for dispatch; raise the Delivery Note.',
      count: dispatchRequests.length,
      items: dispatchRequests.map((m) => ({ ...baseItem(m), meta: 'submitted by Ops', href: '/finance/dispatch-requests' })),
    },
    {
      key: 'awaiting-setup', label: 'Awaiting setup', tone: 'navy', urgency: 2,
      hint: 'Active MOUs with no instalment plan yet.',
      count: awaitingSetup.length,
      items: awaitingSetup.map((m) => ({ ...baseItem(m), meta: `${rs(m.contractValue ?? 0)} contract`, href: `/mous/${m.id}/installments` })),
    },
    {
      key: 'pis-to-chase', label: 'PIs to chase', tone: 'ok', urgency: 3,
      hint: 'PI sent, payment not yet received.',
      count: pisToChase.length,
      items: pisToChase.map((m) => ({ ...baseItem(m), meta: 'PI sent', href: `/mous/${m.id}/installments` })),
    },
  ])
}
