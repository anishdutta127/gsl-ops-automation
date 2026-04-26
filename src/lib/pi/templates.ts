/*
 * PI template registry (Phase D1).
 *
 * Inherits the typed-registry pattern from gsl-mou-system's
 * src/lib/templates.ts: a placeholder spec per token, with prefill
 * hints that the generator uses to populate values from canonical
 * sources (school + MOU + config/company.json + atomic counter).
 *
 * The .docx template itself is authored separately and dropped at
 * public/ops-templates/pi-template.docx. Until that file exists,
 * generatePi throws TemplateMissingError with a copyable message;
 * the API route surfaces this as a 500 with operator-facing copy.
 */

export type PlaceholderType =
  | 'date'
  | 'text'
  | 'number'
  | 'currency'
  | 'address'
  | 'loop'

export type PlaceholderSource =
  | 'pi-counter'
  | 'mou.programme'
  | 'mou.programmeSubType'
  | 'mou.contractValue'
  | 'mou.spWithoutTax'
  | 'mou.spWithTax'
  | 'mou.studentsActual'
  | 'mou.studentsMou'
  | 'school.name'
  | 'school.legalEntity'
  | 'school.gstNumber'
  | 'school.address'
  | 'company.legalEntity'
  | 'company.gstin'
  | 'company.address'
  | 'company.accountDetails'
  | 'company.paymentTerms'
  | 'computed.subtotal'
  | 'computed.gst'
  | 'computed.total'
  | 'computed.lineItems'
  | 'computed.installmentLabel'
  | 'arg.installmentSeq'
  | 'arg.now'

export interface PlaceholderSpec {
  label: string
  type: PlaceholderType
  required: boolean
  source: PlaceholderSource
  description?: string
}

export interface TemplateSpec {
  id: string
  file: string
  displayName: string
  placeholders: Record<string, PlaceholderSpec>
}

export class TemplateMissingError extends Error {
  readonly templateId: string
  readonly templatePath: string
  constructor(templateId: string, templatePath: string) {
    super(
      `Template "${templateId}" is not yet authored. Drop the .docx at ${templatePath} (with the {{PLACEHOLDER}} tokens listed in src/lib/pi/templates.ts) and commit it. The PI generator throws this error until the file exists.`,
    )
    this.name = 'TemplateMissingError'
    this.templateId = templateId
    this.templatePath = templatePath
  }
}

export const PI_TEMPLATE: TemplateSpec = {
  id: 'pi-v1',
  file: 'public/ops-templates/pi-template.docx',
  displayName: 'Proforma Invoice',
  placeholders: {
    PI_NUMBER: {
      label: 'PI number',
      type: 'text',
      required: true,
      source: 'pi-counter',
      description: 'Issued by atomic counter; format `<prefix>/<fiscal>/<seq>` e.g. `GSL/OPS/26-27/0001`.',
    },
    PI_DATE: {
      label: 'PI date',
      type: 'date',
      required: true,
      source: 'arg.now',
      description: 'Generation date in DD-MMM-YYYY format.',
    },
    SCHOOL_NAME: {
      label: 'School name',
      type: 'text',
      required: true,
      source: 'school.name',
    },
    SCHOOL_GSTIN: {
      label: 'School GSTIN',
      type: 'text',
      required: true,
      source: 'school.gstNumber',
      description: 'PI generation blocks with 409 if the school has gstNumber === null.',
    },
    SCHOOL_ADDRESS: {
      label: 'School address (multi-line)',
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
      label: 'GSL address (multi-line)',
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
      description: 'Empty string when MOU.programmeSubType is null (e.g., GSLT-Cretile renders here when set).',
    },
    LINE_ITEMS: {
      label: 'Line items table (loop)',
      type: 'loop',
      required: true,
      source: 'computed.lineItems',
      description: 'docxtemplater loop over rows: { description, students, rate, amount }. Use `{#LINE_ITEMS}...{/LINE_ITEMS}` syntax in the .docx.',
    },
    SUBTOTAL: {
      label: 'Subtotal',
      type: 'currency',
      required: true,
      source: 'computed.subtotal',
      description: 'Pre-tax total formatted as Indian-comma-grouped Rupees.',
    },
    GST_AMOUNT: {
      label: 'GST amount',
      type: 'currency',
      required: true,
      source: 'computed.gst',
      description: '18% GST on subtotal.',
    },
    TOTAL: {
      label: 'Total',
      type: 'currency',
      required: true,
      source: 'computed.total',
      description: 'Subtotal + GST, Indian-comma-grouped.',
    },
    INSTALLMENT_LABEL: {
      label: 'Installment label',
      type: 'text',
      required: true,
      source: 'computed.installmentLabel',
      description: 'e.g., "Installment 1 of 4". Computed from MOU.paymentSchedule + arg.installmentSeq.',
    },
    PAYMENT_TERMS: {
      label: 'Payment terms',
      type: 'text',
      required: true,
      source: 'company.paymentTerms',
    },
    ACCOUNT_DETAILS: {
      label: 'Account details (multi-line)',
      type: 'address',
      required: true,
      source: 'company.accountDetails',
    },
  },
}
