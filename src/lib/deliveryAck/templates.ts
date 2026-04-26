/*
 * Delivery acknowledgement template registry (Phase D4).
 *
 * Mirrors src/lib/pi/templates.ts and src/lib/dispatch/templates.ts.
 * The handover form layout follows the column structure from
 * ops-data/Regular_Kits_Handover_template.xlsx that Misba and Pradeep
 * use today: KITS HANDOVER WORKSHEET title, school + branch +
 * trainer fields, an items table with Sr / Date / Time / Grades /
 * Projects+Kits / Total Kits columns, and signature blocks for the
 * trainer and the school's responsible person.
 *
 * The .docx lives at public/ops-templates/delivery-ack-template.docx.
 * Until that file exists, generateDeliveryAck returns reason
 * 'template-missing' and the API route surfaces the
 * DeliveryAckTemplateMissingError message.
 */

export type DeliveryAckPlaceholderType =
  | 'date'
  | 'text'
  | 'address'
  | 'loop'
  | 'number'

export type DeliveryAckPlaceholderSource =
  | 'computed.dispatchNumber'
  | 'arg.now'
  | 'mou.id'
  | 'mou.programme'
  | 'mou.programmeSubType'
  | 'mou.studentsActual'
  | 'mou.studentsMou'
  | 'mou.trainerModel'
  | 'school.name'
  | 'school.city'
  | 'school.address'
  | 'company.legalEntity'
  | 'company.gstin'
  | 'company.address'
  | 'computed.installmentLabel'
  | 'computed.kitItems'
  | 'computed.totalKits'

export interface DeliveryAckPlaceholderSpec {
  label: string
  type: DeliveryAckPlaceholderType
  required: boolean
  source: DeliveryAckPlaceholderSource
  description?: string
}

export interface DeliveryAckTemplateSpec {
  id: string
  file: string
  displayName: string
  placeholders: Record<string, DeliveryAckPlaceholderSpec>
}

export class DeliveryAckTemplateMissingError extends Error {
  readonly templateId: string
  readonly templatePath: string
  constructor(templateId: string, templatePath: string) {
    super(
      `Delivery acknowledgement template "${templateId}" is not yet authored. Drop the .docx at ${templatePath} (with the {TOKEN} placeholders listed in src/lib/deliveryAck/templates.ts) and commit it. The delivery-ack generator throws this error until the file exists.`,
    )
    this.name = 'DeliveryAckTemplateMissingError'
    this.templateId = templateId
    this.templatePath = templatePath
  }
}

export const DELIVERY_ACK_TEMPLATE: DeliveryAckTemplateSpec = {
  id: 'delivery-ack-v1',
  file: 'public/ops-templates/delivery-ack-template.docx',
  displayName: 'Delivery Acknowledgement (Kits Handover Worksheet)',
  placeholders: {
    DISPATCH_NUMBER: {
      label: 'Dispatch number',
      type: 'text',
      required: true,
      source: 'computed.dispatchNumber',
      description: 'Format: `DSP-<mouId>-i<seq>` per Dispatch.id.',
    },
    ACK_DATE: {
      label: 'Acknowledgement date',
      type: 'date',
      required: true,
      source: 'arg.now',
      description: 'Date the form is generated (printed for signing).',
    },
    SCHOOL_NAME: {
      label: 'School name',
      type: 'text',
      required: true,
      source: 'school.name',
    },
    BRANCH: {
      label: 'School branch',
      type: 'text',
      required: true,
      source: 'school.city',
      description: 'BRANCH per existing kit-handover form column; sourced from school.city.',
    },
    SCHOOL_ADDRESS: {
      label: 'School address',
      type: 'address',
      required: false,
      source: 'school.address',
    },
    TRAINER_MODE: {
      label: 'Trainer model',
      type: 'text',
      required: false,
      source: 'mou.trainerModel',
      description: 'Bootcamp / GSL-T / TT / Other; empty if not yet set on MOU.',
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
      description: 'docxtemplater loop over rows: { sr, grades, projects, totalKits }. Use {#KIT_ITEMS}...{/KIT_ITEMS} syntax in the .docx. Mirrors the SR / GRADES / NAME OF PROJECTS / TOTAL No. OF KITS columns from Regular_Kits_Handover_template.xlsx.',
    },
    TOTAL_KITS: {
      label: 'Total kits across all rows',
      type: 'number',
      required: true,
      source: 'computed.totalKits',
    },
  },
}
