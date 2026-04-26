/*
 * Dispatch template registry (Phase D2).
 *
 * Mirrors src/lib/pi/templates.ts pattern. The dispatch note is a
 * standard Indian dispatch / consignment note tying the GSL bill-from
 * identity to the school's ship-to, listing kit items, and capturing
 * any P2 override note (when dispatch is pre-payment authorised).
 *
 * The .docx lives at public/ops-templates/dispatch-template.docx.
 * Until that file exists, raiseDispatch returns reason
 * 'template-missing' and the API route surfaces the
 * TemplateMissingError message.
 */

export type DispatchPlaceholderType =
  | 'date'
  | 'text'
  | 'address'
  | 'loop'
  | 'number'

export type DispatchPlaceholderSource =
  | 'computed.dispatchNumber'
  | 'arg.now'
  | 'mou.id'
  | 'mou.programme'
  | 'mou.programmeSubType'
  | 'mou.studentsActual'
  | 'mou.studentsMou'
  | 'school.name'
  | 'school.address'
  | 'company.legalEntity'
  | 'company.gstin'
  | 'company.address'
  | 'computed.installmentLabel'
  | 'computed.kitItems'
  | 'computed.totalKits'
  | 'computed.dispatchNotes'
  | 'arg.raisedByName'

export interface DispatchPlaceholderSpec {
  label: string
  type: DispatchPlaceholderType
  required: boolean
  source: DispatchPlaceholderSource
  description?: string
}

export interface DispatchTemplateSpec {
  id: string
  file: string
  displayName: string
  placeholders: Record<string, DispatchPlaceholderSpec>
}

export class DispatchTemplateMissingError extends Error {
  readonly templateId: string
  readonly templatePath: string
  constructor(templateId: string, templatePath: string) {
    super(
      `Dispatch template "${templateId}" is not yet authored. Drop the .docx at ${templatePath} (with the {TOKEN} placeholders listed in src/lib/dispatch/templates.ts) and commit it. The dispatch generator throws this error until the file exists.`,
    )
    this.name = 'DispatchTemplateMissingError'
    this.templateId = templateId
    this.templatePath = templatePath
  }
}

export const DISPATCH_TEMPLATE: DispatchTemplateSpec = {
  id: 'dispatch-v1',
  file: 'public/ops-templates/dispatch-template.docx',
  displayName: 'Dispatch Note',
  placeholders: {
    DISPATCH_NUMBER: {
      label: 'Dispatch number',
      type: 'text',
      required: true,
      source: 'computed.dispatchNumber',
      description: 'Format: `DSP-<mouId>-i<seq>` derived from the Dispatch.id.',
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
    SCHOOL_NAME: {
      label: 'Ship-to school name',
      type: 'text',
      required: true,
      source: 'school.name',
    },
    SCHOOL_ADDRESS: {
      label: 'Ship-to address',
      type: 'address',
      required: true,
      source: 'school.address',
    },
    GSL_LEGAL_ENTITY: {
      label: 'GSL legal entity',
      type: 'text',
      required: true,
      source: 'company.legalEntity',
    },
    GSL_GSTIN: {
      label: 'GSL GSTIN',
      type: 'text',
      required: true,
      source: 'company.gstin',
    },
    GSL_ADDRESS: {
      label: 'GSL address',
      type: 'address',
      required: true,
      source: 'company.address',
    },
    PROGRAMME: {
      label: 'Programme',
      type: 'text',
      required: true,
      source: 'mou.programme',
    },
    PROGRAMME_SUB_TYPE: {
      label: 'Programme sub-type',
      type: 'text',
      required: false,
      source: 'mou.programmeSubType',
    },
    INSTALLMENT_LABEL: {
      label: 'Instalment label',
      type: 'text',
      required: true,
      source: 'computed.installmentLabel',
    },
    KIT_ITEMS: {
      label: 'Kit items table (loop)',
      type: 'loop',
      required: true,
      source: 'computed.kitItems',
      description: 'docxtemplater loop over rows: { description, quantity, grades }. Use {#KIT_ITEMS}...{/KIT_ITEMS} syntax in the .docx.',
    },
    TOTAL_KITS: {
      label: 'Total kits',
      type: 'number',
      required: true,
      source: 'computed.totalKits',
    },
    NOTES: {
      label: 'Dispatch notes',
      type: 'text',
      required: false,
      source: 'computed.dispatchNotes',
      description: 'Combines dispatch.notes (operator-entered) with the override-event reason if dispatch is under P2 override. Empty string if no notes apply.',
    },
    AUTHORISED_BY: {
      label: 'Authorised by',
      type: 'text',
      required: true,
      source: 'arg.raisedByName',
      description: 'Name of the user who raised the dispatch.',
    },
  },
}
