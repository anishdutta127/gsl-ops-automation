/*
 * Workflow handoff state (Gate 4 Step 4).
 *
 * For any given MOU + its underlying entities, computes:
 *   1. The next-expected action
 *   2. Which department owns it
 *   3. Whether a reminder is appropriate (based on time-since-stall
 *      thresholds drawn from Misba's spec)
 *
 * The "Next action" banner on entity detail pages reads this state and
 * renders a one-line copy + CTA. The 'Send reminder' affordance emits
 * an in-app Notification to the responsible user (gated by a per-entity
 * per-day cooldown captured in the audit log).
 *
 * Pure compute. No I/O. The reminder cooldown check takes the most
 * recent reminder timestamp as input.
 */

import type {
  KitDispatch,
  MOU,
  Payment,
} from '@/lib/types'
import { computeStage, type LifecycleStage } from './statusTracker'

export type WorkflowOwner = 'sales' | 'ops' | 'finance' | 'leadership'

export interface WorkflowBanner {
  /** Stage that drove this banner (current MOU stage). */
  currentStage: LifecycleStage
  /** Short headline rendered as the banner title. */
  headline: string
  /** One-sentence description of what is expected next. */
  body: string
  owner: WorkflowOwner
  /** Optional name of the person to ping; null = department-wide. */
  ownerLabel: string | null
  /** Path to drill into the relevant form / view. */
  cta: { label: string; href: string } | null
  /** True when sending a reminder is reasonable for this stage. */
  reminderEligible: boolean
  /** When eligible, the in-app notification copy passed to broadcast. */
  reminderTemplate: { title: string; body: string } | null
}

