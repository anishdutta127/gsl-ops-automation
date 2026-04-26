/*
 * Delivery acknowledgement BLANK template generation (Phase D4).
 *
 * Pure render: takes a Dispatch + MOU + School context, fills the
 * docxtemplater placeholders, returns the .docx bytes. No state
 * mutation, no audit entry. Operators print the rendered form,
 * carry it to the school, get it stamped + signed by the SPOC,
 * then upload the scan/photo to GSL Drive (or equivalent) and
 * paste the URL into acknowledgeDispatch.
 *
 * The signature blocks in the rendered .docx are blank pre-print
 * (handwritten when delivered). The body fields (school name,
 * branch, programme, kits, etc.) are pre-filled from the dispatch
 * context so the form is school-specific even before signing.
 *
 * Permission gate: 'mou:upload-delivery-ack' (Admin + OpsHead per
 * the existing matrix). Same gate for both halves of the flow
 * (template generation and acknowledgement) so a single role can
 * complete the whole loop.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import type {
  Dispatch,
  MOU,
  School,
  User,
} from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import companyJson from '../../../config/company.json'
import { canPerform } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/format'
import {
  DELIVERY_ACK_TEMPLATE,
  DeliveryAckTemplateMissingError,
} from './templates'

interface CompanyConfig {
  legalEntity: string
  gstin: string
  address: string[]
}

const ELIGIBLE_STAGES_FOR_GENERATION: ReadonlyArray<Dispatch['stage']> = [
  'po-raised',
  'dispatched',
  'in-transit',
  'delivered',
  'acknowledged',
]

export interface GenerateDeliveryAckArgs {
  dispatchId: string
  generatedBy: string
}

export type GenerateDeliveryAckFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'dispatch-not-found'
  | 'mou-not-found'
  | 'school-not-found'
  | 'wrong-stage'
  | 'template-missing'

export type GenerateDeliveryAckResult =
  | {
      ok: true
      dispatch: Dispatch
      docxBytes: Uint8Array
    }
  | {
      ok: false
      reason: GenerateDeliveryAckFailureReason
      templateError?: DeliveryAckTemplateMissingError
    }

export interface GenerateDeliveryAckDeps {
  dispatches: Dispatch[]
  mous: MOU[]
  schools: School[]
  users: User[]
  company: CompanyConfig
  loadTemplate: (templatePath: string) => Promise<Uint8Array>
  now: () => Date
}

const defaultLoadTemplate = async (templatePath: string): Promise<Uint8Array> => {
  const fullPath = path.join(process.cwd(), templatePath)
  try {
    return await readFile(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DeliveryAckTemplateMissingError(
        DELIVERY_ACK_TEMPLATE.id,
        DELIVERY_ACK_TEMPLATE.file,
      )
    }
    throw err
  }
}

const defaultDeps: GenerateDeliveryAckDeps = {
  dispatches: dispatchesJson as unknown as Dispatch[],
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  company: companyJson as CompanyConfig,
  loadTemplate: defaultLoadTemplate,
  now: () => new Date(),
}

interface KitItem {
  sr: number
  grades: string
  projects: string
  totalKits: number
}

function totalInstallments(paymentSchedule: string): number {
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

function buildKitItems(mou: MOU): { items: KitItem[]; total: number } {
  const total = mou.studentsActual ?? mou.studentsMou
  const subtype = mou.programmeSubType ? ` (${mou.programmeSubType})` : ''
  return {
    items: [
      {
        sr: 1,
        grades: 'Per programme rollout plan',
        projects: `${mou.programme}${subtype} kit set`,
        totalKits: total,
      },
    ],
    total,
  }
}

export async function generateDeliveryAck(
  args: GenerateDeliveryAckArgs,
  deps: GenerateDeliveryAckDeps = defaultDeps,
): Promise<GenerateDeliveryAckResult> {
  const user = deps.users.find((u) => u.id === args.generatedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:upload-delivery-ack')) {
    return { ok: false, reason: 'permission' }
  }

  const dispatch = deps.dispatches.find((d) => d.id === args.dispatchId)
  if (!dispatch) return { ok: false, reason: 'dispatch-not-found' }
  if (!ELIGIBLE_STAGES_FOR_GENERATION.includes(dispatch.stage)) {
    return { ok: false, reason: 'wrong-stage' }
  }

  const mou = deps.mous.find((m) => m.id === dispatch.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const school = deps.schools.find((s) => s.id === dispatch.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  const ts = deps.now().toISOString()
  const totalInsts = totalInstallments(mou.paymentSchedule)
  const { items, total } = buildKitItems(mou)

  const placeholderBag = {
    DISPATCH_NUMBER: dispatch.id,
    ACK_DATE: formatDate(ts),
    SCHOOL_NAME: school.name,
    BRANCH: school.city,
    SCHOOL_ADDRESS: [
      school.legalEntity ?? school.name,
      `${school.city}, ${school.state}`,
      school.pinCode ?? '',
    ].filter((s) => s !== '').join('\n'),
    TRAINER_MODE: mou.trainerModel ?? '',
    GSL_LEGAL_ENTITY: deps.company.legalEntity,
    GSL_GSTIN: deps.company.gstin,
    GSL_ADDRESS: deps.company.address.join('\n'),
    PROGRAMME: mou.programme,
    PROGRAMME_SUB_TYPE: mou.programmeSubType ?? '',
    INSTALLMENT_LABEL: `Instalment ${dispatch.installmentSeq} of ${totalInsts}`,
    KIT_ITEMS: items.map((k) => ({
      sr: String(k.sr),
      grades: k.grades,
      projects: k.projects,
      totalKits: String(k.totalKits),
    })),
    TOTAL_KITS: String(total),
  }

  let docxBytes: Uint8Array
  try {
    const templateBytes = await deps.loadTemplate(DELIVERY_ACK_TEMPLATE.file)
    const zip = new PizZip(templateBytes)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(placeholderBag)
    const out = doc.getZip().generate({ type: 'uint8array' })
    docxBytes = out as unknown as Uint8Array
  } catch (err) {
    if (err instanceof DeliveryAckTemplateMissingError) {
      return { ok: false, reason: 'template-missing', templateError: err }
    }
    throw err
  }

  return { ok: true, dispatch, docxBytes }
}
