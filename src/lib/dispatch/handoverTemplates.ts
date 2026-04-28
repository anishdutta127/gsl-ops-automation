/*
 * Handover-worksheet template registry (W4-H.1).
 *
 * Mirrors src/lib/dispatch/templates.ts pattern. The handover worksheet
 * is the school-facing printable form that trainers carry on-site for
 * bilateral sign-off (TRAINER SIGN + PERSON SIGNATURE per detail row).
 *
 * The .docx lives at public/ops-templates/handover-template.docx and
 * is authored via scripts/w4h-author-handover-template.mjs. Until that
 * file exists, generateHandoverWorksheet returns reason
 * 'template-missing'.
 */

export type HandoverPlaceholderType =
  | 'date'
  | 'text'
  | 'loop'
  | 'number'

export type HandoverPlaceholderSource =
  | 'computed.dispatchNumber'
  | 'arg.now'
  | 'mou.id'
  | 'mou.programme'
  | 'school.name'
  | 'school.branch'
  | 'computed.trainerNames'
  | 'computed.detailRows'
  | 'computed.totalQuantity'

export interface HandoverPlaceholderSpec {
  label: string
  type: HandoverPlaceholderType
  required: boolean
  source: HandoverPlaceholderSource
  description?: string
}

export interface HandoverTemplateSpec {
  id: string
  file: string
  displayName: string
  placeholders: Record<string, HandoverPlaceholderSpec>
}

export class HandoverTemplateMissingError extends Error {
  readonly templateId: string
  readonly templatePath: string
  constructor(templateId: string, templatePath: string) {
    super(
      `Handover-worksheet template "${templateId}" is not yet authored. Drop the .docx at ${templatePath} (with the {TOKEN} placeholders listed in src/lib/dispatch/handoverTemplates.ts) and commit it. The handover generator throws this error until the file exists.`,
    )
    this.name = 'HandoverTemplateMissingError'
    this.templateId = templateId
    this.templatePath = templatePath
  }
}

export const HANDOVER_TEMPLATE: HandoverTemplateSpec = {
  id: 'handover-v1',
  file: 'public/ops-templates/handover-template.docx',
  displayName: 'Kits Handover Worksheet',
  placeholders: {
    SCHOOL_NAME: {
      label: 'School name',
      type: 'text',
      required: true,
      source: 'school.name',
    },
    BRANCH: {
      label: 'Branch / sub-location',
      type: 'text',
      required: false,
      source: 'school.branch',
      description: 'School.legalEntity if it differs from name; else blank.',
    },
    TRAINER_NAMES: {
      label: 'Trainers allocated (free text)',
      type: 'text',
      required: false,
      source: 'computed.trainerNames',
      description: 'Phase 1 ships blank; trainer writes by hand. D-038 captures the Phase 1.1 per-MOU trainer roster lib.',
    },
    DISPATCH_NUMBER: {
      label: 'Dispatch number',
      type: 'text',
      required: true,
      source: 'computed.dispatchNumber',
    },
    DISPATCH_DATE: {
      label: 'Dispatch date',
      type: 'date',
      required: true,
      source: 'arg.now',
    },
    MOU_ID: {
      label: 'MOU reference',
      type: 'text',
      required: true,
      source: 'mou.id',
    },
    PROGRAMME: {
      label: 'Programme',
      type: 'text',
      required: true,
      source: 'mou.programme',
    },
    detailRows: {
      label: 'Detail rows (loop)',
      type: 'loop',
      required: true,
      source: 'computed.detailRows',
      description: 'Loop over rows: { sr, date, time, grades, projects, totalKits, trainerName, trainerSign, personName, designation, personSignature }. Flat lineItems map to 1 row each; per-grade lineItems flatten into N rows (one per gradeAllocation). SR is a continuous 1..N counter across the flattened sequence.',
    },
    TOTAL_QUANTITY: {
      label: 'Total quantity (across all rows)',
      type: 'number',
      required: true,
      source: 'computed.totalQuantity',
      description: 'Matches the dispatch-template TOTAL_QUANTITY semantics for cross-template consistency.',
    },
  },
}