export interface ComputeWorkflowArgs {
  mou: MOU
  payments: Payment[]
  dispatches: KitDispatch[]
  now: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeWorkflowState(args: ComputeWorkflowArgs): WorkflowBanner | null {
  const { mou, payments, dispatches, now } = args
  const stage = computeStage({ mou, payments, dispatches, now })
  const nowMs = now.getTime()

  // Stage 2: MOU uploaded, grade-wise data not yet captured.
  if (stage === 'mou-uploaded') {
    return {
      currentStage: stage,
      headline: 'Awaiting grade-wise distribution',
      body: 'Sales should fill the grade-wise student split, or Ops can fill if Sales is unavailable.',
      owner: 'sales',
      ownerLabel: null,
      cta: { label: 'Capture grade-wise data', href: `/mous/${mou.id}/intake` },
      reminderEligible: true,
      reminderTemplate: {
        title: `Action needed: grade-wise data for ${mou.schoolName}`,
        body: `${mou.id}: please capture the grade-wise student split so dispatch can proceed.`,
      },
    }
  }

  // Stage 3: active (actuals captured) but no payment activity yet.
  if (stage === 'active') {
    return {
      currentStage: stage,
      headline: 'Awaiting installment schedule activity',
      body: 'Finance should pick up the next installment for PI generation.',
      owner: 'finance',
      ownerLabel: null,
      cta: { label: 'Open installments', href: `/mous/${mou.id}/installments` },
      reminderEligible: false,
      reminderTemplate: null,
    }
  }

  // Stage 4: payment due / overdue with no PI.
  if (stage === 'payment-pending') {
    const overdue = payments.some((p) => {
      if (p.status === 'Paid' || p.status === 'Received') return false
      if (!p.dueDateIso) return false
      return new Date(p.dueDateIso).getTime() < nowMs
    })
    return {
      currentStage: stage,
      headline: overdue ? 'PI overdue' : 'PI generation due soon',
      body: overdue
        ? 'A payment is past due; raise the proforma invoice so payment chase can begin.'
        : 'A payment is due within 30 days; raise the proforma invoice in advance.',
      owner: 'finance',
      ownerLabel: null,
      cta: {
        label: 'Open pending PIs',
        href: '/finance/pi/pending',
      },
      reminderEligible: overdue,
      reminderTemplate: overdue
        ? {
            title: `PI overdue: ${mou.schoolName}`,
            body: `${mou.id}: payment is past due. Raise the proforma invoice today.`,
          }
        : null,
    }
  }

  // Stage 6: PI generated, payment still pending.
  if (stage === 'pi-generated') {
    const piPayment = payments.find((p) => p.piGeneratedAt !== null)
    if (
      piPayment
      && piPayment.status !== 'Paid'
      && piPayment.status !== 'Received'
      && piPayment.piGeneratedAt
    ) {
      const ageDays = Math.floor((nowMs - new Date(piPayment.piGeneratedAt).getTime()) / DAY_MS)
      const overdueWindow = ageDays >= 30
      return {
        currentStage: stage,
        headline: overdueWindow ? 'Payment overdue 30+ days' : 'Awaiting payment',
        body: overdueWindow
          ? 'PI raised more than 30 days ago with no receipt. Consider escalating with the school SPOC.'
          : `PI was raised ${ageDays} days ago. Track payment receipt with the school SPOC.`,
        owner: 'sales',
        ownerLabel: null,
        cta: { label: 'View school SPOC', href: `/schools/${mou.schoolId}` },
        reminderEligible: overdueWindow,
        reminderTemplate: overdueWindow
          ? {
              title: `Payment overdue: ${mou.schoolName}`,
              body: `${mou.id}: PI raised ${ageDays} days ago; consider follow-up.`,
            }
          : null,
      }
    }
  }

  // Stage 7: dispatch requested but not yet Sales-approved.
  if (stage === 'dispatch-requested') {
    const oldestUnapproved = dispatches
      .filter((d) => d.salesApprovalStatus === 'Pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (oldestUnapproved) {
      const ageHours = Math.floor((nowMs - new Date(oldestUnapproved.createdAt).getTime()) / (60 * 60 * 1000))
      const reminderEligible = ageHours >= 24
      return {
        currentStage: stage,
        headline: reminderEligible
          ? 'Awaiting Sales approval (24h+)'
          : 'Awaiting Sales approval',
        body: 'Ops has allocated kits. Sales review is required before Finance can execute the dispatch.',
        owner: 'sales',
        ownerLabel: null,
        cta: {
          label: 'Open dispatch',
          href: `/dispatch/kits/${mou.id}`,
        },
        reminderEligible,
        reminderTemplate: reminderEligible
          ? {
              title: `Dispatch approval pending: ${mou.schoolName}`,
              body: `${mou.id}: kits allocated ${ageHours}h ago; awaiting Sales approval.`,
            }
          : null,
      }
    }
  }

  // Stage 8: shipment in progress; no banner unless overdue (carried by
  // attention items separately).
  if (stage === 'shipment-in-progress') {
    return {
      currentStage: stage,
      headline: 'Shipment in transit',
      body: 'Track POD upload once the school receives the kits.',
      owner: 'ops',
      ownerLabel: null,
      cta: { label: 'View dispatch', href: `/dispatch/kits/${mou.id}` },
      reminderEligible: false,
      reminderTemplate: null,
    }
  }

  // Stage 9: delivered, awaiting MOU closure.
  if (stage === 'delivered') {
    return {
      currentStage: stage,
      headline: 'Awaiting course closure',
      body: 'All dispatches are delivered. Confirm course completion and final-installment receipt to close the MOU.',
      owner: 'ops',
      ownerLabel: null,
      cta: { label: 'View MOU detail', href: `/mous/${mou.id}` },
      reminderEligible: false,
      reminderTemplate: null,
    }
  }

  // Pipeline / installment-1-received / closed: no handoff banner today.
  return null
}

/**
 * Returns true when the previous reminder timestamp (if any) was sent
 * more than 24h ago. The reminder cooldown lives in the entity's
 * auditLog so it survives queue replay.
 */
export function canSendReminder(args: {
  lastReminderAt: string | null
  now: Date
  cooldownMs?: number
}): boolean {
  const cooldownMs = args.cooldownMs ?? DAY_MS
  if (!args.lastReminderAt) return true
  const last = new Date(args.lastReminderAt).getTime()
  if (Number.isNaN(last)) return true
  return args.now.getTime() - last >= cooldownMs
}
