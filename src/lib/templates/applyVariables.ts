/*
 * W4-I.5 Phase 3: variable substitution for CommunicationTemplate.
 *
 * Resolves {{variableName}} placeholders against an entity context.
 * Reuses the regex pattern from composeThankYou.ts (handlebars-style)
 * but extends:
 *   1. Variable availability differs by useCase: a payment-reminder
 *      template has access to instalmentLabel + piNumber that a welcome
 *      template does not.
 *   2. Missing variables render as `[VARIABLE NAME]` (uppercase
 *      placeholder) instead of leaving the literal {{name}}. This
 *      matches the Phase 3 spec ("operator notices and fills manually").
 *
 * Pure functions; no I/O. Callers compose the context from JSON
 * fixture reads outside this module.
 */

import type {
  Dispatch,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
  TemplateUseCase,
  User,
} from '@/lib/types'

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g
const D_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
})

export interface VariableContext {
  mou?: MOU | null
  school?: School | null
  intake?: IntakeRecord | null
  dispatch?: Dispatch | null
  payment?: Payment | null
  salesOwner?: SalesPerson | null
  sender?: User | null
  /** Optional now() override for tests; defaults to new Date(). */
  now?: Date
}

/**
 * Variables that the launcher form should expose for each useCase.
 * The set is the union of fields that resolveVariables can fill from
 * the provided context. A custom-useCase template has access to the
 * full union; targeted templates expose only the relevant slice so
 * the variable picker UI does not overwhelm the operator.
 */
export const VARIABLES_BY_USE_CASE: Record<TemplateUseCase, string[]> = {
  welcome: [
    'recipientName', 'recipientDesignation', 'schoolName', 'programme',
    'salesOwnerName', 'signedMouUrl', 'senderName', 'currentDate',
  ],
  'thank-you': [
    'recipientName', 'recipientDesignation', 'schoolName', 'programme',
    'durationYears', 'startDate', 'endDate', 'salesOwnerName',
    'signedMouUrl', 'senderName', 'currentDate',
  ],
  'follow-up': [
    'recipientName', 'schoolName', 'programme', 'salesOwnerName',
    'senderName', 'currentDate',
  ],
  'payment-reminder': [
    'recipientName', 'schoolName', 'programme', 'instalmentLabel',
    'expectedAmount', 'piNumber', 'senderName', 'currentDate',
  ],
  'dispatch-confirmation': [
    'recipientName', 'schoolName', 'programme', 'dispatchId',
    'dispatchedAt', 'expectedDelivery', 'senderName', 'currentDate',
  ],
  'feedback-request': [
    'recipientName', 'schoolName', 'programme', 'instalmentSeq',
    'feedbackUrl', 'salesOwnerName', 'senderName', 'currentDate',
  ],
  custom: [
    'recipientName', 'recipientDesignation', 'schoolName', 'programme',
    'durationYears', 'startDate', 'endDate', 'salesOwnerName',
    'signedMouUrl', 'instalmentLabel', 'expectedAmount', 'piNumber',
    'dispatchId', 'dispatchedAt', 'expectedDelivery', 'instalmentSeq',
    'feedbackUrl', 'senderName', 'currentDate',
  ],
}

export function availableVariablesFor(useCase: TemplateUseCase): string[] {
  return VARIABLES_BY_USE_CASE[useCase] ?? []
}

/**
 * Build the values dict from the context. Variables not derivable
 * from the context return undefined (which the placeholder fallback
 * surfaces as [VARIABLE NAME]).
 */
export function buildVariableValues(
  ctx: VariableContext,
): Record<string, string | undefined> {
  const now = ctx.now ?? new Date()
  const expectedDelivery = ctx.dispatch?.dispatchedAt
    ? new Date(new Date(ctx.dispatch.dispatchedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10)
    : undefined

  return {
    recipientName: ctx.intake?.recipientName ?? ctx.school?.contactPerson ?? undefined,
    recipientDesignation: ctx.intake?.recipientDesignation ?? undefined,
    schoolName: ctx.school?.name ?? ctx.mou?.schoolName ?? undefined,
    programme: ctx.mou?.programme ?? undefined,
    durationYears: ctx.intake?.durationYears !== undefined
      ? String(ctx.intake.durationYears)
      : undefined,
    startDate: ctx.intake?.startDate ?? ctx.mou?.startDate ?? undefined,
    endDate: ctx.intake?.endDate ?? ctx.mou?.endDate ?? undefined,
    salesOwnerName: ctx.salesOwner?.name ?? undefined,
    signedMouUrl: ctx.intake?.signedMouUrl ?? undefined,
    senderName: ctx.sender?.name ?? undefined,
    currentDate: D_MONTH_YEAR.format(now),
    instalmentLabel: ctx.payment?.instalmentLabel ?? undefined,
    expectedAmount: ctx.payment?.expectedAmount !== undefined
      ? RUPEES.format(ctx.payment.expectedAmount)
      : undefined,
    piNumber: ctx.payment?.piNumber ?? undefined,
    dispatchId: ctx.dispatch?.id ?? undefined,
    dispatchedAt: ctx.dispatch?.dispatchedAt
      ? ctx.dispatch.dispatchedAt.slice(0, 10)
      : undefined,
    expectedDelivery,
    instalmentSeq: ctx.dispatch?.installmentSeq !== undefined
      ? String(ctx.dispatch.installmentSeq)
      : undefined,
    feedbackUrl: undefined,  // populated by feedback-request flow with magic link
  }
}

/**
 * Convert a camelCase variable name to BRACKETED PLACEHOLDER style.
 * `recipientName` -> `[RECIPIENT NAME]`
 */
export function placeholderFor(name: string): string {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
  return `[${spaced}]`
}

export interface ApplyVariablesResult {
  rendered: string
  /** Variable names that resolved cleanly to a non-empty value. */
  filled: string[]
  /** Variable names that fell back to [PLACEHOLDER] (missing in context). */
  missing: string[]
}

/**
 * Resolve {{variableName}} placeholders in `template`. Missing
 * variables render as [VARIABLE NAME] (uppercase, space-separated)
 * so the operator notices and edits before sending.
 */
export function applyVariables(
  template: string,
  ctx: VariableContext,
): ApplyVariablesResult {
  const values = buildVariableValues(ctx)
  const filled = new Set<string>()
  const missing = new Set<string>()
  const rendered = template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const v = values[key]
    if (typeof v === 'string' && v !== '') {
      filled.add(key)
      return v
    }
    missing.add(key)
    return placeholderFor(key)
  })
  return {
    rendered,
    filled: Array.from(filled),
    missing: Array.from(missing),
  }
}
