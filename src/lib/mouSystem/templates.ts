/*
 * MOU template registry.
 *
 * Phase 3 Step 4 simplified the body of every generated MOU to just
 * Effective Date + School Name + Duration + Standard Billing Section,
 * with Annexure A holding all commercial terms. The body is rendered
 * deterministically by lib/mouDoc.ts using the `docx` library so the
 * GSL+AMG header logo appears on every download regardless of template.
 *
 * The placeholder catalogue below describes what the Generator wizard
 * collects from the user. Programme-specific Annexure fields stay; the
 * shared Phase 3 fields (sales channel, sales rep, school CRM id,
 * trainer model, multi-year payment schedule, billing block) are
 * captured separately on the form and persisted on the MOU record.
 *
 * Three programmes have MOUs:
 *   - STEAM-v3   STEAM / Robotics MOU
 *   - YP-v3      Young Pioneers (Cambridge)
 *   - HBPE-v3    Harvard HBPE
 *
 * VEX has no MOU (per accounts team); see /vex for the kit ordering flow.
 */

import type { Programme } from './types'

export type PlaceholderType =
  | 'date'
  | 'text'
  | 'number'
  | 'currency'
  | 'schedule'
  | 'annexure'

export type PlaceholderSection = 'main' | 'annexure'

export interface PlaceholderSpec {
  label: string
  type: PlaceholderType
  required: boolean
  section: PlaceholderSection
  placeholder?: string
  default?: string
  minAcceptable?: number
  prefillFrom?: 'school.legalEntity' | 'school.name' | 'school.pan' | 'school.gstNumber' | 'school.city' | 'school.state'
}

export interface TemplateSpec {
  id: string
  file: string
  displayName: string
  programme: Programme
  placeholders: Record<string, PlaceholderSpec>
  rateCardVariant?: string
}

const COMMON_MAIN: Record<string, PlaceholderSpec> = {
  EFFECTIVE_DATE: { label: 'Effective date', type: 'date', required: true, section: 'main' },
  TRUST_NAME: {
    label: 'Trust / legal entity',
    type: 'text',
    required: true,
    section: 'main',
    prefillFrom: 'school.legalEntity',
  },
  SCHOOL_NAME: {
    label: 'School name',
    type: 'text',
    required: true,
    section: 'main',
    prefillFrom: 'school.name',
  },
  SCHOOL_CITY: {
    label: 'City',
    type: 'text',
    required: true,
    section: 'main',
    prefillFrom: 'school.city',
  },
  SCHOOL_STATE: {
    label: 'State',
    type: 'text',
    required: true,
    section: 'main',
    prefillFrom: 'school.state',
  },
  SCHOOL_PAN: {
    label: 'School PAN',
    type: 'text',
    required: false,
    section: 'main',
    prefillFrom: 'school.pan',
  },
  SCHOOL_GST: {
    label: 'School GSTIN',
    type: 'text',
    required: false,
    section: 'main',
    prefillFrom: 'school.gstNumber',
  },
  // Phase 3 Step 4: Start/End drive Number of Years; Duration string is
  // shown on the .docx but derived rather than user-entered.
  START_DATE: { label: 'Start date', type: 'date', required: true, section: 'main' },
  END_DATE: { label: 'End date', type: 'date', required: true, section: 'main' },
}

export const TEMPLATES: Record<string, TemplateSpec> = {
  'STEAM-v3': {
    id: 'STEAM-v3',
    file: 'public/mou-templates/STEAM-v2.1.docx',
    displayName: 'STEAM / Robotics MOU',
    programme: 'STEAM',
    rateCardVariant: 'Kit 1:4 ratio',
    placeholders: {
      ...COMMON_MAIN,
      STUDENT_COUNT: {
        label: 'Students committed',
        type: 'number',
        required: true,
        section: 'annexure',
      },
      PRICE_PER_STUDENT: {
        label: 'Price per student (incl. GST)',
        type: 'currency',
        required: true,
        section: 'annexure',
        minAcceptable: 2500,
      },
      DISCOUNT: {
        label: 'Discount',
        type: 'currency',
        required: false,
        section: 'annexure',
        default: 'Nil',
      },
    },
  },
  'YP-v3': {
    id: 'YP-v3',
    file: 'public/mou-templates/YP-v2.1.docx',
    displayName: 'Young Pioneers (Cambridge) MOU',
    programme: 'Young Pioneers',
    rateCardVariant: 'Beginners (Cambridge)',
    placeholders: {
      ...COMMON_MAIN,
      STUDENT_COUNT: {
        label: 'Students committed',
        type: 'number',
        required: true,
        section: 'annexure',
      },
      PRICE_PER_STUDENT: {
        label: 'Price per student (incl. GST)',
        type: 'currency',
        required: true,
        section: 'annexure',
        minAcceptable: 1800,
      },
      BOOK_SET: {
        label: 'Book set',
        type: 'text',
        required: true,
        section: 'annexure',
        default: 'Cambridge YP Beginners',
      },
    },
  },
  'HBPE-v3': {
    id: 'HBPE-v3',
    file: 'public/mou-templates/HBPE-v2.1.docx',
    displayName: 'Harvard HBPE MOU',
    programme: 'Harvard HBPE',
    rateCardVariant: 'HBPE Digital + In-person',
    placeholders: {
      ...COMMON_MAIN,
      STUDENT_COUNT: {
        label: 'Students committed',
        type: 'number',
        required: true,
        section: 'annexure',
      },
      PRICE_PER_STUDENT: {
        label: 'Price per student (incl. GST)',
        type: 'currency',
        required: true,
        section: 'annexure',
        minAcceptable: 4500,
      },
      COURSE_MODULES: {
        label: 'Course modules',
        type: 'text',
        required: true,
        section: 'annexure',
      },
    },
  },
}

export function listTemplates(): TemplateSpec[] {
  return Object.values(TEMPLATES)
}

export function getTemplate(id: string): TemplateSpec | undefined {
  // Honour the legacy v2.1 ids by aliasing them to the v3 templates
  // so saved drafts from before Phase 3 still resolve.
  if (TEMPLATES[id]) return TEMPLATES[id]
  const aliased = id.replace(/-v2\.1$/, '-v3')
  return TEMPLATES[aliased]
}

export const SALES_CHANNELS = [
  'School Programs (Course)',
  'Bootcamps',
  'Workshop',
  'Partnerships - Govt Projects',
  'Others',
] as const

export type SalesChannel = (typeof SALES_CHANNELS)[number]

export const TRAINER_MODELS = [
  { value: 'TTT', label: 'Train the Trainer (TTT)' },
  { value: 'GSL-T', label: 'Train the students (GSL Trainer)' },
] as const

export type TrainerModelV3 = (typeof TRAINER_MODELS)[number]['value']
